# WindSage AI

WindSage AI is a wind-turbine alarm monitoring and maintenance dashboard with explainable root-cause suggestions, risk scoring, priority ranking, CSV operations, and persistent PostgreSQL storage.

The original Streamlit prototype is preserved in [`legacy/streamlit/`](legacy/streamlit/) for reference. Streamlit is **not** the deployment architecture here: its long-running Python process does not fit a standard Vercel frontend. The production app is Next.js, TypeScript, Tailwind CSS, and Supabase PostgreSQL.

> This repository is deployment-ready, but no Vercel deployment has been performed or verified. The steps below use your own Supabase and Vercel accounts.

## Features

- **Fleet overview** — open incidents, recurring patterns, 30-day estimated loss and LPF, MTTR, overdue work, category loss bars, ranked attention list, and recurring-pattern table.
- **Incidents** — an O&M console-style alarm/work-item queue with turbine, category, status, free-text and open-only filters. Selecting a row opens a drawer for assignment, workflow status, root cause, resolution notes, and linked work-order editing.
- **Recurrence** — 60-day patterns per turbine/category with active counts, average gap, estimated MWh, and last-30-versus-prior-30 trend.
- **Root cause** — a DMAIC workbench built from the alarm history with deterministic root-cause rules, recurrence evidence, SLA, MTTR, verification checklist, and method assumptions. No paid LLM API is required and no alarm data is sent to an external AI provider.
- **Import / Export** — validated CSV import, in-file and database duplicate detection, import summaries, CSV template download, and CSV export.
- **Legacy routes** — `/alarms` and `/maintenance` redirect to `/incidents`; `/insights` redirects to `/root-cause`; `/analytics` redirects to `/recurrence`.
- **Auth & security** — Supabase Auth email/password sessions, RLS on every table, server-side session handling, and no service-role key in the application. A local-only demo mode adds admin and department-engineer accounts with in-memory data.

## Stack

- Next.js 15 App Router, React 19, TypeScript
- Tailwind CSS 4
- Supabase PostgreSQL + Supabase Auth (`@supabase/ssr`)
- Recharts, Lucide
- Vitest

## Project layout

```text
app/                       Next.js routes, pages, server actions, API routes, console CSS
components/                Console shell, incident drawer, forms, charts, filters
lib/                       Alarm logic, CSV handling, filters, analytics, Supabase/data access
supabase/migrations/        SQL schema and optional demo seed
sample_data/                Original synthetic CSV
scripts/seed.ts             Optional authenticated demo seeder
tests/unit/                 Pure logic, CSV, filter, scoring tests
tests/integration/          Persistent Supabase test (skipped without credentials)
legacy/streamlit/           Original Streamlit app and SQLite demo DB
```

## Demo login (no Supabase tables required)

For an immediate UI walkthrough, set `DEMO_MODE=true` in `.env.local`. The app then uses built-in demo accounts and an in-memory dataset instead of Supabase.

| Account | Password | Role | Department |
| --- | --- | --- | --- |
| `admin@windsage.demo` | `Admin@123` | Admin | Operations |
| `mechanical@windsage.demo` | `Mechanical@123` | Mechanical Engineer | Mechanical |
| `electrical@windsage.demo` | `Electrical@123` | Electrical Engineer | Electrical |
| `reliability@windsage.demo` | `Reliability@123` | Reliability Engineer | Reliability |

The login screen also has one-click buttons for each account. Demo mode is for local review only:

- Data lives in server memory and resets when the dev server restarts.
- Only the admin account can access Import / Export.
- Do not enable `DEMO_MODE` on Vercel. Set it to `false` (or omit it) and use Supabase Auth plus PostgreSQL for a persistent deployment.
- Set `DEMO_SESSION_SECRET` to a long random string. The fallback value is only a local development convenience.

## 1. Create the Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**.
3. Run [`supabase/migrations/202610230001_initial_schema.sql`](supabase/migrations/202610230001_initial_schema.sql).
4. Optionally run [`supabase/migrations/202610230002_seed_demo.sql`](supabase/migrations/202610230002_seed_demo.sql) for 16 demo alarms and four work orders.

The schema creates:

- `turbines`
- `alarm_history` — including sensor readings, suggested/confirmed root cause, status, technician, and resolution notes
- `maintenance_incidents`
- `technician_assignments`
- `audit_history` — populated by PostgreSQL triggers

Indexes cover `turbine_id`, `timestamp`, `alarm_code`, `severity`, `status`, incident status/due date, assignments, and audit lookups.

### Row Level Security

RLS is enabled on every table. Only the `authenticated` role can read or write application data; `anon` has no table access. `audit_history` is read-only for authenticated users and written by a `security definer` trigger function.

