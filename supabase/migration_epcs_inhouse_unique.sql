-- Guard against the race in ensureInHouseEpc() (lib/db.ts) that let two
-- "in-house" partner rows get created for the same firm: React Strict Mode
-- double-fires the effect on the EPC page, and the check-then-insert there
-- has no DB-level guard, so both calls can pass the "does it exist?" check
-- before either insert lands.
-- Run once in the Supabase SQL editor. Safe to re-run.

-- If a duplicate already exists, keep the oldest row per firm before adding
-- the index, or this migration will fail:
--
--   DELETE FROM public.epcs a USING public.epcs b
--    WHERE LOWER(a.name) LIKE '%(in-house)%'
--      AND LOWER(b.name) LIKE '%(in-house)%'
--      AND a.firm_id = b.firm_id
--      AND a.created_at > b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS idx_epcs_one_inhouse_per_firm
  ON public.epcs (firm_id)
  WHERE LOWER(name) LIKE '%(in-house)%';
