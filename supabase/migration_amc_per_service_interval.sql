-- Each service now decides its own recurrence and interval at Formalize time,
-- instead of one shared reminder_interval_months for the whole project.
-- Run once in the Supabase SQL editor. Safe to re-run.

ALTER TABLE public.project_amc_services
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS interval_months INTEGER NOT NULL DEFAULT 3;
