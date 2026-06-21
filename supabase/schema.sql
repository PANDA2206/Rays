-- ============================================================================
-- VOLTEDGE ERP — FULL schema for a BRAND-NEW (empty) Supabase project.
-- Run this once in the new project's SQL editor. Creates every table the app
-- uses, with no data. Safe to re-run (IF NOT EXISTS). RLS is disabled because
-- the app talks to Supabase with the anon/publishable key (like the Streamlit app).
-- ============================================================================

-- ── Projects ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projects (
  id                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_code           TEXT,
  customer_name          TEXT NOT NULL,
  mobile                 TEXT,
  alt_mobile             TEXT,
  email                  TEXT,
  aadhar_number          TEXT,
  pan_number             TEXT,
  electricity_bill_id    TEXT,
  location               TEXT,
  installation_address   TEXT,
  village                TEXT,
  taluka                 TEXT,
  district               TEXT,
  pincode                TEXT,
  longitude_latitude     TEXT,
  execution_partner      TEXT,
  epc_name               TEXT,
  system_size_kwp        DECIMAL(10, 2),
  connection_type        TEXT,
  discom                 TEXT DEFAULT 'MSEDCL',
  project_status         TEXT,
  payment_mode           TEXT,
  total_cost             DECIMAL(15, 2) DEFAULT 0,
  amount_paid            DECIMAL(15, 2) DEFAULT 0,
  advance_amount         DECIMAL(15, 2) DEFAULT 0,
  subsidy_amount         DECIMAL(15, 2) DEFAULT 0,
  subsidy_status         VARCHAR(20)    DEFAULT 'pending',
  subsidy_applied_date   DATE,
  subsidy_disbursed_date DATE,
  bank_name              TEXT,
  bank_loan_amount       DECIMAL(15, 2) DEFAULT 0,
  bank_quotation_amount  DECIMAL(15, 2) DEFAULT 0,
  loan_status            TEXT,
  balance                DECIMAL(15, 2) DEFAULT 0,
  net_payable            DECIMAL(15, 2) DEFAULT 0,
  notes                  TEXT,
  created_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── Installments (project-based) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.installments (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id     UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  installment_no INTEGER,
  amount         DECIMAL(15, 2) DEFAULT 0,
  due_date       DATE,
  status         VARCHAR(20) DEFAULT 'pending',
  payment_type   TEXT,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── App users (login role + approval status) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_users (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  picture       TEXT,
  role          TEXT DEFAULT 'employee',
  status        TEXT DEFAULT 'pending',
  employee_code TEXT,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── Activity log ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email   TEXT,
  user_name    TEXT,
  user_picture TEXT,
  action       TEXT,
  entity_type  TEXT,
  project_id   TEXT,
  project_name TEXT,
  details      TEXT,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── Project workflow steps ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_steps (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id       UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  step_no          INTEGER,
  step_name        TEXT,
  status           TEXT DEFAULT 'pending',
  progress_percent INTEGER DEFAULT 0,
  start_date       DATE,
  end_date         DATE,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── Project documents checklist ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_documents (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  doc_name   TEXT,
  status     TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── Internal project notes ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_notes (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id  UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  note        TEXT,
  next_action TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── EPC partners + transactions ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.epcs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name            TEXT NOT NULL,
  mobile          TEXT,
  email           TEXT,
  address         TEXT,
  aadhar          TEXT,
  personal_amount DECIMAL(15, 2) DEFAULT 0,
  gst_received    DECIMAL(15, 2) DEFAULT 0,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.epc_transactions (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  epc_id              UUID REFERENCES public.epcs(id) ON DELETE CASCADE,
  customer_name       TEXT,
  purchase_material   TEXT,
  purchase_base       DECIMAL(15, 2) DEFAULT 0,
  purchase_gst_pct    DECIMAL(5, 2)  DEFAULT 0,
  purchase_invoice_no TEXT,
  sale_material       TEXT,
  sale_base           DECIMAL(15, 2) DEFAULT 0,
  sale_gst_pct        DECIMAL(5, 2)  DEFAULT 0,
  sale_invoice_no     TEXT,
  sale_item_id        UUID,
  sale_quantity       DECIMAL(15, 2) DEFAULT 0,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Project fees received from an EPC (per customer)
CREATE TABLE IF NOT EXISTS public.epc_project_fees (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  epc_id        UUID REFERENCES public.epcs(id) ON DELETE CASCADE,
  customer_name TEXT,
  fee_date      DATE,
  amount        DECIMAL(15, 2) DEFAULT 0,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── Disable RLS (app uses the anon/publishable key) ─────────────────────────
ALTER TABLE public.projects          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.installments      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_steps     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_notes     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.epcs              DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.epc_transactions  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.epc_project_fees  DISABLE ROW LEVEL SECURITY;

-- ── Inventory ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT NOT NULL,
  category      TEXT,
  unit          TEXT DEFAULT 'pcs',
  unit_cost     DECIMAL(15, 2) DEFAULT 0,
  reorder_level DECIMAL(15, 2) DEFAULT 0,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id       UUID REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  quantity      DECIMAL(15, 2) DEFAULT 0,
  unit_price    DECIMAL(15, 2) DEFAULT 0,
  base_amount   DECIMAL(15, 2) DEFAULT 0,
  gst_pct       DECIMAL(5, 2)  DEFAULT 0,
  expense       DECIMAL(15, 2) DEFAULT 0,
  source        TEXT,
  source_ref    TEXT,
  party         TEXT,
  reference     TEXT,
  note          TEXT,
  movement_date DATE,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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

ALTER TABLE public.inventory_items     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_expenses  DISABLE ROW LEVEL SECURITY;

-- ── Helpful indexes ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projects_status      ON public.projects(project_status);
CREATE INDEX IF NOT EXISTS idx_projects_created_at  ON public.projects(created_at);
CREATE INDEX IF NOT EXISTS idx_installments_project ON public.installments(project_id);
CREATE INDEX IF NOT EXISTS idx_steps_project        ON public.project_steps(project_id);
CREATE INDEX IF NOT EXISTS idx_docs_project         ON public.project_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_notes_project        ON public.project_notes(project_id);
CREATE INDEX IF NOT EXISTS idx_logs_created_at      ON public.activity_logs(created_at);
