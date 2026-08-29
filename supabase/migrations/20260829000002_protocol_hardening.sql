-- Protocol hardening: inventory ledger, idempotency, variant qty, rate-limit friendly
-- Mirrors Prisma schema changes added after 00001

-- Variant inventory_quantity (atomic stock)
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS inventory_quantity INTEGER NOT NULL DEFAULT 0 CHECK (inventory_quantity >= 0);
CREATE INDEX IF NOT EXISTS idx_variants_inventory ON product_variants(inventory_quantity);

-- Inventory ledger for atomic audit (variant delta)
CREATE TABLE IF NOT EXISTS inventory_ledger (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  order_id TEXT,
  custom_order_id TEXT,
  user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_variant ON inventory_ledger(variant_id);
CREATE INDEX IF NOT EXISTS idx_ledger_order ON inventory_ledger(order_id);

-- Idempotency keys for checkout/custom orders (prevent double create on retry)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;
ALTER TABLE custom_art_orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency ON orders(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_orders_idempotency ON custom_art_orders(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Ensure BOM deduct is tracked via stock_movements type includes bom_deduct (already added)
-- Add check for finite? Handled in app Zod finite(), not DB.

-- Optional: Add updated_at trigger for raw_materials
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_raw_materials_updated ON raw_materials;
CREATE TRIGGER trg_raw_materials_updated BEFORE UPDATE ON raw_materials FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- View for low stock (already in 00001, ensure exists)
CREATE OR REPLACE VIEW low_stock_raw_materials AS
  SELECT id, sku, name, unit, on_hand, low_threshold, supplier
  FROM raw_materials
  WHERE on_hand <= low_threshold
  ORDER BY (on_hand - low_threshold) ASC;
