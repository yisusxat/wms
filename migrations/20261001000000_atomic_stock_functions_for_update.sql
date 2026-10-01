-- ============================================================
-- Fase 1: Funciones de stock con bloqueo pesimista (SELECT FOR UPDATE)
-- Elimina race conditions en operaciones concurrentes de inventario
-- ============================================================

-- v2 de issue_stock con FOR UPDATE NOWAIT
CREATE OR REPLACE FUNCTION public.wms_issue_stock_v2(
  p_product_id UUID,
  p_location_id UUID,
  p_quantity INT,
  p_reason TEXT,
  p_user_id UUID,
  p_reference TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_inventory inventory%ROWTYPE;
  v_movement_id UUID;
BEGIN
  -- Bloquear la fila de inventario (ningún otro proceso puede leerla hasta COMMIT)
  SELECT * INTO v_inventory
  FROM inventory
  WHERE product_id = p_product_id
    AND location_id = p_location_id
  FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock no encontrado para producto % en ubicación %',
      p_product_id, p_location_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_inventory.quantity < p_quantity THEN
    RAISE EXCEPTION 'Stock insuficiente: disponible=%, solicitado=%',
      v_inventory.quantity, p_quantity
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE inventory
  SET quantity   = quantity - p_quantity,
      updated_at = NOW()
  WHERE product_id = p_product_id
    AND location_id = p_location_id;

  INSERT INTO movements (
    id, type, product_id, quantity,
    source_location_id, reason, user_id, reference, created_at
  ) VALUES (
    gen_random_uuid(), 'ISSUE', p_product_id, p_quantity,
    p_location_id, p_reason, p_user_id, p_reference, NOW()
  ) RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.wms_issue_stock_v2(UUID,UUID,INT,TEXT,UUID,TEXT) TO authenticated;

-- v2 de transfer_stock con orden determinístico de bloqueo (previene deadlock)
CREATE OR REPLACE FUNCTION public.wms_transfer_stock_v2(
  p_product_id UUID,
  p_src        UUID,
  p_dst        UUID,
  p_quantity   INT,
  p_reason     TEXT,
  p_user_id    UUID,
  p_reference  TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_inv_src inventory%ROWTYPE;
  v_movement_id UUID;
BEGIN
  -- Orden determinístico: bloquear siempre el UUID menor primero
  -- Evita deadlock en transferencias cruzadas simultáneas A->B y B->A
  IF p_src < p_dst THEN
    SELECT * INTO v_inv_src FROM inventory
      WHERE product_id = p_product_id AND location_id = p_src FOR UPDATE NOWAIT;
    PERFORM * FROM inventory
      WHERE product_id = p_product_id AND location_id = p_dst FOR UPDATE NOWAIT;
  ELSE
    PERFORM * FROM inventory
      WHERE product_id = p_product_id AND location_id = p_dst FOR UPDATE NOWAIT;
    SELECT * INTO v_inv_src FROM inventory
      WHERE product_id = p_product_id AND location_id = p_src FOR UPDATE NOWAIT;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventario de origen no encontrado para producto % en ubicación %',
      p_product_id, p_src USING ERRCODE = 'P0002';
  END IF;

  IF v_inv_src.quantity < p_quantity THEN
    RAISE EXCEPTION 'Stock insuficiente para transferencia: disponible=%, solicitado=%',
      v_inv_src.quantity, p_quantity USING ERRCODE = 'P0001';
  END IF;

  UPDATE inventory
  SET quantity   = quantity - p_quantity,
      updated_at = NOW()
  WHERE product_id = p_product_id
    AND location_id = p_src;

  INSERT INTO inventory (
    id, product_id, location_id, quantity, reserved_quantity, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_product_id, p_dst, p_quantity, 0, NOW(), NOW()
  ) ON CONFLICT (product_id, location_id)
    DO UPDATE SET quantity   = inventory.quantity + EXCLUDED.quantity,
                 updated_at = NOW();

  INSERT INTO movements (
    id, type, product_id, quantity,
    source_location_id, destination_location_id,
    reason, user_id, reference, created_at
  ) VALUES (
    gen_random_uuid(), 'TRANSFER', p_product_id, p_quantity,
    p_src, p_dst, p_reason, p_user_id, p_reference, NOW()
  ) RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.wms_transfer_stock_v2(UUID,UUID,UUID,INT,TEXT,UUID,TEXT) TO authenticated;

-- v2 de receive_stock con bloqueo en INSERT/UPDATE de inventario
CREATE OR REPLACE FUNCTION public.wms_receive_stock_v2(
  p_product_id  UUID,
  p_location_id UUID,
  p_quantity    INT,
  p_reason      TEXT,
  p_user_id     UUID,
  p_reference   TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_movement_id UUID;
BEGIN
  -- Para recepciones usamos INSERT ... ON CONFLICT con advisory lock por ubicación
  PERFORM pg_advisory_xact_lock(hashtext(p_location_id::text || p_product_id::text));

  INSERT INTO inventory (
    id, product_id, location_id, quantity, reserved_quantity, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_product_id, p_location_id, p_quantity, 0, NOW(), NOW()
  ) ON CONFLICT (product_id, location_id)
    DO UPDATE SET quantity   = inventory.quantity + EXCLUDED.quantity,
                 updated_at = NOW();

  INSERT INTO movements (
    id, type, product_id, quantity,
    destination_location_id, reason, user_id, reference, created_at
  ) VALUES (
    gen_random_uuid(), 'RECEIPT', p_product_id, p_quantity,
    p_location_id, p_reason, p_user_id, p_reference, NOW()
  ) RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.wms_receive_stock_v2(UUID,UUID,INT,TEXT,UUID,TEXT) TO authenticated;
