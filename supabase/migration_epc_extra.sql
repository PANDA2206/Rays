-- EPC extras: invoice numbers on transactions + a project-fee ledger.
-- Run once in the Supabase SQL editor. Safe to re-run.

-- 1) Invoice numbers on each purchase/sale transaction
ALTER TABLE public.epc_transactions
  ADD COLUMN IF NOT EXISTS purchase_invoice_no TEXT,
  ADD COLUMN IF NOT EXISTS sale_invoice_no     TEXT;

-- 2) Project fees received from an EPC (per customer)
CREATE TABLE IF NOT EXISTS public.epc_project_fees (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  epc_id        UUID REFERENCES public.epcs(id) ON DELETE CASCADE,
  customer_name TEXT,
  fee_date      DATE,
  amount        DECIMAL(15, 2) DEFAULT 0,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.epc_project_fees DISABLE ROW LEVEL SECURITY;
