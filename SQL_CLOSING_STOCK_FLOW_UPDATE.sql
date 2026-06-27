-- =============================================================================
-- SQL MIGRATION: Closing Stock No Longer Updates Current Stock Immediately
-- Run this in Supabase SQL Editor (run all at once)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1: Create a dedicated validation-only function for closing stock trigger.
--         This replaces the previous behaviour of calling fn_sync_current_stock
--         (which updates current_stock) when closing stock is inserted/updated.
--         Instead we only validate that daily accumulated closing <= current_stock.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_validate_closing_stock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_tx_date        date;
  v_current_stock  numeric;
  v_daily_total    numeric;
BEGIN
  -- Get the transaction date for this closing entry
  SELECT transaction_date
    INTO v_tx_date
    FROM public.inventory_transactions
   WHERE id = NEW.transaction_id;

  -- Get current stock for the item
  SELECT COALESCE(current_stock, 0)
    INTO v_current_stock
    FROM public.items
   WHERE id = NEW.item_id;

  -- Sum all closing entries already submitted for this item today
  SELECT COALESCE(SUM(csi.total_qty), 0)
    INTO v_daily_total
    FROM public.closing_stock_items csi
    JOIN public.inventory_transactions it ON it.id = csi.transaction_id
   WHERE csi.item_id = NEW.item_id
     AND it.transaction_date = v_tx_date;

  -- Reject if accumulated + this entry would exceed current stock
  IF v_daily_total + NEW.total_qty > v_current_stock THEN
    RAISE EXCEPTION
      'Daily closing total (%) would exceed current stock (%) for this item.',
      v_daily_total + NEW.total_qty, v_current_stock;
  END IF;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- STEP 2: Rebind trg_sync_current_stock_closing to the new validation function.
--         Changed from AFTER INSERT/UPDATE to BEFORE INSERT/UPDATE so we can
--         reject invalid entries before they are persisted.
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_sync_current_stock_closing ON public.closing_stock_items;

CREATE TRIGGER trg_sync_current_stock_closing
  BEFORE INSERT OR UPDATE ON public.closing_stock_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_closing_stock();

-- NOTE: trg_sync_current_stock_purchase and fn_sync_current_stock are UNCHANGED.

-- -----------------------------------------------------------------------------
-- STEP 3: Fix fn_recalculate_current_stock to exclude TODAY's closing entries.
--         Without this fix, a purchase made after a closing entry today would
--         incorrectly use today's in-progress closing as the base quantity.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_recalculate_current_stock(p_item_id bigint)
RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE
  v_latest_closing_date date;
  v_latest_closing_qty  numeric := 0;
  v_purchases_since     numeric := 0;
