-- Inventory management: items + stock movements (in/out).
-- Run once in the Supabase SQL editor. Safe to re-run.

-- Catalogue of stock items
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT NOT NULL,
  category      TEXT,
  unit          TEXT DEFAULT 'pcs',        -- pcs, m, kg, set, etc.
  unit_cost     DECIMAL(15, 2) DEFAULT 0,  -- current/latest cost per unit (for valuation)
  reorder_level DECIMAL(15, 2) DEFAULT 0,  -- low-stock threshold
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Every stock movement. type = 'in' (purchase/receive) or 'out' (issued/used)
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id       UUID REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,             -- 'in' | 'out'
  quantity      DECIMAL(15, 2) DEFAULT 0,
  unit_price    DECIMAL(15, 2) DEFAULT 0,  -- purchase price per unit (for 'in')
  party         TEXT,                      -- supplier (in) / project-customer (out)
  reference     TEXT,                      -- invoice no / project id, etc.
  note          TEXT,
  movement_date DATE,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.inventory_items     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_inv_moves_item ON public.inventory_movements(item_id);
