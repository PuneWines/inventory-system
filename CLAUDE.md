# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Vite dev server (http://localhost:5173)
npm run build      # Production build → dist/
npm run preview    # Preview production build
npm run lint       # Run ESLint
```

No test suite is configured. Verification is done by running the dev server.

## Environment Setup

Requires a `.env` file with:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

If these are absent, the app falls back to localStorage-based mock data with default users `admin/admin123` and `operator/operator123`.

## Architecture Overview

**Stack:** React 19 + Vite + Tailwind CSS 4 + Supabase (PostgreSQL) + Chart.js

### Auth & Session

- Session stored in localStorage under key `vishal_snacks_user`
- Two roles: `admin` (global, all shops) and `operator` (scoped to a single `shop_id`)
- Granular page-level access via `page_access` JSON array on `app_users`
- Permission groups: `entry_*` (data entry), `ledger_*` (reports/views), `master_*` (CRUD), `users_management`, `manager_report`

### Data Layer

All database access is centralized in [src/services/dbService.js](src/services/dbService.js) (~2200 lines). Every function checks `if (!supabase)` first and falls back to localStorage mocks.

Key transaction functions:
- `submitPurchaseTransaction()` — inserts into `inventory_transactions` + `purchase_items`
- `submitClosingStockTransaction()` — inserts into `inventory_transactions` + `closing_stock_items`
- `submitSaleAmountTransaction()` — inserts into `inventory_transactions` + `daily_sales_summary` + auto-creates `manager_report` row

### Database Schema (10 tables)

- **items** — master list with `current_stock`, `opening_qty`; `current_stock` is recalculated by trigger on every purchase/closing insert
- **vendors** — supplier master, unique per shop
- **shop** — multi-tenant root; operators are scoped to one shop
- **inventory_transactions** — header record for each entry session (`purchase` | `closing_stock` | `sale_amount`)
- **purchase_items**, **closing_stock_items**, **daily_sales_summary** — line-item detail tables
- **stock_ledger** — NOT transactional; populated by DB triggers after purchase/closing, finalized nightly
- **sale_history** — calculated nightly from closing stock deltas
- **app_users** — users with role and `page_access[]`
- **manager_report** — running finance summary per shop per day

### Stock Ledger Flow (critical non-obvious logic)

1. After a purchase insert → trigger `fn_after_purchase_item_insert` creates/upserts a `stock_ledger` row with `opening_qty` = previous day's `closing_qty`
2. After a closing insert → trigger `fn_after_closing_stock_insert` updates that row
3. At midnight → `fn_midnight_stock_sync` finalizes `closing_qty`, computes `sale_qty = opening + purchase - closing`, and writes `sale_history`
4. `sale_qty` is **derived**, never entered by users

### Component Structure

- [src/App.jsx](src/App.jsx) — auth guard, top-level routing between views
- [src/Inventory.jsx](src/Inventory.jsx) — three-tab data entry hub (Purchase / Closing / Cash Tally); tabs shown based on `page_access`
- [src/components/FormEntry.jsx](src/components/FormEntry.jsx) — standalone form-entry UI (same tabs, different layout)
- [src/components/Sidebar.jsx](src/components/Sidebar.jsx) — nav with permission-gated links
- [src/components/StockLedger.jsx](src/components/StockLedger.jsx) — ledger view with Chart.js graphs
- All other components in [src/components/](src/components/) are report/audit tables or CRUD UIs

### Multi-Shop Scoping

Operators always have their `shop_id` pre-selected and locked. Admins see all shops and can switch via dropdown. Shop filtering is applied inside each `dbService` function — always pass `currentUser.shop_id` (null for admin = all shops).

### SQL Files

SQL files in the project root are migration/patch scripts to be run against Supabase manually — they are not executed by the app. Key files:
- [SCHEMA.sql](SCHEMA.sql) — canonical table definitions
- [Funtions.sql](Funtions.sql) — all DB trigger functions (note the intentional typo in filename)
- [SQL_MIDNIGHT_SYNC_FUNCTION.sql](SQL_MIDNIGHT_SYNC_FUNCTION.sql) — nightly sync logic
- `SQL_PATCH_*.sql` files — incremental bug fixes applied after initial schema setup
