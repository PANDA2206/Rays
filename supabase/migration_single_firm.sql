-- Consolidate to a single firm.
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- "Shri Data Traders and Electricals" had no real projects, inventory, or
-- EPC transactions — only an unused placeholder in-house EPC row created by
-- ensureInHouseEpc() when someone visited the EPC page under that firm.
-- Deleting it and the empty firm leaves Rays Energy Solutions as the one
-- firm going forward. The firm switcher UI is also removed from the app.

DELETE FROM public.epcs WHERE name = 'Shri Data Traders and Electricals (in-house)';
DELETE FROM public.firms WHERE name = 'Shri Data Traders and Electricals';
