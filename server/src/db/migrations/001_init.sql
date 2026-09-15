-- ════════════════════════════════════════════════════════════════════════
-- Capsule Portal — initial schema
-- Enums are modelled as CHECK constraints (easier to evolve than PG enum
-- types across migrations). All ids are UUIDs from gen_random_uuid()
-- (built into Postgres 13+).
-- ════════════════════════════════════════════════════════════════════════

-- ── Configurable settings (admin-editable, never hardcoded) ───────────────
-- One row per key; value is JSONB so booleans/numbers/strings all fit.
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Roster of eligible students (imported via CSV) ────────────────────────
CREATE TABLE IF NOT EXISTS students (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reg_no      TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  school      TEXT NOT NULL,
  branch      TEXT NOT NULL,
  -- Email is AES-256-GCM encrypted at rest; email_hash (HMAC) enables O(1)
  -- login lookup without decrypting. Same scheme as the open-project portal.
  email_enc   TEXT,
  email_hash  TEXT NOT NULL UNIQUE,
  -- scrypt salt:hash (one-way). Initial password = name, lowercased, no spaces.
  password_hash TEXT,
  -- participation status derived-but-cached for fast dashboard counters:
  -- 'unteamed' (no team), 'teamed' (member of a forming/confirmed team),
  -- 'submitted', 'approved'.
  status      TEXT NOT NULL DEFAULT 'unteamed'
              CHECK (status IN ('unteamed','teamed','submitted','approved')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_students_reg_no ON students (reg_no);
CREATE INDEX IF NOT EXISTS idx_students_status ON students (status);
CREATE INDEX IF NOT EXISTS idx_students_school_branch ON students (school, branch);
-- Trigram-free simple search index on lowercased name/reg_no for browse.
CREATE INDEX IF NOT EXISTS idx_students_name_lower ON students (lower(name));

-- ── Staff (coordinators / admin / proctors) ───────────────────────────────
CREATE TABLE IF NOT EXISTS staff (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  email_enc   TEXT,
  email_hash  TEXT NOT NULL UNIQUE,
  username    TEXT UNIQUE,        -- optional (admin signs in with username + password)
  password_hash TEXT,             -- scrypt salt:hash
  role        TEXT NOT NULL
              CHECK (role IN ('project_coordinator','cdc_coordinator','admin','proctor')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Proctor → student assignment (scoped, read-only visibility).
CREATE TABLE IF NOT EXISTS proctor_students (
  proctor_id  UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  PRIMARY KEY (proctor_id, student_id)
);

-- ── Teams ─────────────────────────────────────────────────────────────────
-- Lifecycle:
--   forming    → members still being added, requests may be pending
--   confirmed  → membership locked (triggers auto-cancel of other requests)
--   submitted  → sent to a coordinator, awaiting review
--   approved   → project_id assigned
--   rejected   → student may edit & resubmit
CREATE TABLE IF NOT EXISTS teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT,
  route       TEXT NOT NULL DEFAULT 'inhouse'
              CHECK (route IN ('inhouse','cdc')),
  status      TEXT NOT NULL DEFAULT 'forming'
              CHECK (status IN ('forming','confirmed','submitted','approved','rejected')),
  is_solo     BOOLEAN NOT NULL DEFAULT false,
  project_id  TEXT UNIQUE,
  leader_id   UUID NOT NULL REFERENCES students(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_teams_status ON teams (status);
CREATE INDEX IF NOT EXISTS idx_teams_route_status ON teams (route, status);

-- ── Team membership ───────────────────────────────────────────────────────
-- CRITICAL invariant: a student may belong to at most ONE team at a time.
-- The UNIQUE(student_id) enforces "no double-booking" at the database level —
-- even if two confirmations race, only one membership insert can win.
CREATE TABLE IF NOT EXISTS team_members (
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  is_leader   BOOLEAN NOT NULL DEFAULT false,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, student_id),
  UNIQUE (student_id)
);
CREATE INDEX IF NOT EXISTS idx_team_members_student ON team_members (student_id);

-- ── Team requests ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  from_student UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  to_student   UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','accepted','rejected','auto_cancelled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ,
  CHECK (from_student <> to_student)
);
-- Only one pending invite from a given team to a given student.
CREATE UNIQUE INDEX IF NOT EXISTS uq_request_pending
  ON requests (team_id, to_student) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_requests_to_pending
  ON requests (to_student) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests (status);

-- ── Submissions (one row per attempt; keeps resubmission history) ─────────
CREATE TABLE IF NOT EXISTS submissions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id        UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  remark         TEXT,            -- CDC route: student's remark
  reason         TEXT,            -- CDC route: reason for solo/placement route
  attachment_url TEXT,            -- CDC route: proof-of-placement file
  reviewer_role  TEXT NOT NULL
                 CHECK (reviewer_role IN ('project_coordinator','cdc_coordinator')),
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected')),
  reviewer_remark TEXT,           -- coordinator's remark on approve/reject
  reviewed_by    UUID REFERENCES staff(id),
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_submissions_queue
  ON submissions (reviewer_role, status, created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_team ON submissions (team_id);

-- ── Deadlines (admin-configurable milestones) ─────────────────────────────
CREATE TABLE IF NOT EXISTS deadlines (
  key         TEXT PRIMARY KEY,      -- e.g. 'formation_close', 'final_confirm'
  label       TEXT NOT NULL,
  deadline_at TIMESTAMPTZ NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Notifications (persisted; real-time copy pushed over SSE) ──────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,       -- 'request_received','team_confirmed','approved', ...
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_student
  ON notifications (student_id, created_at DESC);

-- ── Audit log (every approve / reject / cancel / override) ─────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    UUID,                 -- student or staff id (nullable for system)
  actor_kind  TEXT NOT NULL DEFAULT 'system'
              CHECK (actor_kind IN ('student','staff','system')),
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL,        -- 'team','request','submission','deadline', ...
  target_id   TEXT,
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at DESC);

-- ── Project-ID sequence (atomic, gap-tolerant) ────────────────────────────
-- Combined with the configurable 'project_id_prefix' setting to make ids like
-- DL0001, DL0002, ... nextval() is safe under heavy concurrency.
CREATE SEQUENCE IF NOT EXISTS project_id_seq START 1;
