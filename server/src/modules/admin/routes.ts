import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, withTransaction } from '../../db/pool.js';
import { redis } from '../../redis/client.js';
import { requireAdmin, requireRole } from '../../auth/rbac.js';
import { badRequest } from '../../lib/errors.js';
import { encrypt, decrypt, hashEmail, hashPasswordSync, genHashkey } from '../../lib/vault.js';
import { parse } from '../../lib/validate.js';
import {
  DEFAULT_SETTINGS,
  getSettings,
  setSetting,
  type Settings,
} from '../../lib/settings.js';
import { notifyStudent } from '../../lib/notify.js';
import { writeAudit } from '../audit/service.js';
import { buildCredentialsCsv } from './credentials.js';

const deadlineSchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  deadlineAt: z.string().datetime(),
});
const settingsSchema = z
  .object({
    team_size_min: z.number().int().min(1).max(10),
    team_size_max: z.number().int().min(1).max(10),
    formation_mode: z.enum(['individual', 'assigned']),
    project_id_prefix: z.string().trim().min(1).max(8),
    project_id_pad: z.number().int().min(1).max(8),
  })
  .partial();

// Parse a simple CSV (reg_no,name,school,branch,email). Handles quoted fields.
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map((line) => {
    const values = line.split(',');
    const row: Record<string, string> = {};
    header.forEach((h, i) => {
      row[h] = (values[i] ?? '').trim().replace(/^"|"$/g, '');
    });
    return row;
  });
}

