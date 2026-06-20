-- =============================================================================
-- SQL PATCH: Sync Current Stock in Items Table
-- Run this in Supabase SQL Editor
-- =============================================================================

-- 1. Add current_stock column to public.items if it doesn't exist
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS current_stock numeric DEFAULT 0;

-- 2. Recalculate function to calculate current stock based on latest closing
--    stock plus subsequent purchases.
CREATE OR REPLACE FUNCTION public.fn_recalculate_current_stock(p_item_id bigint)
RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE
  v_latest_closing_date date;
  v_latest_closing_qty  numeric := 0;
  v_purchases_since     numeric := 0;
BEGIN
  -- Find the date and quantity of the most recent closing stock entry for this item
  SELECT it.transaction_date, csi.total_qty
    INTO v_latest_closing_date, v_latest_closing_qty
    FROM public.closing_stock_items csi
    JOIN public.inventory_transactions it ON it.id = csi.transaction_id
   WHERE csi.item_id = p_item_id
   ORDER BY it.transaction_date DESC, csi.created_at DESC
   LIMIT 1;

  -- If no closing stock entry exists, default to early date
  IF v_latest_closing_date IS NULL THEN
    v_latest_closing_date := '1970-01-01'::date;
    v_latest_closing_qty  := 0;
  END IF;

  -- Sum all purchases for this item since that latest closing stock date
  SELECT COALESCE(SUM(pi.quantity), 0)
    INTO v_purchases_since
    FROM public.purchase_items pi
    JOIN public.inventory_transactions it ON it.id = pi.transaction_id
   WHERE pi.item_id = p_item_id
     AND it.transaction_date > v_latest_closing_date;

  RETURN v_latest_closing_qty + v_purchases_since;
END;
$$;

-- 3. Trigger function to update the items table current_stock value
CREATE OR REPLACE FUNCTION public.fn_sync_current_stock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.items
       SET current_stock = public.fn_recalculate_current_stock(OLD.item_id)
     WHERE id = OLD.item_id;
    RETURN OLD;
  ELSE
    UPDATE public.items
       SET current_stock = public.fn_recalculate_current_stock(NEW.item_id)
     WHERE id = NEW.item_id;
    RETURN NEW;
  END IF;
END;
$$;

-- 4. Set up triggers on purchase_items and closing_stock_items
DROP TRIGGER IF EXISTS trg_sync_current_stock_purchase ON public.purchase_items;
CREATE TRIGGER trg_sync_current_stock_purchase
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_current_stock();

DROP TRIGGER IF EXISTS trg_sync_current_stock_closing ON public.closing_stock_items;
CREATE TRIGGER trg_sync_current_stock_closing
  AFTER INSERT OR UPDATE OR DELETE ON public.closing_stock_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_current_stock();

-- 5. Recalculate current_stock for all existing items initially
UPDATE public.items
   SET current_stock = public.fn_recalculate_current_stock(id);
