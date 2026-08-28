-- Krystal's Flower Kreations — Custom BOM + Kanban + Workshops (Supabase Postgres)
-- Perth WA | 100% custom (no Shopify) | GST AUD
-- Apply: psql $DATABASE_URL -f 20260829000001_bom_workshop_kanban.sql
-- or: supabase db push (if supabase linked) or via Prisma migrate after porting to schema.prisma

-- ── Enums ──────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE custom_order_state AS ENUM ('drafting_proofing','cricut_cutting','hand_folding_assembly','quality_check','dispatched_pickup_ready','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE raw_unit AS ENUM ('sheet','meter','stick','roll','piece','ml','gram'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 1. Raw materials & BOM ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS raw_materials (
  id TEXT PRIMARY KEY,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL, -- e.g. 65lb Canson Cardstock – Blush
  unit raw_unit NOT NULL DEFAULT 'sheet',
  on_hand REAL NOT NULL DEFAULT 0,
  low_threshold REAL NOT NULL DEFAULT 5,
  cost_per_unit REAL NOT NULL DEFAULT 0,
  supplier TEXT,
  location_id TEXT REFERENCES inventory_locations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_raw_materials_low ON raw_materials((on_hand <= low_threshold));

CREATE TABLE IF NOT EXISTS bom_recipes (
  id TEXT PRIMARY KEY,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  variant_id TEXT REFERENCES product_variants(id) ON DELETE CASCADE,
  labour_minutes_per_unit REAL NOT NULL DEFAULT 25,
  cricut_minutes_per_unit REAL NOT NULL DEFAULT 8,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(product_id, variant_id),
  CHECK (product_id IS NOT NULL OR variant_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS bom_lines (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES bom_recipes(id) ON DELETE CASCADE,
  raw_material_id TEXT NOT NULL REFERENCES raw_materials(id) ON DELETE RESTRICT,
  qty_per_unit REAL NOT NULL DEFAULT 1,
  waste_factor REAL NOT NULL DEFAULT 0.05,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(recipe_id, raw_material_id)
);
CREATE INDEX IF NOT EXISTS idx_bom_lines_recipe ON bom_lines(recipe_id);

-- Stock movements extension: link to raw material deductions
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS raw_material_id TEXT REFERENCES raw_materials(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_stock_raw ON stock_movements(raw_material_id);

-- ── 2. Custom Art Orders — Kanban pipeline ─────────────────────────
CREATE TABLE IF NOT EXISTS custom_art_orders (
  id TEXT PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL, -- KFK-CA-2026-0001
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  variant_id TEXT REFERENCES product_variants(id) ON DELETE SET NULL,
  spec JSONB NOT NULL DEFAULT '{}'::jsonb, -- ConfiguratorSpec
  state custom_order_state NOT NULL DEFAULT 'drafting_proofing',
  bom_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  estimated_minutes REAL NOT NULL DEFAULT 0,
  total_price REAL NOT NULL DEFAULT 0, -- GST-inclusive AUD
  cost_price REAL,
  shipping_name TEXT,
  shipping_address TEXT,
  shipping_suburb TEXT,
  shipping_state TEXT DEFAULT 'WA',
  shipping_postcode TEXT,
  shipping_country TEXT DEFAULT 'AU',
  pickup_ready_at TIMESTAMPTZ,
  dispatched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_custom_orders_state ON custom_art_orders(state);
CREATE INDEX IF NOT EXISTS idx_custom_orders_email ON custom_art_orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_custom_orders_created ON custom_art_orders(created_at DESC);

CREATE TABLE IF NOT EXISTS custom_art_order_history (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES custom_art_orders(id) ON DELETE CASCADE,
  from_state custom_order_state,
  to_state custom_order_state NOT NULL,
  note TEXT,
  by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_custom_hist_order ON custom_art_order_history(order_id);

-- Tickets (unified for bookings + custom orders)
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  booking_id TEXT REFERENCES bookings(id) ON DELETE CASCADE,
  custom_art_order_id TEXT UNIQUE REFERENCES custom_art_orders(id) ON DELETE CASCADE,
  qr_payload TEXT UNIQUE NOT NULL, -- signed payload KFK-T-...
  qr_url TEXT,
  checked_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CHECK (booking_id IS NOT NULL OR custom_art_order_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_tickets_qr ON tickets(qr_payload);
CREATE INDEX IF NOT EXISTS idx_tickets_booking ON tickets(booking_id);

-- Add kitAddOn to bookings if missing
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS kit_add_on BOOLEAN DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS ticket_id TEXT REFERENCES tickets(id) ON DELETE SET NULL;

-- ── 3. Views & helpers ─────────────────────────────────────────────

-- Low-stock view for Realtime / API
CREATE OR REPLACE VIEW low_stock_raw_materials AS
  SELECT id, sku, name, unit, on_hand, low_threshold, supplier
  FROM raw_materials
  WHERE on_hand <= low_threshold
  ORDER BY (on_hand - low_threshold) ASC;

-- Kanban board aggregation (for Admin)
CREATE OR REPLACE VIEW custom_order_kanban AS
  SELECT
    state,
    COUNT(*)::int AS count,
    COALESCE(SUM(total_price),0)::real AS total_value
  FROM custom_art_orders
  WHERE state <> 'cancelled'
  GROUP BY state;

-- ── 4. Capacity trigger — prevents workshop over-booking ───────────
CREATE OR REPLACE FUNCTION check_workshop_capacity() RETURNS TRIGGER AS $$
DECLARE
  cap INT;
  booked INT;
BEGIN
  SELECT capacity, booked_count INTO cap, booked FROM workshop_sessions WHERE id = NEW.session_id;
  IF NEW.status = 'confirmed' AND (booked + NEW.quantity) > cap THEN
    RAISE EXCEPTION 'Workshop session full: %/% booked', booked, cap;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bookings_capacity ON bookings;
CREATE TRIGGER trg_bookings_capacity
  BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION check_workshop_capacity();

-- ── 5. BOM deduction helper (call from API after order paid) ───────
-- CALL: SELECT deduct_bom_for_custom_order('order_id', 'user_id');
CREATE OR REPLACE FUNCTION deduct_bom_for_custom_order(p_order_id TEXT, p_user_id TEXT) RETURNS VOID AS $$
DECLARE line JSONB;
BEGIN
  FOR line IN SELECT jsonb_array_elements(bom_snapshot) FROM custom_art_orders WHERE id = p_order_id LOOP
    UPDATE raw_materials
      SET on_hand = on_hand - COALESCE((line->>'effectiveQty')::real, 0),
          updated_at = now()
      WHERE id = (line->>'rawMaterialId');
    INSERT INTO stock_movements(id, product_id, raw_material_id, type, quantity, reason, reference, user_id, created_at)
      VALUES (
        'sm_' || substr(md5(random()::text),1,12),
        COALESCE((SELECT product_id FROM custom_art_orders WHERE id=p_order_id), 'custom'),
        (line->>'rawMaterialId'),
        'bom_deduct',
        -COALESCE((line->>'effectiveQty')::real,0)::int,
        'Custom order ' || (SELECT order_number FROM custom_art_orders WHERE id=p_order_id),
        p_order_id,
        p_user_id,
        now()
      );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ── 6. Enable Realtime (Supabase) ─────────────────────────────────
-- In Supabase Dashboard: Database → Realtime → enable for custom_art_orders, workshop_sessions, low_stock_raw_materials (via table)
-- ALTER PUBLICATION supabase_realtime ADD TABLE custom_art_orders;
-- ALTER PUBLICATION supabase_realtime ADD TABLE workshop_sessions;
-- ALTER PUBLICATION supabase_realtime ADD TABLE raw_materials;

-- ── 7. RLS placeholders (enable after auth) ────────────────────────
-- ALTER TABLE custom_art_orders ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "makers manage" ON custom_art_orders FOR ALL USING (auth.role() IN ('maker','admin','developer'));
