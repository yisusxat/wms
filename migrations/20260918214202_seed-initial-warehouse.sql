DO $$
DECLARE
  v_warehouse_id UUID;
  v_zone_id UUID;
  v_aisle_id UUID;
  v_rack_id UUID;
  v_aisle_code TEXT;
  v_rack_code TEXT;
  v_rack_name TEXT;
  v_rack_type TEXT;
  v_levels INTEGER;
  v_positions INTEGER;
  v_level INTEGER;
  v_position INTEGER;
BEGIN
  INSERT INTO public.warehouses (code, name)
  VALUES ('BOD-PRINCIPAL', 'Bodega Principal')
  ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, active = TRUE
  RETURNING id INTO v_warehouse_id;

  INSERT INTO public.zones (warehouse_id, code, name)
  VALUES (v_warehouse_id, 'GENERAL', 'Zona General')
  ON CONFLICT (warehouse_id, code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_zone_id;

  FOREACH v_aisle_code IN ARRAY ARRAY['A', 'B'] LOOP
    INSERT INTO public.aisles (zone_id, code, name)
    VALUES (v_zone_id, v_aisle_code, 'Pasillo ' || v_aisle_code)
    ON CONFLICT (zone_id, code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_aisle_id;

    FOREACH v_rack_code IN ARRAY ARRAY['C', 'P'] LOOP
      IF v_rack_code = 'C' THEN
        v_rack_name := 'Rack Central';
        v_rack_type := 'CENTRAL';
        v_positions := 15;
      ELSE
        v_rack_name := 'Rack Pared';
        v_rack_type := 'WALL';
        v_positions := 22;
      END IF;
      v_levels := 2;

      INSERT INTO public.racks (aisle_id, code, name, rack_type, levels, positions)
      VALUES (v_aisle_id, v_rack_code, v_rack_name, v_rack_type, v_levels, v_positions)
      ON CONFLICT (aisle_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        rack_type = EXCLUDED.rack_type,
        levels = EXCLUDED.levels,
        positions = EXCLUDED.positions
      RETURNING id INTO v_rack_id;

      FOR v_level IN 1..v_levels LOOP
        FOR v_position IN 1..v_positions LOOP
          INSERT INTO public.locations (rack_id, code, level, position)
          VALUES (
            v_rack_id,
            v_aisle_code || '-' || v_rack_code || '-' || lpad(v_level::TEXT, 2, '0') || '-' || lpad(v_position::TEXT, 2, '0'),
            v_level,
            v_position
          )
          ON CONFLICT (code) DO UPDATE SET
            rack_id = EXCLUDED.rack_id,
            level = EXCLUDED.level,
            position = EXCLUDED.position;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;
END;
$$;