BEGIN
  -- Find the most recent closing stock entry BEFORE today (exclude today's entries)
  SELECT it.transaction_date, csi.total_qty
    INTO v_latest_closing_date, v_latest_closing_qty
    FROM public.closing_stock_items csi
    JOIN public.inventory_transactions it ON it.id = csi.transaction_id
   WHERE csi.item_id = p_item_id
     AND it.transaction_date < CURRENT_DATE
   ORDER BY it.transaction_date DESC, csi.created_at DESC
   LIMIT 1;

  IF v_latest_closing_date IS NULL THEN
    v_latest_closing_date := '1970-01-01'::date;
    v_latest_closing_qty  := 0;
  END IF;

  -- Sum all purchases since that latest closing date
  SELECT COALESCE(SUM(pi.quantity), 0)
    INTO v_purchases_since
    FROM public.purchase_items pi
    JOIN public.inventory_transactions it ON it.id = pi.transaction_id
   WHERE pi.item_id = p_item_id
     AND it.transaction_date > v_latest_closing_date;

  RETURN v_latest_closing_qty + v_purchases_since;
END;
$$;

-- -----------------------------------------------------------------------------
-- STEP 4: Fix fn_after_closing_stock_insert to ACCUMULATE closing_qty in
--         stock_ledger (add) instead of REPLACE it.
--         Multiple closing entries per day must stack in the ledger too.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_after_closing_stock_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_tx_date       date;
  v_item_name     varchar;
  v_opening_qty   numeric := 0;
  v_prev_closing  numeric;
  v_prev_date     date;
  v_next_ledger   date;
BEGIN
  SELECT transaction_date
    INTO v_tx_date
    FROM public.inventory_transactions
   WHERE id = NEW.transaction_id;

  SELECT item_name
    INTO v_item_name
    FROM public.items
   WHERE id = NEW.item_id;

  SELECT closing_qty, ledger_date
    INTO v_prev_closing, v_prev_date
    FROM public.stock_ledger
   WHERE item_id = NEW.item_id
     AND ledger_date < v_tx_date
   ORDER BY ledger_date DESC
   LIMIT 1;

  IF v_prev_closing IS NOT NULL THEN
    v_opening_qty := v_prev_closing;
  ELSE
    SELECT COALESCE(current_stock, 0)
      INTO v_opening_qty
      FROM public.items
     WHERE id = NEW.item_id;
  END IF;

  INSERT INTO public.stock_ledger
    (item_id, item_name, ledger_date, date_for_opening, opening_qty, purchase_qty, closing_qty)
  VALUES
    (NEW.item_id, v_item_name, v_tx_date, v_prev_date, v_opening_qty, 0, NEW.total_qty)
  ON CONFLICT (item_id, ledger_date)
  DO UPDATE SET
    -- ACCUMULATE closing qty instead of replacing
    closing_qty      = stock_ledger.closing_qty + EXCLUDED.closing_qty,
    item_name        = EXCLUDED.item_name,
    opening_qty      = CASE
                         WHEN stock_ledger.opening_qty = 0
                         THEN EXCLUDED.opening_qty
                         ELSE stock_ledger.opening_qty
                       END,
    date_for_opening = CASE
                         WHEN stock_ledger.opening_qty = 0
                         THEN EXCLUDED.date_for_opening
                         ELSE stock_ledger.date_for_opening
                       END,
    updated_at       = now();

  SELECT MIN(ledger_date)
    INTO v_next_ledger
    FROM public.stock_ledger
   WHERE item_id = NEW.item_id
     AND ledger_date > v_tx_date;

  IF v_next_ledger IS NOT NULL THEN
    UPDATE public.stock_ledger
       SET opening_qty      = NEW.total_qty,
           date_for_opening = v_tx_date,
           updated_at       = now()
     WHERE item_id = NEW.item_id
       AND ledger_date = v_next_ledger;
  END IF;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- STEP 5: Create the midnight stock sync function.
--         Called by pg_cron every night at midnight to set current_stock =
--         accumulated daily closing total for each item that had a closing entry.
--         Items with no closing entry today are left unchanged.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_midnight_stock_sync()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_date date := CURRENT_DATE - 1;  -- yesterday (function runs just after midnight)
BEGIN
  UPDATE public.items i
     SET current_stock = sub.daily_closing
    FROM (
      SELECT csi.item_id,
             SUM(csi.total_qty) AS daily_closing
        FROM public.closing_stock_items csi
        JOIN public.inventory_transactions it ON it.id = csi.transaction_id
       WHERE it.transaction_date = v_date
       GROUP BY csi.item_id
    ) sub
   WHERE i.id = sub.item_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- STEP 6: Schedule fn_midnight_stock_sync via pg_cron (runs at 00:00 daily).
--         Requires the pg_cron extension to be enabled in Supabase:
--         Dashboard → Database → Extensions → pg_cron → Enable
-- -----------------------------------------------------------------------------
-- Uncomment and run after enabling pg_cron:
-- SELECT cron.schedule(
--   'midnight-stock-sync',
--   '0 0 * * *',
--   $$ SELECT public.fn_midnight_stock_sync(); $$
-- );

-- To test the midnight sync manually without waiting:
-- SELECT public.fn_midnight_stock_sync();
