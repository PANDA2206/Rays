-- VOLTEDGE Next.js app — ensures the tables this app reads/writes exist.
-- Safe to run multiple times. Run in Supabase SQL editor.
-- (The projects / installments / epcs tables come from the original
--  backend/migrations 001–003; this only adds what the detail + auth views need.)

-- App users (login role + approval status) ------------------------------------
CREATE TABLE IF NOT EXISTS public.app_users (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  picture       TEXT,
  role          TEXT DEFAULT 'employee',
  status        TEXT DEFAULT 'pending',
  employee_code TEXT,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Activity log ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email   TEXT,
  user_name    TEXT,
  user_picture TEXT,
  action       TEXT,
  entity_type  TEXT,
  project_id   TEXT,
  project_name TEXT,
  details      TEXT,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Project workflow steps ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_steps (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id       UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  step_no          INTEGER,
  step_name        TEXT,
  status           TEXT DEFAULT 'pending',
  progress_percent INTEGER DEFAULT 0,
  start_date       DATE,
  end_date         DATE,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Project documents checklist -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_documents (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  doc_name   TEXT,
  status     TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Internal project notes ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_notes (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id  UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  note        TEXT,
  next_action TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- The app uses the anon/publishable key (like the Streamlit app), so disable RLS
-- on these tables to allow reads/writes. Otherwise inserts fail with error 42501.
ALTER TABLE public.app_users         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_steps     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_notes     DISABLE ROW LEVEL SECURITY;
