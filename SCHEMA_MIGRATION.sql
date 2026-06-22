-- =============================================================================
-- SCHEMA MIGRATION — Pune Wines Inventory System
-- Run this in your Supabase SQL Editor (once, in order)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Remove global mrp from items (rates now live in shop_item_rates)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.items
  DROP COLUMN IF EXISTS mrp;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Add shop_id to inventory_transactions
--         (every transaction — purchase, closing_stock, sale_amount — 
--          must belong to a specific shop)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS shop_id bigint REFERENCES public.shop(id);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: shop_item_rates
--         Stores the selling rate for each item per shop.
--         A shop can update the rate by inserting a new row with a new
--         effective_from date — old rates are preserved for history.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shop_item_rates (
  id             bigserial      PRIMARY KEY,
  shop_id        bigint         NOT NULL REFERENCES public.shop(id)   ON DELETE CASCADE,
  item_id        bigint         NOT NULL REFERENCES public.items(id)  ON DELETE CASCADE,
  rate           numeric        NOT NULL DEFAULT 0,
  effective_from date           NOT NULL DEFAULT CURRENT_DATE,
  created_at     timestamptz    DEFAULT now(),
  UNIQUE (shop_id, item_id, effective_from)
);

COMMENT ON TABLE public.shop_item_rates IS
  'Per-shop selling rate for each item. Supports rate history via effective_from date.';

-- Index for fast lookup: "what is the current rate for this item at this shop?"
CREATE INDEX IF NOT EXISTS idx_shop_item_rates_lookup
  ON public.shop_item_rates (shop_id, item_id, effective_from DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: stock_ledger (real table — permanent historical records)
--         One row per (item, ledger_date).
--         Auto-populated and kept in sync by triggers (see TRIGGERS.sql).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_ledger (
  id                bigserial    PRIMARY KEY,
  item_id           bigint       NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  item_name         varchar,                          -- denormalised for easy reporting
  ledger_date       date         NOT NULL,
  date_for_opening  date,                             -- which date's closing feeds this opening
  opening_qty       numeric      NOT NULL DEFAULT 0,
  purchase_qty      numeric      NOT NULL DEFAULT 0,
  sale_qty          numeric      NOT NULL DEFAULT 0,
  closing_qty       numeric      NOT NULL DEFAULT 0,
  created_at        timestamptz  DEFAULT now(),
  updated_at        timestamptz  DEFAULT now(),
  UNIQUE (item_id, ledger_date)
);

COMMENT ON TABLE public.stock_ledger IS
  'Stock ledger: one row per item per date. sale_qty is auto-computed as Opening + Purchase - Closing.';

COMMENT ON COLUMN public.stock_ledger.sale_qty IS
  'Derived: Opening Qty + Purchase Qty − Closing Qty. Stored (not calculated at query time).';

COMMENT ON COLUMN public.stock_ledger.date_for_opening IS
  'The ledger_date of the previous entry whose closing_qty feeds this row''s opening_qty.';

-- Index for fast date-range reports
CREATE INDEX IF NOT EXISTS idx_stock_ledger_item_date
  ON public.stock_ledger (item_id, ledger_date DESC);

CREATE INDEX IF NOT EXISTS idx_stock_ledger_date
  ON public.stock_ledger (ledger_date DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: Migrate sale_qty from GENERATED to STANDARD COLUMN
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.stock_ledger DROP COLUMN IF EXISTS sale_qty;
ALTER TABLE public.stock_ledger ADD COLUMN sale_qty numeric NOT NULL DEFAULT 0;
UPDATE public.stock_ledger SET sale_qty = (opening_qty + purchase_qty - closing_qty);


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6: Add contact_number to vendors table
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS contact_number varchar(50);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 7: Migrate items table to include shop_id and shop-specific metadata
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS shop_id bigint REFERENCES public.shop(id) ON DELETE SET NULL;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS opening_qty bigint DEFAULT 0;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS purchase_qty bigint DEFAULT 0;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS closing_qty bigint DEFAULT 0;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS mrp bigint DEFAULT 20;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS current_stock numeric DEFAULT 0;