Create operators in **Authentication → Users** and disable public sign-ups in **Authentication → Providers → Email**. Any authenticated operator can manage alarm and maintenance data; add stricter per-tenant policies if you need role separation.

## 2. Configure environment variables

Copy the example file:

```bash
cp .env.example .env.local
```

Set the values from **Supabase → Project Settings → API**:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
DEMO_MODE=false
```

Set `DEMO_MODE=false` for any deployment that should use PostgreSQL. `DEMO_SESSION_SECRET` is only needed when demo mode is enabled.

These two values are safe for browser use because RLS and Supabase Auth enforce access. **Never add a service-role key to this app or to Vercel.** The application never reads or exposes one.

Optional seed/test variables:

```bash
SEED_USER_EMAIL=operator@example.com
SEED_USER_PASSWORD=...
TEST_SUPABASE_URL=https://your-dev-project-ref.supabase.co
TEST_SUPABASE_ANON_KEY=...
TEST_USER_EMAIL=test-operator@example.com
TEST_USER_PASSWORD=...
```

Use a **separate development Supabase project** for tests and seeding. There is no SQLite production or development database.

## 3. Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and sign in with the Supabase Auth user you created.

Optional demo seeder (authenticated through the anon key and RLS):

```bash
npm run seed
```

It upserts the seven sample CSV alarms plus 110 deterministic demo alarms and checks four demo work orders. The SQL seed alone is enough for a smaller dataset.

## 4. Deploy to Vercel

1. Push this repository to GitHub/GitLab/Bitbucket.
2. In Vercel, choose **Add New → Project** and import the repository.
3. Framework preset: **Next.js**. Build command: `npm run build`. Output is handled automatically.
4. Add environment variables for **Production**, **Preview**, and **Development**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `DEMO_MODE=false` (do not enable demo mode in production)
5. Deploy.
6. In Supabase **Authentication → URL Configuration**, set the Site URL to your Vercel production URL and add it to Redirect URLs.
7. Sign in, verify that the dashboard loads, create/update an alarm or work order, and confirm the row appears in Supabase.

Never commit `.env.local` or real credentials. `.env.example` contains placeholders only. The deployment is only complete after the live URL and database writes have been verified.

## 5. CSV import and export

Required columns:

```text
alarm_id,timestamp,turbine_id,alarm_code,description,severity,duration_min,status
```

Optional sensor columns:

```text
vibration_mm_s,temperature_c,hydraulic_pressure_bar,estimated_power_kw
```

- Severity: `Critical`, `High`, `Medium`, or `Low`
- Status: `Active`, `Acknowledged`, or `Resolved`
- Timestamps without a timezone are interpreted as UTC
- Maximum 1,000 rows / 4 MB per upload
- Duplicate `alarm_id` or duplicate turbine + timestamp + alarm code is skipped and reported
- Unknown turbine IDs are created automatically
- Invalid rows are rejected with row-level messages

Use **Import / Export** in the app to download the template, import a file, or export up to 5,000 records. The export endpoint also accepts the existing alarm query filters.

## 6. Tests and verification

```bash
npm run typecheck
npm test
npm run build
```

The unit suite covers:

- exact-date and date-range filtering, including precedence and inclusive bounds
- CSV validation, duplicate detection, templates, and export escaping
- alarm creation payload normalization
- root-cause rules, risk categories, and priority weighting
- overlap-adjusted lost-production calculations and MTTR
- demo session signing, expiration, and tamper rejection
- in-memory demo filtering, imports, alarm updates, and maintenance workflow

Integration test (uses a real development Supabase project):

```bash
TEST_SUPABASE_URL=... \
TEST_SUPABASE_ANON_KEY=... \
TEST_USER_EMAIL=... \
TEST_USER_PASSWORD=... \
npm run test:integration
```

It creates an alarm, verifies exact-date filtering, updates it, reads it from a second authenticated client session, checks audit history, and cleans up. It is skipped automatically when the `TEST_*` variables are absent.

## Security notes

- Demo mode is local-only and uses fixed, publicly documented credentials. Never enable it in production.
- The browser and server use only the Supabase anon key plus an authenticated session.
- No service-role key is present in `.env.example`, client code, or server actions.
- Middleware protects all dashboard routes; API routes independently require an authenticated user.
- RLS policies restrict `anon` completely.
- Audit rows are written by a trigger, not directly by the client.
- Recommendations are advisory, rule-based outputs. They are not validated diagnoses or predictive models.

## Legacy data

The original `windsage.db` and Streamlit code remain under `legacy/streamlit/`. They are not used at runtime. The original alarm CSV is retained in `sample_data/` for seeding and import testing.
