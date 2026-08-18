-- Two-firm separation.
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- All work up to now was done under "Shri Data Traders and Electricals".
-- From here on, work can be booked under either that firm or the new
-- "Voltedge Energy Solutions", and the two must never mix in any figure.
--
-- Only four tables carry firm_id. Everything else inherits its firm from its
-- parent — installments/steps/docs/notes from their project, stock movements
-- from their item, EPC transactions and project fees from their EPC — so there
-- is exactly one place per record that decides which firm it belongs to, and
-- nothing can end up half-assigned.

BEGIN;

-- ── 1. The firms ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.firms (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.firms DISABLE ROW LEVEL SECURITY;

INSERT INTO public.firms (name) VALUES
  ('Shri Data Traders and Electricals'),
  ('Voltedge Energy Solutions')
ON CONFLICT (name) DO NOTHING;

-- ── 2. Firm ownership columns ────────────────────────────────────────────────
ALTER TABLE public.projects           ADD COLUMN IF NOT EXISTS firm_id UUID REFERENCES public.firms(id);
ALTER TABLE public.inventory_items    ADD COLUMN IF NOT EXISTS firm_id UUID REFERENCES public.firms(id);
ALTER TABLE public.inventory_expenses ADD COLUMN IF NOT EXISTS firm_id UUID REFERENCES public.firms(id);
ALTER TABLE public.epcs               ADD COLUMN IF NOT EXISTS firm_id UUID REFERENCES public.firms(id);

-- ── 3. Everything that exists today belongs to Shri Data ─────────────────────
UPDATE public.projects           SET firm_id = (SELECT id FROM public.firms WHERE name = 'Shri Data Traders and Electricals') WHERE firm_id IS NULL;
UPDATE public.inventory_items    SET firm_id = (SELECT id FROM public.firms WHERE name = 'Shri Data Traders and Electricals') WHERE firm_id IS NULL;
UPDATE public.inventory_expenses SET firm_id = (SELECT id FROM public.firms WHERE name = 'Shri Data Traders and Electricals') WHERE firm_id IS NULL;
UPDATE public.epcs               SET firm_id = (SELECT id FROM public.firms WHERE name = 'Shri Data Traders and Electricals') WHERE firm_id IS NULL;

-- ── 4. Free the name "Voltedge" from the partner list ────────────────────────
--    It now names a firm, so the EPC row meaning "we did it ourselves" is
--    relabelled. projects.execution_partner is updated in step with it, or the
--    EPC page would stop matching those projects to their partner.
UPDATE public.epcs
   SET name = 'Voltedge (in-house)'
 WHERE LOWER(TRIM(name)) = 'voltedge';

UPDATE public.projects
   SET execution_partner = 'Voltedge (in-house)'
 WHERE LOWER(TRIM(COALESCE(execution_partner, ''))) = 'voltedge';

CREATE INDEX IF NOT EXISTS idx_projects_firm   ON public.projects(firm_id);
CREATE INDEX IF NOT EXISTS idx_inv_items_firm  ON public.inventory_items(firm_id);
CREATE INDEX IF NOT EXISTS idx_inv_exp_firm    ON public.inventory_expenses(firm_id);
CREATE INDEX IF NOT EXISTS idx_epcs_firm       ON public.epcs(firm_id);

COMMIT;


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION — run separately after the migration.
-- Expect: every row assigned, nothing left on the old "Voltedge" partner name.
-- ─────────────────────────────────────────────────────────────────────────────
--
--   SELECT f.name, COUNT(p.id) AS projects
--     FROM public.firms f LEFT JOIN public.projects p ON p.firm_id = f.id
--    GROUP BY f.name ORDER BY f.name;
--
--   SELECT
--     (SELECT COUNT(*) FROM public.projects           WHERE firm_id IS NULL) AS projects_unassigned,
--     (SELECT COUNT(*) FROM public.inventory_items    WHERE firm_id IS NULL) AS items_unassigned,
--     (SELECT COUNT(*) FROM public.inventory_expenses WHERE firm_id IS NULL) AS expenses_unassigned,
--     (SELECT COUNT(*) FROM public.epcs               WHERE firm_id IS NULL) AS epcs_unassigned,
--     (SELECT COUNT(*) FROM public.epcs               WHERE LOWER(TRIM(name)) = 'voltedge') AS old_partner_name;
