-- Migration: 20260922223000_sync_location_status_trigger.sql
-- Ensure location status automatically stays in sync with real inventory quantity.
-- Handles INSERT, UPDATE (including transfer between locations), and DELETE.

CREATE OR REPLACE FUNCTION public.refresh_location_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Handle NEW location_id (INSERT or UPDATE)
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.location_id IS NOT NULL THEN
    UPDATE public.locations
    SET status = CASE
      WHEN status IN ('BLOCKED', 'MAINTENANCE') THEN status
      WHEN EXISTS (
        SELECT 1 FROM public.inventory i
        WHERE i.location_id = NEW.location_id
          AND i.quantity > 0
      ) THEN 'OCCUPIED'::public.location_status
      ELSE 'AVAILABLE'::public.location_status
    END,
    updated_at = NOW()
    WHERE id = NEW.location_id;
  END IF;

  -- Handle OLD location_id (DELETE or UPDATE when location changed)
  IF (TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.location_id IS DISTINCT FROM NEW.location_id)) AND OLD.location_id IS NOT NULL THEN
    UPDATE public.locations
    SET status = CASE
      WHEN status IN ('BLOCKED', 'MAINTENANCE') THEN status
      WHEN EXISTS (
        SELECT 1 FROM public.inventory i
        WHERE i.location_id = OLD.location_id
          AND i.quantity > 0
      ) THEN 'OCCUPIED'::public.location_status
      ELSE 'AVAILABLE'::public.location_status
    END,
    updated_at = NOW()
    WHERE id = OLD.location_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Ensure trigger exists on inventory table
DROP TRIGGER IF EXISTS inventory_refresh_location_status ON public.inventory;
CREATE TRIGGER inventory_refresh_location_status
AFTER INSERT OR UPDATE OR DELETE ON public.inventory
FOR EACH ROW
EXECUTE FUNCTION public.refresh_location_status();

-- Synchronize any existing drift between locations and inventory
UPDATE public.locations l
SET status = 'OCCUPIED'::public.location_status, updated_at = NOW()
WHERE l.status = 'AVAILABLE'::public.location_status
  AND EXISTS (
    SELECT 1 FROM public.inventory i
    WHERE i.location_id = l.id AND i.quantity > 0
  );

UPDATE public.locations l
SET status = 'AVAILABLE'::public.location_status, updated_at = NOW()
WHERE l.status = 'OCCUPIED'::public.location_status
  AND NOT EXISTS (
    SELECT 1 FROM public.inventory i
    WHERE i.location_id = l.id AND i.quantity > 0
  );
