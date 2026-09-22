-- Migration: Overload WMS stock movement SQL functions to support BIGINT arguments
-- Fixes PostgreSQL error 42883 when Prisma or clients bind numeric values as int8/bigint

CREATE OR REPLACE FUNCTION public.wms_receive_stock(
  p_product_id UUID,
  p_location_id UUID,
  p_quantity BIGINT,
  p_reason TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_reference TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT public.wms_receive_stock(
    p_product_id,
    p_location_id,
    p_quantity::integer,
    p_reason,
    p_user_id,
    p_reference
  );
$$;

CREATE OR REPLACE FUNCTION public.wms_issue_stock(
  p_product_id UUID,
  p_location_id UUID,
  p_quantity BIGINT,
  p_reason TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_reference TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT public.wms_issue_stock(
    p_product_id,
    p_location_id,
    p_quantity::integer,
    p_reason,
    p_user_id,
    p_reference
  );
$$;

CREATE OR REPLACE FUNCTION public.wms_transfer_stock(
  p_product_id UUID,
  p_source_location_id UUID,
  p_destination_location_id UUID,
  p_quantity BIGINT,
  p_reason TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_reference TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT public.wms_transfer_stock(
    p_product_id,
    p_source_location_id,
    p_destination_location_id,
    p_quantity::integer,
    p_reason,
    p_user_id,
    p_reference
  );
$$;

CREATE OR REPLACE FUNCTION public.wms_adjust_stock(
  p_product_id UUID,
  p_location_id UUID,
  p_delta BIGINT,
  p_reason TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_reference TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT public.wms_adjust_stock(
    p_product_id,
    p_location_id,
    p_delta::integer,
    p_reason,
    p_user_id,
    p_reference
  );
$$;

GRANT EXECUTE ON FUNCTION public.wms_receive_stock(UUID, UUID, BIGINT, TEXT, UUID, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.wms_issue_stock(UUID, UUID, BIGINT, TEXT, UUID, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.wms_transfer_stock(UUID, UUID, UUID, BIGINT, TEXT, UUID, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.wms_adjust_stock(UUID, UUID, BIGINT, TEXT, UUID, TEXT) TO authenticated, anon;
