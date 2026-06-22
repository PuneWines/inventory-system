-- =============================================================================
-- TRIGGERS — Stock Ledger Auto-Update
-- Run this AFTER SCHEMA_MIGRATION.sql in Supabase SQL Editor
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- HELPER: Update the updated_at timestamp on stock_ledger rows
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_set_stock_ledger_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_ledger_updated_at ON public.stock_ledger;
CREATE TRIGGER trg_stock_ledger_updated_at
  BEFORE UPDATE ON public.stock_ledger
  FOR EACH ROW EXECUTE FUNCTION fn_set_stock_ledger_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGER 1: After a PURCHASE is recorded
--
-- When a row is inserted into purchase_items:
--   1. Find the transaction date from inventory_transactions.
--   2. Upsert stock_ledger for (item_id, transaction_date):
--      - Add the new purchase qty to purchase_qty.
--      - If this is a brand-new ledger row, set opening_qty from the most
--        recent previous closing_qty (the last known closing for that item).
--   3. Keep item_name in sync.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_after_purchase_item_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_tx_date       date;
  v_item_name     varchar;
  v_opening_qty   numeric := 0;
  v_prev_closing  numeric := 0;
  v_prev_date     date;
BEGIN
  -- 1. Get transaction date
  SELECT transaction_date
    INTO v_tx_date
    FROM public.inventory_transactions
   WHERE id = NEW.transaction_id;

  -- 2. Get item name
  SELECT item_name
    INTO v_item_name
    FROM public.items
   WHERE id = NEW.item_id;

  -- 3. Find the most recent closing_qty for this item BEFORE this date
  SELECT closing_qty, ledger_date
    INTO v_prev_closing, v_prev_date
    FROM public.stock_ledger
   WHERE item_id   = NEW.item_id
     AND ledger_date < v_tx_date
   ORDER BY ledger_date DESC
   LIMIT 1;

  v_opening_qty := COALESCE(v_prev_closing, 0);

  -- 4. Upsert ledger row
  --    On conflict (same item + same date): just add to purchase_qty.
  --    On new row: set opening_qty from previous closing.
  INSERT INTO public.stock_ledger
    (item_id, item_name, ledger_date, date_for_opening, opening_qty, purchase_qty, closing_qty)
  VALUES
    (NEW.item_id, v_item_name, v_tx_date, v_prev_date, v_opening_qty, NEW.quantity, 0)
  ON CONFLICT (item_id, ledger_date)
  DO UPDATE SET
    purchase_qty = stock_ledger.purchase_qty + EXCLUDED.purchase_qty,
    item_name    = EXCLUDED.item_name,
    updated_at   = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_after_purchase_item_insert ON public.purchase_items;
CREATE TRIGGER trg_after_purchase_item_insert
  AFTER INSERT ON public.purchase_items
  FOR EACH ROW EXECUTE FUNCTION fn_after_purchase_item_insert();


-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGER 2: After a CLOSING STOCK is recorded
--
-- When a row is inserted into closing_stock_items:
--   1. Find the transaction date.
--   2. Upsert stock_ledger for (item_id, transaction_date):
--      - Set closing_qty = total_qty from the closing stock entry.
--      - sale_qty is GENERATED (opening + purchase - closing) — auto-correct.
--   3. Propagate forward: upsert NEXT day's opening_qty = this closing_qty,
--      for all future ledger rows that had this item open without an updated opening.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_after_closing_stock_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_tx_date       date;
  v_item_name     varchar;
  v_opening_qty   numeric := 0;
  v_prev_closing  numeric := 0;
  v_prev_date     date;
  v_next_ledger   date;
