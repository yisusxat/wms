-- Adds an auditable, atomic stock adjustment operation.
CREATE OR REPLACE FUNCTION public.wms_adjust_stock(
  p_product_id UUID,
  p_location_id UUID,
  p_delta INTEGER,
  p_reason TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_reference TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_movement_id UUID;
  v_available INTEGER;
  v_status public.location_status;
  v_quantity INTEGER;
BEGIN
  IF p_delta = 0 THEN RAISE EXCEPTION 'adjustment delta must not be zero'; END IF;
  SELECT status INTO v_status FROM public.locations WHERE id = p_location_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'location not found'; END IF;
  IF v_status IN ('BLOCKED', 'MAINTENANCE') THEN RAISE EXCEPTION 'location is not available'; END IF;
  PERFORM 1 FROM public.products WHERE id = p_product_id AND active = TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'product not found or inactive'; END IF;

  IF p_delta < 0 THEN
    SELECT quantity - reserved_quantity INTO v_available
    FROM public.inventory
    WHERE product_id = p_product_id AND location_id = p_location_id
    FOR UPDATE;
    IF NOT FOUND OR v_available < abs(p_delta) THEN RAISE EXCEPTION 'insufficient stock'; END IF;
  END IF;

  INSERT INTO public.inventory (product_id, location_id, quantity)
  VALUES (p_product_id, p_location_id, greatest(p_delta, 0))
  ON CONFLICT (product_id, location_id)
  DO UPDATE SET quantity = public.inventory.quantity + p_delta;

  v_quantity := abs(p_delta);
  INSERT INTO public.movements (type, product_id, quantity,
    source_location_id, destination_location_id, reason, user_id, reference)
  VALUES ('ADJUSTMENT', p_product_id, v_quantity,
    CASE WHEN p_delta < 0 THEN p_location_id ELSE NULL END,
    CASE WHEN p_delta > 0 THEN p_location_id ELSE NULL END,
    p_reason, p_user_id, p_reference)
  RETURNING id INTO v_movement_id;
  RETURN v_movement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.wms_adjust_stock(UUID, UUID, INTEGER, TEXT, UUID, TEXT)
FROM PUBLIC, anon, authenticated;
