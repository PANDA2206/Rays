-- Quotation templates.
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Only the TEMPLATES live here — a few KB of text. Generated quotations are
-- never stored: they are composed in the browser and printed to PDF, so they
-- cost nothing in the database.
--
-- A template is the standard bill of materials for one system shape
-- (1-phase / 3-phase, within a kW band). Its lines carry the technical
-- specification and make, which inventory does not track.

CREATE TABLE IF NOT EXISTS public.quotation_templates (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL,
  phase      TEXT NOT NULL DEFAULT '3ph',       -- '1ph' | '3ph'
  min_kw     DECIMAL(10, 2) DEFAULT 0,
  max_kw     DECIMAL(10, 2) DEFAULT 9999,
  -- [{ sr, item, spec, make, qty, unit }]
  lines      JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.quotation_templates DISABLE ROW LEVEL SECURITY;

-- ── Seed: 3-Phase up to 6 kW, taken verbatim from the Mr. Munod 5 kW quotation ──
INSERT INTO public.quotation_templates (name, phase, min_kw, max_kw, lines)
SELECT '3-Phase · up to 6 kW', '3ph', 0, 6, '[
  {"sr":"I",  "item":"SOLAR PANELS",        "spec":"Topcon / Bifacial Panel",     "make":"WAARE/VIKRAM",      "qty":"9/10",        "unit":"Nos"},
  {"sr":"II", "item":"SOLAR INVERTER",      "spec":"3 PH Grid tie Inverter",      "make":"POLYCAB",           "qty":"1",           "unit":"Nos"},
  {"sr":"III","item":"ACDB",                "spec":"3Ph 2 IN 2 OUT MCB+ SPD",     "make":"Havells, Schnider", "qty":"1",           "unit":"Nos"},
  {"sr":"III","item":"DCDB",                "spec":"3Ph 2 IN 2 OUT MCB+ SPD",     "make":"Havells, Schnider", "qty":"1",           "unit":"Nos"},
  {"sr":"III","item":"AC CABLE",            "spec":"4C, 4Sqmm Copper",            "make":"POLYCAB",           "qty":"As Required", "unit":"Mtr"},
  {"sr":"III","item":"DC CABLE",            "spec":"1C* 4 Sqmm Copper",           "make":"POLYCAB",           "qty":"As Required", "unit":"Mtr"},
  {"sr":"III","item":"EARTHING CABLE",      "spec":"1Cu*6 Sqmm Flexible",         "make":"POLYCAB",           "qty":"As Required", "unit":"Mtr"},
  {"sr":"III","item":"PVC PIPE",            "spec":"Pipe, Bend, Tie, Screw",      "make":"Pressfit(MMS)",     "qty":"As Required", "unit":"Nos"},
  {"sr":"III","item":"PVC MATERIAL",        "spec":"Cable Tray, Clamp, Other",    "make":"Pressfit(MMS)",     "qty":"As Required", "unit":"LS"},
  {"sr":"III","item":"EARTHING RODS & BAG", "spec":"Cu Bonded 1mtr*17mm",         "make":"Copperbonded",      "qty":"4",           "unit":"Nos"},
  {"sr":"III","item":"LA",                  "spec":"Conventional Franklin Rod LA","make":"Copperbonded",      "qty":"1",           "unit":"Nos"},
  {"sr":"IV", "item":"STRUCTURE",           "spec":"G.I 80X40",                   "make":"APOLLO",            "qty":"As Required", "unit":"Nos"},
  {"sr":"IV", "item":"WALKWAY",             "spec":"G.I 80X40",                   "make":"APOLLO",            "qty":"As Required", "unit":"Nos"},
  {"sr":"V",  "item":"Generation Meter",    "spec":"10-40 Amp",                   "make":"L&T/ Secure",       "qty":"1",           "unit":"Nos"},
  {"sr":"V",  "item":"Net Meter",           "spec":"10-40 Amp",                   "make":"L&T/ Secure",       "qty":"1",           "unit":"Nos"},
  {"sr":"VI", "item":"MSEDCL LIAISONING",   "spec":"MSEDCL LIAISONING",           "make":"-",                 "qty":"-",           "unit":"-"}
]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.quotation_templates WHERE name = '3-Phase · up to 6 kW');

-- ── The other three bands start as copies of the above, for you to edit in-app ──
INSERT INTO public.quotation_templates (name, phase, min_kw, max_kw, lines)
SELECT '3-Phase · above 6 kW', '3ph', 6, 9999, lines
  FROM public.quotation_templates WHERE name = '3-Phase · up to 6 kW'
   AND NOT EXISTS (SELECT 1 FROM public.quotation_templates WHERE name = '3-Phase · above 6 kW');

INSERT INTO public.quotation_templates (name, phase, min_kw, max_kw, lines)
SELECT '1-Phase · up to 6 kW', '1ph', 0, 6,
       REPLACE(lines::text, '3Ph 2 IN 2 OUT', '1Ph 2 IN 2 OUT')::jsonb
  FROM public.quotation_templates WHERE name = '3-Phase · up to 6 kW'
   AND NOT EXISTS (SELECT 1 FROM public.quotation_templates WHERE name = '1-Phase · up to 6 kW');

INSERT INTO public.quotation_templates (name, phase, min_kw, max_kw, lines)
SELECT '1-Phase · above 6 kW', '1ph', 6, 9999,
       REPLACE(lines::text, '3Ph 2 IN 2 OUT', '1Ph 2 IN 2 OUT')::jsonb
  FROM public.quotation_templates WHERE name = '3-Phase · up to 6 kW'
   AND NOT EXISTS (SELECT 1 FROM public.quotation_templates WHERE name = '1-Phase · above 6 kW');


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
--   SELECT name, phase, min_kw, max_kw, jsonb_array_length(lines) AS line_count
--     FROM public.quotation_templates ORDER BY phase, min_kw;
-- Expect 4 rows, 16 lines each.
-- ─────────────────────────────────────────────────────────────────────────────
