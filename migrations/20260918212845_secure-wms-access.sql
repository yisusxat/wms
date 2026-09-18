ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aisles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.racks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movements ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO authenticated;

REVOKE ALL ON public.warehouses, public.zones, public.aisles, public.racks,
  public.locations, public.products, public.user_profiles, public.inventory,
  public.movements FROM anon, authenticated;

GRANT SELECT ON public.warehouses, public.zones, public.aisles, public.racks,
  public.locations, public.products, public.inventory, public.movements
  TO authenticated;
GRANT SELECT ON public.user_profiles TO authenticated;

CREATE POLICY "authenticated can read warehouses"
  ON public.warehouses FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "authenticated can read zones"
  ON public.zones FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "authenticated can read aisles"
  ON public.aisles FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "authenticated can read racks"
  ON public.racks FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "authenticated can read locations"
  ON public.locations FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "authenticated can read products"
  ON public.products FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "authenticated can read inventory"
  ON public.inventory FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "authenticated can read movements"
  ON public.movements FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "users can read their profile"
  ON public.user_profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

ALTER TABLE public.movements
  DROP CONSTRAINT IF EXISTS movements_check,
  ADD CONSTRAINT movements_type_locations_check CHECK (
    (type = 'RECEIPT' AND source_location_id IS NULL AND destination_location_id IS NOT NULL)
    OR (type = 'ISSUE' AND source_location_id IS NOT NULL AND destination_location_id IS NULL)
    OR (type = 'TRANSFER' AND source_location_id IS NOT NULL AND destination_location_id IS NOT NULL)
    OR (type = 'ADJUSTMENT' AND (source_location_id IS NOT NULL OR destination_location_id IS NOT NULL))
  );

ALTER TABLE public.products
  ADD CONSTRAINT products_sku_length_check CHECK (char_length(sku) BETWEEN 1 AND 80),
  ADD CONSTRAINT products_name_length_check CHECK (char_length(name) BETWEEN 1 AND 200),
  ADD CONSTRAINT products_unit_length_check CHECK (char_length(unit) BETWEEN 1 AND 40);

ALTER TABLE public.locations
  ADD CONSTRAINT locations_code_length_check CHECK (char_length(code) BETWEEN 1 AND 80);

CREATE OR REPLACE FUNCTION public.wms_transfer_stock(
  p_product_id UUID,
  p_source_location_id UUID,
  p_destination_location_id UUID,
  p_quantity INTEGER,
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
  v_source_status public.location_status;
  v_destination_status public.location_status;
BEGIN
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'quantity must be greater than zero'; END IF;
  IF p_source_location_id = p_destination_location_id THEN RAISE EXCEPTION 'source and destination must differ'; END IF;

  SELECT status INTO v_source_status
  FROM public.locations WHERE id = p_source_location_id FOR UPDATE;
  SELECT status INTO v_destination_status
  FROM public.locations WHERE id = p_destination_location_id FOR UPDATE;
  IF v_source_status IS NULL OR v_destination_status IS NULL THEN RAISE EXCEPTION 'location not found'; END IF;
  IF v_source_status IN ('BLOCKED', 'MAINTENANCE') THEN RAISE EXCEPTION 'source is not available'; END IF;
  IF v_destination_status IN ('BLOCKED', 'MAINTENANCE') THEN RAISE EXCEPTION 'destination is not available'; END IF;

  SELECT quantity - reserved_quantity INTO v_available
  FROM public.inventory
  WHERE product_id = p_product_id AND location_id = p_source_location_id
  FOR UPDATE;
  IF NOT FOUND OR v_available < p_quantity THEN RAISE EXCEPTION 'insufficient stock'; END IF;

  UPDATE public.inventory SET quantity = quantity - p_quantity
  WHERE product_id = p_product_id AND location_id = p_source_location_id;
  INSERT INTO public.inventory (product_id, location_id, quantity)
  VALUES (p_product_id, p_destination_location_id, p_quantity)
  ON CONFLICT (product_id, location_id)
  DO UPDATE SET quantity = public.inventory.quantity + EXCLUDED.quantity;

  INSERT INTO public.movements (type, product_id, quantity, source_location_id, destination_location_id, reason, user_id, reference)
  VALUES ('TRANSFER', p_product_id, p_quantity, p_source_location_id, p_destination_location_id, p_reason, p_user_id, p_reference)
  RETURNING id INTO v_movement_id;
  RETURN v_movement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.wms_receive_stock(UUID, UUID, INTEGER, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wms_issue_stock(UUID, UUID, INTEGER, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wms_transfer_stock(UUID, UUID, UUID, INTEGER, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.movements FROM anon, authenticated;
