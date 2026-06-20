-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

create table public.items (
  id bigserial not null,
  item_name character varying(255) null,
  created_at timestamp with time zone null default now(),
  mrp bigint null,
  constraint items_pkey primary key (id)
) TABLESPACE pg_default;

create index IF not exists idx_items_name on public.items using btree (item_name) TABLESPACE pg_default;
CREATE TABLE public.vendors (
  id bigint NOT NULL DEFAULT nextval('vendors_id_seq'::regclass),
  vendor_name character varying NOT NULL UNIQUE,
  contact_no character varying,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT vendors_pkey PRIMARY KEY (id)
);
CREATE TABLE public.inventory_transactions (
  id bigint NOT NULL DEFAULT nextval('inventory_transactions_id_seq'::regclass),
  transaction_date date NOT NULL,
  transaction_type character varying NOT NULL CHECK (transaction_type::text = ANY (ARRAY['purchase'::character varying, 'closing_stock'::character varying, 'sale_amount'::character varying]::text[])),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT inventory_transactions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.purchase_items (
  id bigint NOT NULL DEFAULT nextval('purchase_items_id_seq'::regclass),
  transaction_id bigint NOT NULL,
  item_id bigint NOT NULL,
  vendor_id bigint,
  purchase_rate numeric DEFAULT 0,
  quantity numeric DEFAULT 0,
  gst_percent numeric DEFAULT 0,
  discount numeric DEFAULT 0,
  discount_type character varying,
  total_amount numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT purchase_items_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_items_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.inventory_transactions(id),
  CONSTRAINT purchase_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id),
  CONSTRAINT purchase_items_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id)
);
CREATE TABLE public.closing_stock_items (
  id bigint NOT NULL DEFAULT nextval('closing_stock_items_id_seq'::regclass),
  transaction_id bigint NOT NULL,
  item_id bigint NOT NULL,
  last_closing_qty numeric DEFAULT 0,
  godown_qty numeric DEFAULT 0,
  counter_qty numeric DEFAULT 0,
  total_qty numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT closing_stock_items_pkey PRIMARY KEY (id),
  CONSTRAINT closing_stock_items_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.inventory_transactions(id),
  CONSTRAINT closing_stock_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id)
);
CREATE TABLE public.daily_sales_summary (
  id bigint NOT NULL DEFAULT nextval('daily_sales_summary_id_seq'::regclass),
  transaction_id bigint NOT NULL UNIQUE,
  gpay_amount numeric DEFAULT 0,
  cash_amount numeric DEFAULT 0,
  expense_amount numeric DEFAULT 0,
  total_closing_amount numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT daily_sales_summary_pkey PRIMARY KEY (id),
  CONSTRAINT daily_sales_summary_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.inventory_transactions(id)
);