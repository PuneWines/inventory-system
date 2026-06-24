-- =============================================================================
-- DATABASE SCHEMA: APP USERS & granular ACCESS CONTROL
-- =============================================================================
-- This script creates the 'app_users' table to support the user login system.
-- As per explicit requirements, passwords are stored in PLAIN TEXT (no hashing).
-- Admins can configure custom page-level permissions saved in JSON format.
-- =============================================================================

-- 1. Create the app_users table with JSON page access controls
CREATE TABLE IF NOT EXISTS public.app_users (
  id bigserial PRIMARY KEY,
  username character varying(255) NOT NULL UNIQUE,
  password character varying(255) NOT NULL, -- Stores PLAIN TEXT credentials
  role character varying(50) NOT NULL DEFAULT 'operator', -- 'admin' | 'operator'
  shop_id bigint NULL REFERENCES public.shop(id) ON DELETE SET NULL, -- outlet assignment scope
  is_approved boolean NOT NULL DEFAULT false, -- admin approval gate
  page_access jsonb NOT NULL DEFAULT '["entry_purchases", "entry_closing", "entry_cashtally", "ledger_table", "ledger_reports", "ledger_purchases", "ledger_sales", "ledger_closing"]'::jsonb, -- JSON array of allowed tabs
  created_at timestamp with time zone NULL DEFAULT now()
);

-- 2. Create index for fast query performance
CREATE INDEX IF NOT EXISTS idx_app_users_username ON public.app_users(username);

-- 3. Seed default administrator account (Username: admin, Password: admin123)
-- Admins receive full access to all system pages by default.
INSERT INTO public.app_users (username, password, role, is_approved, page_access)
VALUES (
  'admin',
  'admin123', -- Plain text password
  'admin',
  true,
  '["entry_purchases", "entry_closing", "entry_cashtally", "ledger_table", "ledger_reports", "ledger_purchases", "ledger_sales", "ledger_closing", "master_items", "master_vendors", "users_management"]'::jsonb
)
ON CONFLICT (username) DO NOTHING;

-- 4. Seed default operator account for testing (Username: operator, Password: operator123)
-- Operators receive entry and ledger access by default.
-- Shop assignment dynamically queries the first available shop, or falls back to NULL if empty.
INSERT INTO public.app_users (username, password, role, shop_id, is_approved, page_access)
VALUES (
  'operator',
  'operator123', -- Plain text password
  'operator',
  (SELECT id FROM public.shop LIMIT 1), -- Dynamically fetch first shop ID, or NULL if none exists
  true,
  '["entry_purchases", "entry_closing", "entry_cashtally", "ledger_table", "ledger_reports", "ledger_purchases", "ledger_sales", "ledger_closing"]'::jsonb
)
ON CONFLICT (username) DO NOTHING;
