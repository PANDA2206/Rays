# RAYS Dashboard — Next.js (Vercel)

A full JavaScript/TypeScript rewrite of the RAYS Energy Solutions solar-project
dashboard. This is a **faithful replica of the original Python/Streamlit app**, rebuilt
in **Next.js + React + Tailwind** so it deploys 100% on **Vercel**. It uses the **same
Supabase database** — no separate backend, the browser talks to Supabase directly with
the anon key (exactly like the Streamlit app did).

> The original Python app still lives untouched in
> `RAYS ENERGY SOLUTIONS/dashboard/streamlit_app/`. This is a standalone, separate
> codebase/repo.

## Stack
- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** (deep-navy theme ported from the Streamlit CSS)
- **@supabase/supabase-js** — auth (Google) + Postgres data, direct from the client
- Pure-SVG charts (no chart dependency) so the Vercel build stays small

## Pages (parity with the Streamlit app)
| Route | Description |
|-------|-------------|
| `/` | Overview — stat cards, status donut, recent activity, priority queue, admin insights |
| `/customers` | Customer List — search / filter / sort / pagination + Quick Edit panel |
| `/customers/new` | Add Project — full multi-section form + cash/loan installments |
| `/projects/[id]` | Project Detail — workflow steps, documents, financials, subsidy, notes, timeline |
| `/report` | Admin Reports — KPIs, partner/monthly/pipeline charts, GST summary, CSV export |
| `/epc` | EPC Partners (admin) — fund & GST tracking + ledger |
| `/users` | Users (admin) — approve/reject, roles, activity log |
| `/settings` | Profile & sign out |

Role-based access (admin vs employee) and the pending/rejected approval screens are
preserved.

## Local setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `.env.local` (copy from `.env.local.example`) and fill in your Supabase URL +
   anon key — **the same Supabase project the Streamlit app uses**.
3. Run the database migration once (see **Database** below).
4. Start the dev server:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000

## Authentication
Login uses **Supabase Auth with the Google provider** (cleaner than the manual OAuth the
Streamlit app did, and the right fit for Vercel). One-time setup in the Supabase
dashboard → **Authentication → Providers → Google**: enable it, add your Google OAuth
client ID/secret, and add your site URL (e.g. `http://localhost:3000` and your Vercel URL)
to the redirect allow-list. The first login for `voltedgeenergysolutions011@gmail.com` is
auto-approved as admin; everyone else starts as a pending employee until an admin approves
them on the Users page.

## Database
Uses the same tables as the Streamlit app. If you're pointing at the existing Supabase
project, the core tables already exist. Run `supabase/migration.sql` in the Supabase SQL
editor to ensure the extra tables this app reads (`project_documents`, `project_notes`,
and `project_steps`/`activity_logs`/`app_users` if missing) are present. It's idempotent
(`IF NOT EXISTS`).

## Deploy to Vercel
1. Push this folder to its own GitHub repo.
2. In Vercel: **New Project → import the repo**. Framework auto-detects as Next.js.
3. Add the two env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) in
   **Project Settings → Environment Variables**.
4. Deploy. Add the deployed `*.vercel.app` URL to Supabase Auth redirect URLs and the
   Google OAuth authorized origins.

That's it — no backend server, no Docker, nothing else to host.
