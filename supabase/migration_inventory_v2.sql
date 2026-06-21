-- Inventory v2: base/GST + expenses on movements, EPC↔inventory link, expenses table.
-- Run once in the Supabase SQL editor. Safe to re-run.

-- 1) Movements: carry purchase/sale base + GST, an attached expense, and a link
--    back to the EPC sale that generated it (so deleting the EPC entry can undo it).
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS base_amount DECIMAL(15, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_pct     DECIMAL(5, 2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expense     DECIMAL(15, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source      TEXT,            -- e.g. 'epc_sale', 'manual'
  ADD COLUMN IF NOT EXISTS source_ref  TEXT;            -- epc_transactions.id when source='epc_sale'

-- 2) Standalone expense ledger (transport, labour, light bill, rent, petrol, …)
CREATE TABLE IF NOT EXISTS public.inventory_expenses (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category     TEXT,
  description  TEXT,
  amount       DECIMAL(15, 2) DEFAULT 0,
  tax          DECIMAL(15, 2) DEFAULT 0,
  expense_date DATE,
  source       TEXT,
  source_ref   TEXT,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.inventory_expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_expenses
  ADD COLUMN IF NOT EXISTS source     TEXT,
  ADD COLUMN IF NOT EXISTS source_ref TEXT;

-- 3) EPC sale entries can point at an inventory item + quantity (to drive Stock Out)
ALTER TABLE public.epc_transactions
  ADD COLUMN IF NOT EXISTS sale_item_id  UUID,
  ADD COLUMN IF NOT EXISTS sale_quantity DECIMAL(15, 2) DEFAULT 0;
