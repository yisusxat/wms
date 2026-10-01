-- ============================================================
-- Fase 5: Vista Materializada para Dashboard
-- Reemplaza el cálculo en cliente de métricas de dashboard
-- ============================================================

-- Vista materializada para resumen del dashboard
CREATE MATERIALIZED VIEW IF NOT EXISTS v_dashboard_summary AS
SELECT
  (SELECT COUNT(*) FROM products)::INTEGER                          AS total_products,
  (SELECT COUNT(*) FROM locations)::INTEGER                         AS total_locations,
  (SELECT COUNT(*) FROM locations WHERE status = 'OCCUPIED')::INTEGER AS occupied_locations,
  (SELECT COUNT(*) FROM locations WHERE status = 'AVAILABLE')::INTEGER AS available_locations,
  (SELECT COUNT(*) FROM locations WHERE status = 'BLOCKED')::INTEGER   AS blocked_locations,
  COALESCE(
    (SELECT SUM(quantity)::INTEGER FROM inventory), 0
  )                                                                  AS total_units,
  COALESCE(
    (SELECT COUNT(*)::INTEGER FROM movements
     WHERE type = 'RECEIPT' AND created_at >= CURRENT_DATE), 0
  )                                                                  AS entries_today,
  COALESCE(
    (SELECT COUNT(*)::INTEGER FROM movements
     WHERE type = 'ISSUE' AND created_at >= CURRENT_DATE), 0
  )                                                                  AS issues_today,
  COALESCE(
    (SELECT COUNT(*)::INTEGER FROM movements
     WHERE type = 'TRANSFER' AND created_at >= CURRENT_DATE), 0
  )                                                                  AS transfers_today,
  ROUND(
    CASE WHEN (SELECT COUNT(*) FROM locations) > 0
         THEN (SELECT COUNT(*) FROM locations WHERE status = 'OCCUPIED')::NUMERIC
              / (SELECT COUNT(*) FROM locations)::NUMERIC * 100
         ELSE 0
    END, 1
  )                                                                  AS occupation_percentage,
  NOW()                                                              AS last_refreshed_at
WITH DATA;

-- Índice único (necesario para REFRESH CONCURRENTLY)
CREATE UNIQUE INDEX IF NOT EXISTS idx_v_dashboard_summary_singleton
  ON v_dashboard_summary ((1));

-- Permisos de lectura para el rol authenticated
GRANT SELECT ON v_dashboard_summary TO authenticated;
GRANT SELECT ON v_dashboard_summary TO anon;

-- Vista para KPIs de rotación (30 días móviles)
CREATE MATERIALIZED VIEW IF NOT EXISTS v_dashboard_kpis AS
SELECT
  p.id                                                               AS product_id,
  p.sku,
  p.name                                                             AS product_name,
  p.category,
  COALESCE(SUM(CASE WHEN m.type = 'ISSUE' THEN m.quantity ELSE 0 END), 0)::INTEGER
                                                                     AS total_issued_30d,
  COALESCE(SUM(CASE WHEN m.type = 'RECEIPT' THEN m.quantity ELSE 0 END), 0)::INTEGER
                                                                     AS total_received_30d,
  COALESCE((SELECT SUM(i.quantity) FROM inventory i WHERE i.product_id = p.id), 0)::INTEGER
                                                                     AS current_stock,
  -- Clasificación ABC basada en salidas de los últimos 30 días
  CASE
    WHEN COALESCE(SUM(CASE WHEN m.type = 'ISSUE' THEN m.quantity ELSE 0 END), 0) >= 20 THEN 'A'
    WHEN COALESCE(SUM(CASE WHEN m.type = 'ISSUE' THEN m.quantity ELSE 0 END), 0) >= 5  THEN 'B'
    ELSE 'C'
  END                                                                AS abc_class,
  NOW()                                                              AS last_refreshed_at
FROM products p
LEFT JOIN movements m
  ON m.product_id = p.id
  AND m.created_at >= (NOW() - INTERVAL '30 days')
GROUP BY p.id, p.sku, p.name, p.category
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_v_dashboard_kpis_product
  ON v_dashboard_kpis (product_id);

GRANT SELECT ON v_dashboard_kpis TO authenticated;
GRANT SELECT ON v_dashboard_kpis TO anon;
