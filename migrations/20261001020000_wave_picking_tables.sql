-- ============================================================
-- Fase 4: Wave Picking — Tablas de órdenes de salida y olas
-- ============================================================

-- Tipo enum para estado de órdenes
DO $$ BEGIN
  CREATE TYPE outbound_order_status AS ENUM (
    'PENDING', 'ALLOCATED', 'PICKING', 'PACKED', 'DISPATCHED', 'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabla de olas de picking
CREATE TABLE IF NOT EXISTS waves (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  status     TEXT        NOT NULL DEFAULT 'OPEN',  -- OPEN, PICKING, CLOSED, CANCELLED
  route      JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabla de órdenes de salida
CREATE TABLE IF NOT EXISTS outbound_orders (
  id         UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
  reference  TEXT                   NOT NULL UNIQUE,
  status     outbound_order_status  NOT NULL DEFAULT 'PENDING',
  priority   SMALLINT               NOT NULL DEFAULT 5,  -- 1=urgente, 10=normal
  wave_id    UUID                   REFERENCES waves(id) ON DELETE SET NULL,
  notes      TEXT,
  created_at TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ            NOT NULL DEFAULT NOW()
);

-- Líneas de órdenes de salida
CREATE TABLE IF NOT EXISTS outbound_order_lines (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID        NOT NULL REFERENCES outbound_orders(id) ON DELETE CASCADE,
  product_id  UUID        NOT NULL REFERENCES products(id),
  quantity    INTEGER     NOT NULL CHECK (quantity > 0),
  picked_qty  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbound_orders_status ON outbound_orders(status);
CREATE INDEX IF NOT EXISTS idx_outbound_orders_wave   ON outbound_orders(wave_id);
CREATE INDEX IF NOT EXISTS idx_order_lines_order      ON outbound_order_lines(order_id);
CREATE INDEX IF NOT EXISTS idx_order_lines_product    ON outbound_order_lines(product_id);

-- RLS
ALTER TABLE waves               ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_orders     ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_order_lines ENABLE ROW LEVEL SECURITY;

-- Políticas: authenticated puede leer y escribir todo
DROP POLICY IF EXISTS waves_authenticated ON waves;
CREATE POLICY waves_authenticated ON waves
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS orders_authenticated ON outbound_orders;
CREATE POLICY orders_authenticated ON outbound_orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS order_lines_authenticated ON outbound_order_lines;
CREATE POLICY order_lines_authenticated ON outbound_order_lines
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
