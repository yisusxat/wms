CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE public.location_status AS ENUM ('AVAILABLE', 'OCCUPIED', 'BLOCKED', 'MAINTENANCE');
CREATE TYPE public.movement_type AS ENUM ('RECEIPT', 'ISSUE', 'TRANSFER', 'ADJUSTMENT');
CREATE TYPE public.user_role AS ENUM ('ADMIN', 'SUPERVISOR', 'OPERATOR', 'VIEWER');

CREATE TABLE public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT,
  temperature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (warehouse_id, code)
);

CREATE TABLE public.aisles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES public.zones(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (zone_id, code)
);

CREATE TABLE public.racks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aisle_id UUID NOT NULL REFERENCES public.aisles(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  rack_type TEXT NOT NULL,
  levels INTEGER NOT NULL CHECK (levels > 0),
  positions INTEGER NOT NULL CHECK (positions > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (aisle_id, code)
);

CREATE TABLE public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rack_id UUID NOT NULL REFERENCES public.racks(id),
  code TEXT NOT NULL UNIQUE,
  level INTEGER NOT NULL CHECK (level > 0),
  position INTEGER NOT NULL CHECK (position > 0),
  status public.location_status NOT NULL DEFAULT 'AVAILABLE',
  width NUMERIC(10, 2),
  depth NUMERIC(10, 2),
  height NUMERIC(10, 2),
  max_weight NUMERIC(10, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rack_id, level, position)
);

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  barcode TEXT UNIQUE,
  unit TEXT NOT NULL,
  category TEXT,
  brand TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role public.user_role NOT NULL DEFAULT 'OPERATOR',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id),
  location_id UUID NOT NULL REFERENCES public.locations(id),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, location_id),
  CHECK (reserved_quantity <= quantity)
);

CREATE TABLE public.movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.movement_type NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  source_location_id UUID REFERENCES public.locations(id),
  destination_location_id UUID REFERENCES public.locations(id),
  reference TEXT,
  reason TEXT,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (source_location_id IS NOT NULL OR destination_location_id IS NOT NULL)
);

CREATE INDEX zones_warehouse_id_idx ON public.zones(warehouse_id);
CREATE INDEX aisles_zone_id_idx ON public.aisles(zone_id);
CREATE INDEX racks_aisle_id_idx ON public.racks(aisle_id);
CREATE INDEX locations_rack_id_idx ON public.locations(rack_id);
CREATE INDEX locations_status_idx ON public.locations(status);
CREATE INDEX products_name_idx ON public.products(name);
CREATE INDEX inventory_product_id_idx ON public.inventory(product_id);
CREATE INDEX inventory_location_id_idx ON public.inventory(location_id);
CREATE INDEX movements_product_id_idx ON public.movements(product_id);
CREATE INDEX movements_created_at_idx ON public.movements(created_at);
CREATE INDEX movements_type_idx ON public.movements(type);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER warehouses_set_updated_at BEFORE UPDATE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER zones_set_updated_at BEFORE UPDATE ON public.zones FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER aisles_set_updated_at BEFORE UPDATE ON public.aisles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER racks_set_updated_at BEFORE UPDATE ON public.racks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER locations_set_updated_at BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER inventory_set_updated_at BEFORE UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.refresh_location_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.locations
  SET status = CASE
    WHEN status IN ('BLOCKED', 'MAINTENANCE') THEN status
    WHEN EXISTS (
      SELECT 1 FROM public.inventory i
      WHERE i.location_id = COALESCE(NEW.location_id, OLD.location_id)
        AND i.quantity > 0
    ) THEN 'OCCUPIED'::public.location_status
    ELSE 'AVAILABLE'::public.location_status
  END
  WHERE id = COALESCE(NEW.location_id, OLD.location_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER inventory_refresh_location_status
AFTER INSERT OR UPDATE OR DELETE ON public.inventory
FOR EACH ROW EXECUTE FUNCTION public.refresh_location_status();

CREATE OR REPLACE FUNCTION public.wms_receive_stock(
  p_product_id UUID,
  p_location_id UUID,
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
  v_status public.location_status;
BEGIN
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'quantity must be greater than zero'; END IF;
  SELECT status INTO v_status FROM public.locations WHERE id = p_location_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'location not found'; END IF;
  IF v_status IN ('BLOCKED', 'MAINTENANCE') THEN RAISE EXCEPTION 'location is not available'; END IF;
  PERFORM 1 FROM public.products WHERE id = p_product_id AND active = TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'product not found or inactive'; END IF;

  INSERT INTO public.inventory (product_id, location_id, quantity)
  VALUES (p_product_id, p_location_id, p_quantity)
  ON CONFLICT (product_id, location_id)
  DO UPDATE SET quantity = public.inventory.quantity + EXCLUDED.quantity;

  INSERT INTO public.movements (type, product_id, quantity, destination_location_id, reason, user_id, reference)
  VALUES ('RECEIPT', p_product_id, p_quantity, p_location_id, p_reason, p_user_id, p_reference)
  RETURNING id INTO v_movement_id;
  RETURN v_movement_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.wms_issue_stock(
  p_product_id UUID,
  p_location_id UUID,
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
BEGIN
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'quantity must be greater than zero'; END IF;
  SELECT quantity - reserved_quantity INTO v_available
  FROM public.inventory
  WHERE product_id = p_product_id AND location_id = p_location_id
  FOR UPDATE;
  IF NOT FOUND OR v_available < p_quantity THEN RAISE EXCEPTION 'insufficient stock'; END IF;

  UPDATE public.inventory
  SET quantity = quantity - p_quantity
  WHERE product_id = p_product_id AND location_id = p_location_id;

  INSERT INTO public.movements (type, product_id, quantity, source_location_id, reason, user_id, reference)
  VALUES ('ISSUE', p_product_id, p_quantity, p_location_id, p_reason, p_user_id, p_reference)
  RETURNING id INTO v_movement_id;
  RETURN v_movement_id;
END;
$$;

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
  SELECT status INTO v_source_status FROM public.locations WHERE id = p_source_location_id FOR UPDATE;
  SELECT status INTO v_destination_status FROM public.locations WHERE id = p_destination_location_id FOR UPDATE;
  IF v_source_status IS NULL OR v_destination_status IS NULL THEN RAISE EXCEPTION 'location not found'; END IF;
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

REVOKE UPDATE, DELETE ON public.movements FROM authenticated;
GRANT SELECT, INSERT ON public.movements TO authenticated;
