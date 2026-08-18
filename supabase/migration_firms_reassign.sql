-- Re-assign existing work to the right firm, by who executed it.
-- Run once in the Supabase SQL editor, AFTER migration_firms.sql. Safe to re-run.
--
-- Rule:
--   execution_partner = Voltedge / Voltedge (in-house)  ->  firm Voltedge Energy Solutions
--   everything else                                     ->  firm Shri Data Traders and Electricals
--
-- The two firms each get their own in-house partner row, named the same way, so
-- "who executed it" and "which firm's books" never read as the same field:
--   Shri Datta (in-house)   <- was "SHRI DATTA TRADERS AND ELECTRICALS"
--   Voltedge (in-house)     <- was "Voltedge"
--
-- Partner renames and projects.execution_partner are updated together, in one
-- transaction. Renaming a partner without the projects that point at it would
-- silently break the EPC page's project-to-partner matching.

BEGIN;

-- ── 1. Shri Datta's own row becomes its in-house partner ─────────────────────
UPDATE public.projects
   SET execution_partner = 'Shri Datta (in-house)'
 WHERE LOWER(TRIM(COALESCE(execution_partner, ''))) IN (
   'shri datta traders and electricals',
   'shri data traders and electricals',
   'shri datta traders & electricals',
   'shri data traders & electricals'
 );

UPDATE public.epcs
   SET name = 'Shri Datta (in-house)'
 WHERE LOWER(TRIM(name)) IN (
   'shri datta traders and electricals',
   'shri data traders and electricals',
   'shri datta traders & electricals',
   'shri data traders & electricals'
 );

-- ── 2. Projects executed by Voltedge move to the Voltedge firm ───────────────
UPDATE public.projects
   SET execution_partner = 'Voltedge (in-house)'
 WHERE LOWER(TRIM(COALESCE(execution_partner, ''))) = 'voltedge';

UPDATE public.projects
   SET firm_id = (SELECT id FROM public.firms WHERE name = 'Voltedge Energy Solutions')
 WHERE LOWER(TRIM(COALESCE(execution_partner, ''))) = 'voltedge (in-house)';

-- ── 3. Everything else stays with Shri Data ──────────────────────────────────
UPDATE public.projects
   SET firm_id = (SELECT id FROM public.firms WHERE name = 'Shri Data Traders and Electricals')
 WHERE LOWER(TRIM(COALESCE(execution_partner, ''))) <> 'voltedge (in-house)';

-- ── 4. Each in-house partner row belongs to its own firm ─────────────────────
--    Outside partners (individuals) stay with Shri Data, which is who engaged them.
UPDATE public.epcs
   SET firm_id = (SELECT id FROM public.firms WHERE name = 'Voltedge Energy Solutions')
 WHERE LOWER(TRIM(name)) = 'voltedge (in-house)';

UPDATE public.epcs
   SET firm_id = (SELECT id FROM public.firms WHERE name = 'Shri Data Traders and Electricals')
 WHERE LOWER(TRIM(name)) <> 'voltedge (in-house)'
   AND firm_id IS DISTINCT FROM (SELECT id FROM public.firms WHERE name = 'Shri Data Traders and Electricals');

COMMIT;


-- ─────────────────────────────────────────────────────────────────────────────
-- PREVIEW — run this BEFORE the migration to see what moves where.
-- ─────────────────────────────────────────────────────────────────────────────
--
--   SELECT COALESCE(NULLIF(TRIM(execution_partner), ''), '(blank)') AS partner,
--          COUNT(*) AS projects,
--          SUM(COALESCE(total_cost, 0))  AS total_cost,
--          SUM(COALESCE(amount_paid, 0)) AS received,
--          CASE WHEN LOWER(TRIM(COALESCE(execution_partner,''))) IN ('voltedge','voltedge (in-house)')
--               THEN 'Voltedge Energy Solutions' ELSE 'Shri Data Traders and Electricals' END AS goes_to_firm
--     FROM public.projects
--    GROUP BY 1, 5
--    ORDER BY projects DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION — run AFTER. Expect no blanks and no old names.
-- ─────────────────────────────────────────────────────────────────────────────
--
--   SELECT f.name AS firm, COUNT(p.id) AS projects,
--          SUM(COALESCE(p.total_cost,0)) AS value
--     FROM public.firms f LEFT JOIN public.projects p ON p.firm_id = f.id
--    GROUP BY f.name ORDER BY f.name;
--
--   SELECT e.name AS partner, f.name AS firm
--     FROM public.epcs e LEFT JOIN public.firms f ON f.id = e.firm_id
--    ORDER BY f.name, e.name;
--
--   SELECT COUNT(*) AS projects_with_no_firm FROM public.projects WHERE firm_id IS NULL;
