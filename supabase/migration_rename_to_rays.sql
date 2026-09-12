-- Rebrand: "Voltedge Energy Solutions" -> "Rays Energy Solutions".
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- The admin login email (voltedgeenergysolutions011@gmail.com) is untouched
-- here on purpose — it's a real login credential, not branding text.

UPDATE public.firms SET name = 'Rays Energy Solutions' WHERE name = 'Voltedge Energy Solutions';
