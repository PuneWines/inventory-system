-- =============================================================================
-- PUNE WINES INVENTORY SYSTEM — COMPLETE SCHEMA (Reference / Documentation)
-- WARNING: This schema is for context only and is not meant to be run fresh.
-- For existing databases: run SCHEMA_MIGRATION.sql then TRIGGERS.sql instead.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: shop
-- Each physical shop location.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.shop (
  id        bigserial     PRIMARY KEY,
  shop_name varchar       NOT NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: items
-- Master catalogue of all inventory items.
-- NOTE: mrp removed — each shop defines its own rate via shop_item_rates.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.items (
  id         bigserial     PRIMARY KEY,
  item_name  varchar(255),
  created_at timestamptz   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_items_name
  ON public.items USING btree (item_name);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: shop_item_rates
-- Per-shop selling rate for each item.
-- Supports rate history: insert a new row with a new effective_from date to
-- update the rate. Older rows are preserved for historical reference.
--
-- To get the CURRENT rate for an item at a shop:
--   SELECT rate FROM shop_item_rates
--   WHERE shop_id = $1 AND item_id = $2 AND effective_from <= CURRENT_DATE
--   ORDER BY effective_from DESC LIMIT 1;
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.shop_item_rates (
  id             bigserial   PRIMARY KEY,
  shop_id        bigint      NOT NULL REFERENCES public.shop(id)  ON DELETE CASCADE,
  item_id        bigint      NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  rate           numeric     NOT NULL DEFAULT 0,
  effective_from date        NOT NULL DEFAULT CURRENT_DATE,
  created_at     timestamptz DEFAULT now(),
  UNIQUE (shop_id, item_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_shop_item_rates_lookup
  ON public.shop_item_rates (shop_id, item_id, effective_from DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: vendors
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.vendors (
  id          bigserial   PRIMARY KEY,
  vendor_name varchar(255) NOT NULL UNIQUE,
  created_at  timestamptz DEFAULT now(),
  shop_id     bigint      REFERENCES public.shop(id) ON DELETE SET NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: inventory_transactions
-- Parent record for every transaction event.
-- shop_id links the transaction to a specific shop.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.inventory_transactions (
  id               bigserial   PRIMARY KEY,
  transaction_date date        NOT NULL,
  transaction_type varchar     NOT NULL
    CHECK (transaction_type IN ('purchase', 'closing_stock', 'sale_amount')),
  shop_id          bigint      REFERENCES public.shop(id),
  created_at       timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: purchase_items
-- Line items for a purchase transaction.
-- INSERT here → triggers fn_after_purchase_item_insert → updates stock_ledger.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.purchase_items (
  id             bigserial   PRIMARY KEY,
  transaction_id bigint      NOT NULL REFERENCES public.inventory_transactions(id),
  item_id        bigint      NOT NULL REFERENCES public.items(id),
  vendor_id      bigint               REFERENCES public.vendors(id),
  purchase_rate  numeric     DEFAULT 0,
  quantity       numeric     DEFAULT 0,
  gst_percent    numeric     DEFAULT 0,
  discount       numeric     DEFAULT 0,
  discount_type  varchar,
  total_amount   numeric     DEFAULT 0,
  created_at     timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: closing_stock_items
-- Physical stock count at end of day, per shop.
-- INSERT here → triggers fn_after_closing_stock_insert → updates stock_ledger.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.closing_stock_items (
  id               bigserial   PRIMARY KEY,
  transaction_id   bigint      NOT NULL REFERENCES public.inventory_transactions(id),
  item_id          bigint      NOT NULL REFERENCES public.items(id),
  shop_id          bigint               REFERENCES public.shop(id),
  last_closing_qty numeric     DEFAULT 0,
  godown_qty       numeric     DEFAULT 0,
  counter_qty      numeric     DEFAULT 0,
  total_qty        numeric     DEFAULT 0,
  created_at       timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: daily_sales_summary
-- Cash/GPay summary for a day. Not item-level.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.daily_sales_summary (
  id                   bigserial   PRIMARY KEY,
  transaction_id       bigint      NOT NULL UNIQUE REFERENCES public.inventory_transactions(id),
  gpay_amount          numeric     DEFAULT 0,
  cash_amount          numeric     DEFAULT 0,
  expense_amount       numeric     DEFAULT 0,
  total_closing_amount numeric     DEFAULT 0,
  created_at           timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: stock_ledger  ★ NEW ★
-- One row per (item, date). Auto-populated by triggers.
-- sale_qty is a STORED GENERATED COLUMN: always = opening + purchase - closing.
--
-- Columns:
--   item_name        — denormalised copy for fast reporting
--   ledger_date      — the date this row represents
--   date_for_opening — which prior date's closing feeds this opening
--   opening_qty      — carried forward from previous day's closing_qty
--   purchase_qty     — cumulative purchases on ledger_date
--   sale_qty         — GENERATED: opening + purchase - closing (stored)
--   closing_qty      — physical count at end of ledger_date
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.stock_ledger (
  id                bigserial   PRIMARY KEY,
  item_id           bigint      NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  item_name         varchar,
  ledger_date       date        NOT NULL,
  date_for_opening  date,
  opening_qty       numeric     NOT NULL DEFAULT 0,
  purchase_qty      numeric     NOT NULL DEFAULT 0,
  sale_qty          numeric     NOT NULL DEFAULT 0,
  closing_qty       numeric     NOT NULL DEFAULT 0,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  UNIQUE (item_id, ledger_date)
);

CREATE INDEX IF NOT EXISTS idx_stock_ledger_item_date
  ON public.stock_ledger (item_id, ledger_date DESC);

CREATE INDEX IF NOT EXISTS idx_stock_ledger_date
  ON public.stock_ledger (ledger_date DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- VIEW: stock_ledger_view  ★ NEW ★
-- Live recalculation from raw transaction tables.
-- Matches the exact column layout requested:
--   Item Name | Date | Date For Opening | Opening Quantity |
--   Purchase Quantity | Sale Quantity | Closing Quantity
--
-- USE THIS TO:
--   • Audit the stock_ledger table for correctness
--   • Query live data without relying on trigger history
-- ─────────────────────────────────────────────────────────────────────────────
-- (Full definition is in TRIGGERS.sql — see stock_ledger_view)