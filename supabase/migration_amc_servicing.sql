-- AMC / Servicing: post-installation maintenance tracking.
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Applies only to completed projects (the app enforces this client-side).
-- Tracks 3 fixed service types (cleaning, checkup, repairing) per project,
-- whether each is covered by an AMC, when it was last serviced, and reminders
-- sent to the customer. No firm_id columns — these inherit firm scope through
-- project_id -> projects.firm_id, same as installments/steps/docs/notes.

BEGIN;

-- ── 1. AMC master record — one per project ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_amc (
  id                        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id                UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  amc_taken                 BOOLEAN NOT NULL DEFAULT false,
  plan_type                 TEXT NOT NULL DEFAULT 'none' CHECK (plan_type IN ('none','partial','full')),
  reminder_interval_months  INTEGER NOT NULL DEFAULT 3,
  created_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT project_amc_one_per_project UNIQUE (project_id)
);
ALTER TABLE public.project_amc DISABLE ROW LEVEL SECURITY;

-- ── 2. Per-service state — 3 fixed rows per project ──────────────────────────
-- customer_response tracks "said yes, not yet formalized" independent of
-- in_amc/due-date math: in_amc=false + customer_response='said_yes' means
-- exactly that. UNIQUE(project_id, service_type) guards against the same
-- check-then-insert race that hit epcs before (migration_epcs_inhouse_unique.sql).
CREATE TABLE IF NOT EXISTS public.project_amc_services (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id          UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  service_type        TEXT NOT NULL CHECK (service_type IN ('cleaning','checkup','repairing')),
  in_amc              BOOLEAN NOT NULL DEFAULT false,
  customer_response   TEXT NOT NULL DEFAULT 'none' CHECK (customer_response IN ('none','proposed','said_yes','declined')),
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT project_amc_services_one_per_type UNIQUE (project_id, service_type)
);
ALTER TABLE public.project_amc_services DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_amc_services_project ON public.project_amc_services(project_id);

-- ── 3. Service history ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.amc_service_logs (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  service_type  TEXT NOT NULL CHECK (service_type IN ('cleaning','checkup','repairing')),
  service_date  DATE NOT NULL,
  technician    TEXT,
  amount        DECIMAL(12, 2) DEFAULT 0,
  note          TEXT,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.amc_service_logs DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_amc_service_logs_project ON public.amc_service_logs(project_id, service_type, service_date DESC);

-- ── 4. Reminder history ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.amc_reminder_logs (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  service_type  TEXT NOT NULL CHECK (service_type IN ('cleaning','checkup','repairing')),
  channel       TEXT NOT NULL DEFAULT 'call' CHECK (channel IN ('call','whatsapp','sms','visit','other')),
  note          TEXT,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.amc_reminder_logs DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_amc_reminder_logs_project ON public.amc_reminder_logs(project_id, service_type, created_at DESC);

COMMIT;


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION — run separately after the migration.
-- ─────────────────────────────────────────────────────────────────────────────
--
--   SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'public'
--      AND table_name IN ('project_amc','project_amc_services','amc_service_logs','amc_reminder_logs');
--   Expect 4 rows.
--
--   SELECT conname FROM pg_constraint
--    WHERE conname IN ('project_amc_one_per_project','project_amc_services_one_per_type');
--   Expect 2 rows (both UNIQUE constraints present).
