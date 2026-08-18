-- Subsidy out of the money calculations + workflow step reorder.
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Measured against live data on 18 Aug 2026 (114 projects):
--   • 38 subsidy rows worth ₹29,63,999 overstating Received
--   • 40 projects' totals corrected
--   • 456 workflow step rows renumbered
--   • 0 pending installments, so the paid-only rule changes nothing existing
--
-- Wrapped in a transaction: all three steps commit together, or none do.
-- Read the verification queries at the bottom BEFORE and AFTER running this.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Workflow reorder: Meter Testing moves to #6; the three steps it overtakes
--    shift down to 7-9. Keyed on step_name, so each step keeps its own status,
--    start_date and end_date — only the number (and therefore the order) moves.
--
--    Done in two passes because step_no has to pass through values that are
--    briefly occupied by another row of the same project.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.project_steps SET step_no = step_no + 100
WHERE step_name IN (
  'Meter Testing',
  'Structure Fabrication',
  'Electrical Installation',
  'Release Order Application'
);

UPDATE public.project_steps SET step_no = CASE step_name
    WHEN 'Meter Testing'             THEN 6
    WHEN 'Structure Fabrication'     THEN 7
    WHEN 'Electrical Installation'   THEN 8
    WHEN 'Release Order Application' THEN 9
  END
WHERE step_no > 100;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Remove the subsidy rows that were posted as payments.
--    The old build inserted a PAID installment with payment_type='Subsidy' when
--    a subsidy was marked disbursed, which inflated Received and understated
--    Due. The subsidy is paid by the government to the customer, never to us,
--    so those rows should never have existed.
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM public.installments
WHERE LOWER(COALESCE(payment_type, '')) = 'subsidy';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Re-derive every project's amount_paid and balance from the installment
--    rows that remain, counting ONLY those marked paid. A pending installment
--    is a promise, not money in hand, so it must not reduce what is due.
--    This also repairs any drift left by the old per-call arithmetic.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.projects p
SET amount_paid = COALESCE(i.total, 0),
    balance     = COALESCE(p.total_cost, 0) - COALESCE(i.total, 0)
FROM (
  SELECT pr.id AS project_id,
         (SELECT COALESCE(SUM(amount), 0)
            FROM public.installments
           WHERE project_id = pr.id
             AND LOWER(COALESCE(status, '')) = 'paid') AS total
  FROM public.projects pr
) i
WHERE p.id = i.project_id;

COMMIT;


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION — run these separately, before and after.
-- ─────────────────────────────────────────────────────────────────────────────

-- How many subsidy payment rows exist, and what they inflate Received by.
-- Expect a count > 0 before, and exactly 0 after.
--
--   SELECT COUNT(*) AS rows, COALESCE(SUM(amount), 0) AS inflated_by
--     FROM public.installments
--    WHERE LOWER(COALESCE(payment_type, '')) = 'subsidy';

-- Step order for one project. Expect 1-14 with Meter Testing at 6.
--
--   SELECT step_no, step_name, status
--     FROM public.project_steps
--    WHERE project_id = '<paste-a-project-uuid>'
--    ORDER BY step_no;

-- Any project whose stored totals disagree with its PAID installments.
-- Expect zero rows after.
--
--   SELECT p.id, p.customer_name, p.amount_paid, p.balance, p.total_cost
--     FROM public.projects p
--    WHERE p.amount_paid IS DISTINCT FROM (
--            SELECT COALESCE(SUM(amount), 0) FROM public.installments
--             WHERE project_id = p.id AND LOWER(COALESCE(status, '')) = 'paid');

-- Preview of exactly which projects this migration changes, and by how much.
-- Run this BEFORE the migration to see the damage the subsidy bug caused.
--
--   SELECT p.customer_name,
--          p.amount_paid                       AS received_now,
--          COALESCE(fixed.total, 0)            AS received_after,
--          p.amount_paid - COALESCE(fixed.total, 0) AS overstated_by
--     FROM public.projects p
--     LEFT JOIN LATERAL (
--       SELECT COALESCE(SUM(amount), 0) AS total
--         FROM public.installments
--        WHERE project_id = p.id
--          AND LOWER(COALESCE(status, '')) = 'paid'
--          AND LOWER(COALESCE(payment_type, '')) <> 'subsidy'
--     ) fixed ON TRUE
--    WHERE p.amount_paid IS DISTINCT FROM COALESCE(fixed.total, 0)
--    ORDER BY overstated_by DESC;
