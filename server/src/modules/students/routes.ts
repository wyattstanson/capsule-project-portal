import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { redis } from '../../redis/client.js';
import { requireAuth, requireStudent } from '../../auth/rbac.js';
import { parse } from '../../lib/validate.js';

const browseSchema = z.object({
  search: z.string().trim().optional(),
  school: z.string().trim().optional(),
  branch: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export async function registerStudents(app: FastifyInstance): Promise<void> {
  // Browse eligible (unteamed) peers. Any student may request any unteamed
  // peer — no school/branch restriction.
  app.get('/students', { preHandler: requireStudent }, async (req) => {
    const q = parse(browseSchema, req.query);
    const me = req.principal!.sub;
    const params: unknown[] = [me];
    const where: string[] = [
      // eligible = has no team membership yet, and not me
      `s.id <> $1`,
      `NOT EXISTS (SELECT 1 FROM team_members tm WHERE tm.student_id = s.id)`,
    ];
    if (q.search) {
      params.push(`%${q.search.toLowerCase()}%`);
      where.push(`(lower(s.name) LIKE $${params.length} OR lower(s.reg_no) LIKE $${params.length})`);
    }
    if (q.school) {
      params.push(q.school);
      where.push(`s.school = $${params.length}`);
    }
    if (q.branch) {
      params.push(q.branch);
      where.push(`s.branch = $${params.length}`);
    }
    const whereSql = where.join(' AND ');
    const offset = (q.page - 1) * q.pageSize;
    params.push(q.pageSize, offset);

    const rows = await query(
      `SELECT s.id, s.reg_no, s.name, s.school, s.branch
         FROM students s
        WHERE ${whereSql}
        ORDER BY s.name
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const countRes = await query<{ n: string }>(
      `SELECT count(*) AS n FROM students s WHERE ${whereSql}`,
      params.slice(0, params.length - 2),
    );
    return {
      students: rows.rows,
      total: Number(countRes.rows[0].n),
      page: q.page,
      pageSize: q.pageSize,
    };
  });

  // Distinct schools/branches for filter dropdowns (cached — rarely changes).
  app.get('/students/facets', { preHandler: requireAuth }, async () => {
    const cached = await redis.get('facets').catch(() => null);
    if (cached) return JSON.parse(cached);
    const schools = await query<{ school: string }>(
      'SELECT DISTINCT school FROM students ORDER BY school',
    );
    const branches = await query<{ branch: string }>(
      'SELECT DISTINCT branch FROM students ORDER BY branch',
    );
    const result = {
      schools: schools.rows.map((r) => r.school),
      branches: branches.rows.map((r) => r.branch),
    };
    await redis.set('facets', JSON.stringify(result), 'EX', 300).catch(() => {});
    return result;
  });

  // Deadlines are visible to any authenticated user (read-only for students).
  app.get('/deadlines', { preHandler: requireAuth }, async () => {
    const rows = await query('SELECT key, label, deadline_at FROM deadlines ORDER BY deadline_at');
    return { deadlines: rows.rows };
  });

  // A student's own notifications feed (persisted history).
  app.get('/notifications', { preHandler: requireStudent }, async (req) => {
    const rows = await query(
      `SELECT id, type, payload, read_at, created_at
         FROM notifications WHERE student_id = $1
        ORDER BY created_at DESC LIMIT 50`,
      [req.principal!.sub],
    );
    return { notifications: rows.rows };
  });

  app.post('/notifications/read', { preHandler: requireStudent }, async (req) => {
    await query(
      `UPDATE notifications SET read_at = now() WHERE student_id = $1 AND read_at IS NULL`,
      [req.principal!.sub],
    );
    return { ok: true };
  });
}
