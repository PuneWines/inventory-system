-- =============================================================================
-- DATABASE MIGRATION PATCH: ADD JSON PAGE ACCESS TO APP USERS
-- =============================================================================
-- Execute this script in your Supabase SQL Editor if you have already created
-- the 'app_users' table and want to add granular page access controls.
-- =============================================================================

-- 1. Add the page_access JSONB column with a default array for operators
ALTER TABLE public.app_users 
ADD COLUMN IF NOT EXISTS page_access jsonb NOT NULL DEFAULT '["entry_purchases", "entry_closing", "entry_cashtally", "ledger_table", "ledger_reports", "ledger_purchases", "ledger_sales", "ledger_closing"]'::jsonb;

-- 2. Backfill existing administrator accounts with full page access
UPDATE public.app_users 
SET page_access = '["entry_purchases", "entry_closing", "entry_cashtally", "ledger_table", "ledger_reports", "ledger_purchases", "ledger_sales", "ledger_closing", "master_items", "master_vendors", "users_management"]'::jsonb 
WHERE role = 'admin';

-- 3. Backfill existing operator accounts with standard entry and ledger access
UPDATE public.app_users 
SET page_access = '["entry_purchases", "entry_closing", "entry_cashtally", "ledger_table", "ledger_reports", "ledger_purchases", "ledger_sales", "ledger_closing"]'::jsonb 
WHERE role = 'operator';
