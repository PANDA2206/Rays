-- Inventory v3: batch identity on items.
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- The same product bought at different times sits in stock at different rates.
-- To tell those batches apart, each item now carries the date it was bought,
-- and is labelled everywhere as "Name · unit · ₹rate · date".

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS purchase_date DATE;

-- Backfill existing items from their creation date so every item has one.
UPDATE public.inventory_items
   SET purchase_date = created_at::date
 WHERE purchase_date IS NULL;