BEGIN
  -- 1. Get transaction date
  SELECT transaction_date
    INTO v_tx_date
    FROM public.inventory_transactions
   WHERE id = NEW.transaction_id;

  -- 2. Get item name
  SELECT item_name
    INTO v_item_name
    FROM public.items
   WHERE id = NEW.item_id;

  -- 3. Find most recent closing for this item BEFORE this date (for opening)
  SELECT closing_qty, ledger_date
    INTO v_prev_closing, v_prev_date
    FROM public.stock_ledger
   WHERE item_id    = NEW.item_id
     AND ledger_date < v_tx_date
   ORDER BY ledger_date DESC
   LIMIT 1;

  v_opening_qty := COALESCE(v_prev_closing, 0);

  -- 4. Upsert ledger row — set closing_qty and compute/submit sale_qty
  INSERT INTO public.stock_ledger
    (item_id, item_name, ledger_date, date_for_opening, opening_qty, purchase_qty, closing_qty, sale_qty)
  VALUES
    (NEW.item_id, v_item_name, v_tx_date, v_prev_date, v_opening_qty, 0, NEW.total_qty, (v_opening_qty + 0 - NEW.total_qty))
  ON CONFLICT (item_id, ledger_date)
  DO UPDATE SET
    closing_qty      = EXCLUDED.closing_qty,
    item_name        = EXCLUDED.item_name,
    -- Re-anchor opening_qty only if it was 0 (not yet set by a purchase trigger)
    opening_qty      = CASE
                         WHEN stock_ledger.opening_qty = 0 THEN EXCLUDED.opening_qty
                         ELSE stock_ledger.opening_qty
                       END,
    date_for_opening = CASE
                         WHEN stock_ledger.opening_qty = 0 THEN EXCLUDED.date_for_opening
                         ELSE stock_ledger.date_for_opening
                       END,
    -- Manually calculate sale_qty using the updated values
    sale_qty         = (CASE
                          WHEN stock_ledger.opening_qty = 0 THEN EXCLUDED.opening_qty
                          ELSE stock_ledger.opening_qty
                        END) + stock_ledger.purchase_qty - EXCLUDED.closing_qty,
    updated_at       = now();

  -- 5. Propagate: if there is a NEXT ledger row for this item that still has
  --    an opening_qty of 0 (or was set from an older closing), update it and recalculate its sale_qty.
  SELECT MIN(ledger_date)
    INTO v_next_ledger
    FROM public.stock_ledger
   WHERE item_id    = NEW.item_id
     AND ledger_date > v_tx_date;

  IF v_next_ledger IS NOT NULL THEN
    UPDATE public.stock_ledger
       SET opening_qty      = NEW.total_qty,
           date_for_opening = v_tx_date,
           sale_qty         = NEW.total_qty + purchase_qty - closing_qty,
           updated_at       = now()
     WHERE item_id    = NEW.item_id
       AND ledger_date = v_next_ledger;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_after_closing_stock_insert ON public.closing_stock_items;
CREATE TRIGGER trg_after_closing_stock_insert
  AFTER INSERT ON public.closing_stock_items
  FOR EACH ROW EXECUTE FUNCTION fn_after_closing_stock_insert();


-- ─────────────────────────────────────────────────────────────────────────────
-- BONUS: stock_ledger_view (live cross-check — always 100% in sync)
--
-- WHY USE THIS?
--   - The real table (stock_ledger) stores history permanently.
--   - This VIEW recalculates everything live from raw transactions.
--   - Use it to audit: if stock_ledger rows ever differ from this view,
--     something went wrong with a trigger.
--   - Also useful for ad-hoc queries without worrying about stale data.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.stock_ledger_view AS
WITH purchase_agg AS (
  -- Sum of all purchases per item per date
  SELECT
    pi.item_id,
    it.transaction_date                     AS ledger_date,
    SUM(pi.quantity)                        AS total_purchased
  FROM public.purchase_items pi
  JOIN public.inventory_transactions it ON it.id = pi.transaction_id
  GROUP BY pi.item_id, it.transaction_date
),
closing_agg AS (
  -- Latest closing stock per item per date
  SELECT DISTINCT ON (csi.item_id, it.transaction_date)
    csi.item_id,
    it.transaction_date                     AS ledger_date,
    csi.total_qty                           AS closing_qty
  FROM public.closing_stock_items csi
  JOIN public.inventory_transactions it ON it.id = csi.transaction_id
  ORDER BY csi.item_id, it.transaction_date, csi.created_at DESC
),
all_dates AS (
  SELECT item_id, ledger_date FROM purchase_agg
  UNION
  SELECT item_id, ledger_date FROM closing_agg
),
with_prev_closing AS (
  SELECT
    ad.item_id,
    ad.ledger_date,
    COALESCE(pa.total_purchased, 0)         AS purchase_qty,
    COALESCE(ca.closing_qty, 0)             AS closing_qty,
    LAG(COALESCE(ca.closing_qty, 0)) OVER (
      PARTITION BY ad.item_id
      ORDER BY ad.ledger_date
    )                                       AS opening_qty
  FROM all_dates ad
  LEFT JOIN purchase_agg  pa ON pa.item_id    = ad.item_id
                             AND pa.ledger_date = ad.ledger_date
  LEFT JOIN closing_agg   ca ON ca.item_id    = ad.item_id
                             AND ca.ledger_date = ad.ledger_date
)
SELECT
  i.item_name                                                   AS "Item Name",
  wpc.ledger_date                                               AS "Date",
  LAG(wpc.ledger_date) OVER (
    PARTITION BY wpc.item_id ORDER BY wpc.ledger_date
  )                                                             AS "Date For Opening",
  COALESCE(wpc.opening_qty, 0)                                  AS "Opening Quantity",
  wpc.purchase_qty                                              AS "Purchase Quantity",
  GREATEST(
    COALESCE(wpc.opening_qty, 0) + wpc.purchase_qty - wpc.closing_qty,
    0
  )                                                             AS "Sale Quantity",
  wpc.closing_qty                                               AS "Closing Quantity"
FROM with_prev_closing wpc
JOIN public.items i ON i.id = wpc.item_id
ORDER BY wpc.ledger_date DESC, i.item_name;

COMMENT ON VIEW public.stock_ledger_view IS
  'Live recalculation of the stock ledger from raw transactions. Use to audit stock_ledger table correctness.';