export async function registerAdmin(app: FastifyInstance): Promise<void> {
  // ── Live dashboard counters ────────────────────────────────────────────
  app.get('/admin/dashboard', { preHandler: requireRole('admin', 'proctor') }, async () => {
    const [total, groups, notParticipated, byStatus, byRoute] = await Promise.all([
      query<{ n: string }>('SELECT count(*) AS n FROM students'),
      query<{ n: string }>(
        `SELECT count(*) AS n FROM teams WHERE status IN ('confirmed','submitted','approved')`,
      ),
      query<{ n: string }>(
        `SELECT count(*) AS n FROM students s
          WHERE NOT EXISTS (SELECT 1 FROM team_members tm WHERE tm.student_id = s.id)`,
      ),
      query<{ status: string; n: string }>(
        'SELECT status, count(*) AS n FROM students GROUP BY status',
      ),
      query<{ route: string; status: string; n: string }>(
        'SELECT route, status, count(*) AS n FROM teams GROUP BY route, status',
      ),
    ]);
    return {
      totalStudents: Number(total.rows[0].n),
      groupsFormed: Number(groups.rows[0].n),
      notParticipated: Number(notParticipated.rows[0].n),
      studentsByStatus: Object.fromEntries(byStatus.rows.map((r) => [r.status, Number(r.n)])),
      teamsByRoute: byRoute.rows.map((r) => ({ route: r.route, status: r.status, count: Number(r.n) })),
    };
  });

  // ── Deadlines (configurable milestones) ────────────────────────────────
  app.get('/admin/deadlines', { preHandler: requireRole('admin', 'proctor') }, async () => {
    const rows = await query('SELECT key, label, deadline_at FROM deadlines ORDER BY deadline_at');
    return { deadlines: rows.rows };
  });

  app.put('/admin/deadlines', { preHandler: requireAdmin }, async (req) => {
    const { key, label, deadlineAt } = parse(deadlineSchema, req.body);
    await query(
      `INSERT INTO deadlines (key, label, deadline_at, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, deadline_at = EXCLUDED.deadline_at, updated_at = now()`,
      [key, label, deadlineAt],
    );
    await writeAudit({
      actorId: req.principal!.sub,
      actorKind: 'staff',
      action: 'deadline.update',
      targetType: 'deadline',
      targetId: key,
      detail: { label, deadlineAt },
    });
    return { ok: true };
  });

  // ── Settings ───────────────────────────────────────────────────────────
  app.get('/admin/settings', { preHandler: requireRole('admin', 'proctor') }, async () => {
    return { settings: await getSettings(), defaults: DEFAULT_SETTINGS };
  });

  app.put('/admin/settings', { preHandler: requireAdmin }, async (req) => {
    const patch = parse(settingsSchema, req.body);
    if (patch.team_size_min && patch.team_size_max && patch.team_size_min > patch.team_size_max) {
      throw badRequest('bad_range', 'team_size_min cannot exceed team_size_max');
    }
    for (const [key, value] of Object.entries(patch)) {
      await setSetting(key as keyof Settings, value as never);
    }
    await writeAudit({
      actorId: req.principal!.sub,
      actorKind: 'staff',
      action: 'settings.update',
      targetType: 'settings',
      detail: patch,
    });
    return { settings: await getSettings() };
  });

  // ── Roster import (CSV) ────────────────────────────────────────────────
  app.post('/admin/roster/import', { preHandler: requireAdmin }, async (req) => {
    const file = await req.file();
    if (!file) throw badRequest('no_file', 'Upload a CSV file');
    const buf = await file.toBuffer();
    const rows = parseCsv(buf.toString('utf8'));
    let inserted = 0;
    let updated = 0;
    await withTransaction(async (client) => {
      for (const r of rows) {
        const regNo = r.reg_no || r.registration_no || r.registration_number;
        if (!regNo || !r.email || !r.name) continue;
        // Encrypt email, keep an HMAC hash for login lookup, and issue a 16-char
        // login hashkey as the initial credential (kept for re-imports).
        const hashkey = genHashkey();
        const res = await client.query(
          `INSERT INTO students (reg_no, name, school, branch, email_enc, email_hash, password_hash, login_key_enc)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (reg_no) DO UPDATE
             SET name = EXCLUDED.name, school = EXCLUDED.school,
                 branch = EXCLUDED.branch, email_enc = EXCLUDED.email_enc,
                 email_hash = EXCLUDED.email_hash
           RETURNING (xmax = 0) AS inserted`,
          [regNo, r.name, r.school ?? '', r.branch ?? '', encrypt(r.email), hashEmail(r.email), hashPasswordSync(hashkey), encrypt(hashkey)],
        );
        if (res.rows[0].inserted) inserted++;
        else updated++;
      }
    });
    await redis.del('facets').catch(() => {});
    await writeAudit({
      actorId: req.principal!.sub,
      actorKind: 'staff',
      action: 'roster.import',
      targetType: 'students',
      detail: { inserted, updated, rows: rows.length },
    });
    return { ok: true, inserted, updated, parsed: rows.length };
  });

  // ── Student login hashkeys (view / reset) ──────────────────────────────
  // View a student's 16-char login hashkey so it can be handed out.
  app.get('/admin/students/:reg/key', { preHandler: requireAdmin }, async (req) => {
    const reg = (req.params as { reg: string }).reg;
    const r = await query(
      `SELECT reg_no, name, login_key_enc FROM students WHERE lower(reg_no) = lower($1)`,
      [reg],
    );
    if (!r.rowCount) throw badRequest('not_found', 'Student not found');
    return { reg: r.rows[0].reg_no, name: r.rows[0].name, hashkey: decrypt(r.rows[0].login_key_enc) };
  });

  // Reset: issue a fresh hashkey (becomes the new credential) — for lockouts.
  app.post('/admin/students/:reg/reset-key', { preHandler: requireAdmin }, async (req) => {
    const reg = (req.params as { reg: string }).reg;
    const key = genHashkey();
    const upd = await query(
      `UPDATE students SET login_key_enc = $2, password_hash = $3, key_used = false
        WHERE lower(reg_no) = lower($1) RETURNING reg_no, name`,
      [reg, encrypt(key), hashPasswordSync(key)],
    );
    if (!upd.rowCount) throw badRequest('not_found', 'Student not found');
    await writeAudit({
      actorId: req.principal!.sub,
      actorKind: 'staff',
      action: 'student.reset_key',
      targetType: 'student',
      targetId: upd.rows[0].reg_no,
    });
    return { reg: upd.rows[0].reg_no, name: upd.rows[0].name, hashkey: key };
  });

  // ── Credentials export (live CSV of all sign-in credentials) ────────────
  // Always generated fresh from the DB, so it reflects password changes and
  // key resets the moment they happen. Admin-only; every export is audited.
  app.get('/admin/credentials.csv', { preHandler: requireAdmin }, async (req, reply) => {
    const csv = await buildCredentialsCsv();
    await writeAudit({
      actorId: req.principal!.sub,
      actorKind: 'staff',
      action: 'credentials.export',
      targetType: 'credentials',
    });
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="capstone-credentials.csv"')
      .header('Cache-Control', 'no-store');
    return csv;
  });

  // ── Team / request browser + override ──────────────────────────────────
  app.get('/admin/teams', { preHandler: requireRole('admin', 'proctor') }, async (req) => {
    const status = (req.query as { status?: string }).status;
    const params: unknown[] = [];
    let where = '';
    if (status) {
      params.push(status);
      where = 'WHERE t.status = $1';
    }
    const rows = await query(
      `SELECT t.id, t.title, t.route, t.status, t.is_solo, t.project_id, t.created_at,
              (SELECT json_agg(json_build_object('name', s.name, 'regNo', s.reg_no))
                 FROM team_members tm JOIN students s ON s.id = tm.student_id
                WHERE tm.team_id = t.id) AS members
         FROM teams t ${where}
        ORDER BY t.created_at DESC LIMIT 200`,
      params,
    );
    return { teams: rows.rows };
  });

  // Override: cancel a team, free its members, cancel pending requests.
  app.post('/admin/teams/:id/cancel', { preHandler: requireAdmin }, async (req) => {
    const teamId = (req.params as { id: string }).id;
    await withTransaction(async (client) => {
      const t = await client.query('SELECT id, project_id FROM teams WHERE id = $1 FOR UPDATE', [teamId]);
      if (t.rowCount === 0) throw badRequest('not_found', 'Team not found');
      const members = await client.query<{ student_id: string }>(
        'SELECT student_id FROM team_members WHERE team_id = $1',
        [teamId],
      );
      await client.query(
        `UPDATE requests SET status = 'auto_cancelled', resolved_at = now() WHERE team_id = $1 AND status = 'pending'`,
        [teamId],
      );
      await client.query(
        `UPDATE students SET status = 'unteamed' WHERE id = ANY($1::uuid[])`,
        [members.rows.map((m) => m.student_id)],
      );
      await client.query('DELETE FROM teams WHERE id = $1', [teamId]);
      await writeAudit(
        { actorId: req.principal!.sub, actorKind: 'staff', action: 'team.override_cancel', targetType: 'team', targetId: teamId, detail: { freed: members.rowCount } },
        client,
      );
      for (const m of members.rows) {
        await notifyStudent({ studentId: m.student_id, type: 'team_cancelled_by_admin', payload: {} }, client);
      }
    });
    return { ok: true };
  });

  // ── Audit log ──────────────────────────────────────────────────────────
  app.get('/admin/audit', { preHandler: requireRole('admin') }, async (req) => {
    const limit = Math.min(Number((req.query as { limit?: string }).limit ?? 100), 500);
    const rows = await query(
      `SELECT id, actor_id, actor_kind, action, target_type, target_id, detail, created_at
         FROM audit_log ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return { entries: rows.rows };
  });
}
