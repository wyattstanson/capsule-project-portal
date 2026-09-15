# Capsule Project — Team-Formation & Approval Portal

A full-stack portal for a university's 7th-semester Capsule (Capstone) project:
students form teams (or take a solo / CDC placement route), submit for
coordinator approval, and receive an auto-generated project ID. Built to stay
responsive with **5,000 concurrent students** around a deadline.

- **Backend** — Node.js + Fastify + TypeScript, PostgreSQL (via pgbouncer),
  Redis (cache / rate-limit / pub-sub), BullMQ background jobs, SSE for
  real-time alerts.
- **Frontend** — React + Vite + TypeScript, a hand-built Fluent/Azure-grade
  design system (no template UI kit).
- **Load test** — k6 script simulating 5,000 concurrent users.

---

## Quick start

Prerequisites: **Docker Desktop**, **Node 20+**, and (optionally) **k6** for the
load test.

```bash
# 1. From the repo root — bring up Postgres + pgbouncer + Redis
cp .env.example .env
docker compose up -d postgres pgbouncer redis

# 2. Install dependencies (npm workspaces installs server + web)
npm install

# 3. Create the schema and seed roster + staff + settings + deadlines
npm run db:migrate
npm run db:seed

# 4. Run the API, the background worker, and the web app (three terminals)
npm run dev:server   # http://localhost:4000
npm run dev:worker
npm run dev:web      # http://localhost:5173
```

Open http://localhost:5173.

### Logging in (dev)

Auth is registration-number / email + OTP. In development the OTP is returned
in the API response and shown on the login screen, so no mail server is needed.

| Role | Sign in with |
|---|---|
| Student | `22CCE1000` (or any seeded reg no.) |
| Project Coordinator | `project.coord@univ.edu` |
| CDC Coordinator | `cdc.coord@univ.edu` |
| Admin | `admin@univ.edu` |
| Proctor | `proctor@univ.edu` |

---

## Running everything in Docker

```bash
docker compose up --build            # postgres, pgbouncer, redis, api, worker
docker compose up --scale api=4      # scale the stateless API horizontally
```

The API talks to Postgres **through pgbouncer** (transaction pooling), so
thousands of short-lived client connections collapse onto a small server-side
pool. API instances are stateless and sit behind a load balancer — real-time
alerts fan out across them via Redis pub/sub, so scaling out doesn't break SSE.

---

## Load test

```bash
# API must be running and seeded (dev mode, so OTP is returnable)
BASE_URL=http://localhost:4000 k6 run load-test/k6-script.js
```

Ramps to 5,000 concurrent students hitting search + send-request while admins
poll the dashboard. Thresholds: p95 < 800 ms (browse/dashboard), < 1 s
(send-request), < 2% error rate. See [`load-test/k6-script.js`](load-test/k6-script.js).

---

## Concurrency & correctness

The **"confirm team + auto-cancel other requests"** operation runs in a single
DB transaction with row locks (`server/src/modules/teams/service.ts`):

1. `SELECT ... FOR UPDATE` on the team row (blocks a second confirmation).
2. `SELECT ... FOR UPDATE ... ORDER BY student_id` on member rows (deterministic
   lock order → no deadlocks with concurrent accepts).
3. Flip the team to `confirmed`, then a single `UPDATE ... RETURNING` cancels
   every other pending request touching any member.

The ultimate guard against double-booking is a database invariant:
`team_members` has `UNIQUE(student_id)`, so even if two confirmations race, only
one membership insert can win — the other fails with a clean 409.

Project IDs come from a Postgres `SEQUENCE` (`nextval` is atomic) combined with
the admin-configurable prefix + padding, so ids like `DL0496` are unique under
load.

---

## Configurable defaults (confirm with stakeholders)

Per the build spec, these were built as **configurable data**, not constants —
adjust them in **Admin → Deadlines & Rules** or via the roster import, no code
change needed:

| Item | Default | Where |
|---|---|---|
| Team size | min 1, max 3 | `settings` table / admin UI |
| Formation mode | individual choice | `settings` table / admin UI |
| Project-ID rule | `<PREFIX><4-digit seq>`, prefix `DL` → `DL0001…` | `settings` + `project_id_seq` |
| Deadlines | `formation_close` 27 Aug 2026, `final_confirm` 5 Sept 2026 | `deadlines` table / admin UI |
| Schools / branches | seeded from CSV (`CCE, BCB, BAI, BDS, BCI` sample) | roster import |
| External-portal sync | export-only (NDJSON + audit log); set `EXTERNAL_PORTAL_WEBHOOK_URL` for webhook mode | worker |
| Proctor role | read-only over dashboard + teams (scoped assignment table exists) | RBAC |

> Still open with stakeholders: the exact `DL0496` sequence rule, which milestone
> each seed date gates, the full branch list, the Proctor's precise scope, and
> whether a live student-portal API exists. All are parameterised so the answers
> drop in without a rebuild.

---

## Project structure

```
capsule-portal/
├─ docker-compose.yml         # postgres, pgbouncer, redis, api, worker
├─ server/                    # Fastify API + BullMQ worker
│  └─ src/
│     ├─ db/                  # pool (pgbouncer), migrations, migrate, seed
│     ├─ auth/                # OTP, JWT, RBAC guards
│     ├─ realtime/            # SSE (ticketed) + Redis pub/sub
│     ├─ queue/               # BullMQ queues
│     ├─ lib/                 # settings, id-gen, notify, errors, validate
│     ├─ modules/             # students, teams, submissions, admin, audit
│     ├─ app.ts / index.ts    # HTTP server
│     └─ worker.ts            # notification dispatch + portal sync
├─ web/                       # React + Vite frontend
│  └─ src/
│     ├─ styles/              # Fluent/Azure design tokens + components
│     ├─ state/               # auth, toast, SSE notifications
│     ├─ components/          # Layout (nav rail), RequestBlade, ui primitives
│     └─ pages/               # dashboard, browse, team, submissions, review, admin/*
└─ load-test/k6-script.js
```

---

## API surface (all under `/api`, RBAC enforced per route)

| Method | Path | Role |
|---|---|---|
| POST | `/auth/request-otp`, `/auth/verify` | public |
| GET | `/students`, `/students/facets` | student |
| GET/POST | `/team/me`, `/team/confirm`, `/team/confirm-solo`, `/team/leave` | student |
| GET/POST | `/requests`, `/requests/send`, `/requests/respond` | student |
| POST/GET | `/uploads`, `/submissions`, `/submissions/mine` | student |
| GET | `/queue/project` \| `/queue/cdc` | coordinator |
| POST | `/submissions/review` | coordinator |
| GET | `/admin/dashboard`, `/admin/teams`, `/admin/deadlines`, `/admin/settings` | admin/proctor |
| PUT/POST | `/admin/settings`, `/admin/deadlines`, `/admin/roster/import`, `/admin/teams/:id/cancel` | admin |
| GET | `/admin/audit` | admin |
| POST/GET | `/realtime/ticket`, `/realtime/stream` (SSE) | student |
