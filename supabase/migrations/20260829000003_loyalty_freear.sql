-- $0 Loyalty + free AR placeholders
CREATE TABLE IF NOT EXISTS loyalty_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  email TEXT UNIQUE NOT NULL,
  points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  tier TEXT NOT NULL DEFAULT 'seedling' CHECK (tier IN ('seedling','blossom','garden')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
  points_delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  order_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_loyalty_account ON loyalty_transactions(account_id);
UPDATE raw_materials SET low_threshold = 30 WHERE sku LIKE 'RM-CARD%' AND low_threshold < 30;
