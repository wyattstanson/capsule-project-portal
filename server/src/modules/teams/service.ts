import { query, withTransaction, type Queryable } from '../../db/pool.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { getSettings } from '../../lib/settings.js';
import { notifyStudent } from '../../lib/notify.js';
import { writeAudit } from '../audit/service.js';

const UNIQUE_VIOLATION = '23505';

export interface TeamView {
  id: string;
  title: string | null;
  route: 'inhouse' | 'cdc';
  status: string;
  isSolo: boolean;
  projectId: string | null;
  leaderId: string;
  members: { studentId: string; name: string; regNo: string; isLeader: boolean }[];
}

async function loadTeamView(teamId: string, runner: Queryable): Promise<TeamView> {
  const team = await runner.query(
    `SELECT id, title, route, status, is_solo, project_id, leader_id FROM teams WHERE id = $1`,
    [teamId],
  );
  if (team.rowCount === 0) throw notFound('Team not found');
  const t = team.rows[0];
  const members = await runner.query(
    `SELECT tm.student_id, tm.is_leader, s.name, s.reg_no
       FROM team_members tm JOIN students s ON s.id = tm.student_id
      WHERE tm.team_id = $1 ORDER BY tm.is_leader DESC, s.name`,
    [teamId],
  );
  return {
    id: t.id,
    title: t.title,
    route: t.route,
    status: t.status,
    isSolo: t.is_solo,
    projectId: t.project_id,
    leaderId: t.leader_id,
    members: members.rows.map((m) => ({
      studentId: m.student_id,
      name: m.name,
      regNo: m.reg_no,
      isLeader: m.is_leader,
    })),
  };
}

/** The team a student currently belongs to, or null. */
export async function getMyTeam(studentId: string): Promise<TeamView | null> {
  const { rows } = await query<{ team_id: string }>(
    'SELECT team_id FROM team_members WHERE student_id = $1',
    [studentId],
  );
  if (rows.length === 0) return null;
  return loadTeamView(rows[0].team_id, { query });
}

/** Create (or return) a student's forming team, with them as leader. */
export async function ensureFormingTeam(studentId: string): Promise<TeamView> {
  return withTransaction(async (client) => {
    const existing = await client.query<{ team_id: string }>(
      'SELECT team_id FROM team_members WHERE student_id = $1',
      [studentId],
    );
    if (existing.rows.length > 0) {
      return loadTeamView(existing.rows[0].team_id, client);
    }
    const team = await client.query<{ id: string }>(
      `INSERT INTO teams (leader_id, route, status) VALUES ($1, 'inhouse', 'forming') RETURNING id`,
      [studentId],
    );
    const teamId = team.rows[0].id;
    await client.query(
      `INSERT INTO team_members (team_id, student_id, is_leader) VALUES ($1, $2, true)`,
      [teamId, studentId],
    );
    await writeAudit(
      { actorId: studentId, actorKind: 'student', action: 'team.create', targetType: 'team', targetId: teamId },
      client,
    );
    return loadTeamView(teamId, client);
  });
}

/** Send a team-formation request from a leader to an unteamed peer. */
export async function sendRequest(fromStudentId: string, toStudentId: string): Promise<void> {
  if (fromStudentId === toStudentId) throw badRequest('self_request', 'You cannot invite yourself');

  const settings = await getSettings();

  await withTransaction(async (client) => {
    // Sender must own a forming team (create on demand).
    const teamRow = await client.query(
      `SELECT tm.team_id, t.status, t.leader_id
         FROM team_members tm JOIN teams t ON t.id = tm.team_id
        WHERE tm.student_id = $1 FOR UPDATE OF t`,
      [fromStudentId],
    );

    let teamId: string;
    if (teamRow.rows.length === 0) {
      const created = await client.query<{ id: string }>(
        `INSERT INTO teams (leader_id, route, status) VALUES ($1, 'inhouse', 'forming') RETURNING id`,
        [fromStudentId],
      );
      teamId = created.rows[0].id;
      await client.query(
        `INSERT INTO team_members (team_id, student_id, is_leader) VALUES ($1, $2, true)`,
        [teamId, fromStudentId],
      );
    } else {
      const t = teamRow.rows[0];
      if (t.status !== 'forming') throw conflict('team_locked', 'Your team is already confirmed');
      if (t.leader_id !== fromStudentId) throw forbidden('Only the team leader can send invites');
      teamId = t.team_id;
    }

    // Capacity check (current members + outstanding pending invites).
    const counts = await client.query<{ members: string; pending: string }>(
      `SELECT
         (SELECT count(*) FROM team_members WHERE team_id = $1) AS members,
         (SELECT count(*) FROM requests WHERE team_id = $1 AND status = 'pending') AS pending`,
      [teamId],
    );
    const projected = Number(counts.rows[0].members) + Number(counts.rows[0].pending);
    if (projected >= settings.team_size_max) {
      throw conflict('team_full', `A team may have at most ${settings.team_size_max} members`);
    }

    // Recipient must exist and currently be unteamed.
    const recipient = await client.query(
      `SELECT s.id, s.name,
              (SELECT count(*) FROM team_members m WHERE m.student_id = s.id) AS teamed
         FROM students s WHERE s.id = $1`,
      [toStudentId],
    );
    if (recipient.rowCount === 0) throw notFound('Student not found');
    if (Number(recipient.rows[0].teamed) > 0) {
      throw conflict('already_teamed', 'That student is already in a team');
    }

    // Insert the request (unique partial index blocks duplicate pending invites).
    try {
      await client.query(
        `INSERT INTO requests (team_id, from_student, to_student) VALUES ($1, $2, $3)`,
        [teamId, fromStudentId, toStudentId],
      );
    } catch (err) {
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
        throw conflict('duplicate_request', 'You already have a pending invite to that student');
      }
      throw err;
    }

    await writeAudit(
      { actorId: fromStudentId, actorKind: 'student', action: 'request.send', targetType: 'request', targetId: toStudentId, detail: { teamId } },
      client,
    );

    // Real-time alert to the recipient.
    await notifyStudent(
      { studentId: toStudentId, type: 'request_received', payload: { teamId, fromStudentId } },
      client,
    );
  });
}

/** Requests visible to a student: incoming pending + outgoing (their team's). */
export async function listRequestsFor(studentId: string) {
  const incoming = await query(
    `SELECT r.id, r.team_id, r.status, r.created_at,
            s.name AS from_name, s.reg_no AS from_reg_no,
            EXISTS (SELECT 1 FROM team_members m WHERE m.student_id = r.to_student) AS recipient_teamed
       FROM requests r JOIN students s ON s.id = r.from_student
      WHERE r.to_student = $1 AND r.status = 'pending'
      ORDER BY r.created_at DESC`,
    [studentId],
  );
  const outgoing = await query(
    `SELECT r.id, r.to_student, r.status, r.created_at,
            s.name AS to_name, s.reg_no AS to_reg_no
       FROM requests r JOIN students s ON s.id = r.to_student
      WHERE r.from_student = $1
      ORDER BY r.created_at DESC LIMIT 50`,
    [studentId],
  );
  return { incoming: incoming.rows, outgoing: outgoing.rows };
}

/** Accept or reject an incoming request. */
export async function respondToRequest(
  studentId: string,
  requestId: string,
  action: 'accept' | 'reject',
): Promise<TeamView | null> {
  const settings = await getSettings();

  return withTransaction(async (client) => {
    // Lock the request row.
    const reqRes = await client.query(
      `SELECT id, team_id, from_student, to_student, status
         FROM requests WHERE id = $1 FOR UPDATE`,
      [requestId],
    );
    if (reqRes.rowCount === 0) throw notFound('Request not found');
    const req = reqRes.rows[0];
    if (req.to_student !== studentId) throw forbidden('This request is not addressed to you');
    if (req.status !== 'pending') throw conflict('request_resolved', 'This request is no longer pending');

    if (action === 'reject') {
      await client.query(
        `UPDATE requests SET status = 'rejected', resolved_at = now() WHERE id = $1`,
        [requestId],
      );
      await writeAudit(
        { actorId: studentId, actorKind: 'student', action: 'request.reject', targetType: 'request', targetId: requestId },
        client,
      );
      await notifyStudent(
        { studentId: req.from_student, type: 'request_rejected', payload: { requestId } },
        client,
      );
      return null;
    }

    // ACCEPT — lock the target team and verify it is still forming + has room.
    const teamRes = await client.query(
      `SELECT id, status, leader_id FROM teams WHERE id = $1 FOR UPDATE`,
      [req.team_id],
    );
    if (teamRes.rowCount === 0) throw notFound('Team no longer exists');
    if (teamRes.rows[0].status !== 'forming') {
      throw conflict('team_locked', 'That team is already confirmed');
    }
    const memberCount = await client.query<{ n: string }>(
      `SELECT count(*) AS n FROM team_members WHERE team_id = $1`,
      [req.team_id],
    );
    if (Number(memberCount.rows[0].n) >= settings.team_size_max) {
      throw conflict('team_full', 'That team is already full');
    }

    // Insert membership. The UNIQUE(student_id) constraint is the ultimate
    // guard against double-booking under concurrency.
    try {
      await client.query(
        `INSERT INTO team_members (team_id, student_id, is_leader) VALUES ($1, $2, false)`,
        [req.team_id, studentId],
      );
    } catch (err) {
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
        throw conflict('already_teamed', 'You are already a member of a team');
      }
      throw err;
    }

    await client.query(
      `UPDATE requests SET status = 'accepted', resolved_at = now() WHERE id = $1`,
      [requestId],
    );
    await writeAudit(
      { actorId: studentId, actorKind: 'student', action: 'request.accept', targetType: 'request', targetId: requestId, detail: { teamId: req.team_id } },
      client,
    );
    await notifyStudent(
      { studentId: teamRes.rows[0].leader_id, type: 'request_accepted', payload: { teamId: req.team_id, studentId } },
      client,
    );

    return loadTeamView(req.team_id, client);
  });
}

/**
 * Confirm a team. This is the atomic lock: within a SINGLE transaction we mark
 * the team confirmed AND auto-cancel every other pending request touching any
 * member, with row locks so two near-simultaneous confirmations can't both win.
 */
export async function confirmTeam(studentId: string): Promise<TeamView> {
  const settings = await getSettings();

  return withTransaction(async (client) => {
    const membership = await client.query<{ team_id: string }>(
      'SELECT team_id FROM team_members WHERE student_id = $1',
      [studentId],
    );
    if (membership.rows.length === 0) throw badRequest('no_team', 'You are not in a team yet');
    const teamId = membership.rows[0].team_id;

    // Lock the team row for the whole operation.
    const teamRes = await client.query(
      `SELECT id, status, leader_id, route FROM teams WHERE id = $1 FOR UPDATE`,
      [teamId],
    );
    const team = teamRes.rows[0];
    if (team.status !== 'forming') throw conflict('already_confirmed', 'This team is already confirmed');
    if (team.leader_id !== studentId) throw forbidden('Only the team leader can confirm the team');

    // Lock all member student rows in a deterministic order (avoids deadlocks
    // with concurrent accepts that lock the same rows).
    const memberRows = await client.query<{ student_id: string }>(
      `SELECT student_id FROM team_members WHERE team_id = $1 ORDER BY student_id FOR UPDATE`,
      [teamId],
    );
    const members = memberRows.rows.map((r) => r.student_id);
    if (members.length < settings.team_size_min || members.length > settings.team_size_max) {
      throw badRequest(
        'invalid_size',
        `A team must have between ${settings.team_size_min} and ${settings.team_size_max} members`,
      );
    }

    await client.query(
      `UPDATE teams SET status = 'confirmed', confirmed_at = now(), updated_at = now() WHERE id = $1`,
      [teamId],
    );

    // Atomically cancel every other pending request that involves any member.
    const cancelled = await client.query<{ id: string; from_student: string; to_student: string }>(
      `UPDATE requests
          SET status = 'auto_cancelled', resolved_at = now()
        WHERE status = 'pending'
          AND team_id <> $1
          AND (from_student = ANY($2::uuid[]) OR to_student = ANY($2::uuid[]))
        RETURNING id, from_student, to_student`,
      [teamId, members],
    );

    await client.query(
      `UPDATE students SET status = 'teamed' WHERE id = ANY($1::uuid[])`,
      [members],
    );

    await writeAudit(
      { actorId: studentId, actorKind: 'student', action: 'team.confirm', targetType: 'team', targetId: teamId, detail: { members, cancelled: cancelled.rowCount } },
      client,
    );

    // Notify members + everyone whose request got auto-cancelled.
    for (const m of members) {
      await notifyStudent({ studentId: m, type: 'team_confirmed', payload: { teamId } }, client);
    }
    const affected = new Set<string>();
    for (const c of cancelled.rows) {
      if (!members.includes(c.from_student)) affected.add(c.from_student);
      if (!members.includes(c.to_student)) affected.add(c.to_student);
    }
    for (const s of affected) {
      await notifyStudent({ studentId: s, type: 'request_auto_cancelled', payload: { teamId } }, client);
    }

    return loadTeamView(teamId, client);
  });
}

/** Confirm as a single-member team (no request needed). `route` picks reviewer. */
export async function confirmSolo(
  studentId: string,
  route: 'inhouse' | 'cdc',
): Promise<TeamView> {
  return withTransaction(async (client) => {
    // Lock the student row to serialise with any concurrent accept/confirm.
    await client.query('SELECT id FROM students WHERE id = $1 FOR UPDATE', [studentId]);

    const membership = await client.query<{ team_id: string }>(
      `SELECT tm.team_id FROM team_members tm WHERE tm.student_id = $1`,
      [studentId],
    );

    let teamId: string;
    if (membership.rows.length > 0) {
      teamId = membership.rows[0].team_id;
      const teamRes = await client.query(
        `SELECT status, leader_id, (SELECT count(*) FROM team_members WHERE team_id = $1) AS n
           FROM teams WHERE id = $1 FOR UPDATE`,
        [teamId],
      );
      const t = teamRes.rows[0];
      if (t.status !== 'forming') throw conflict('already_confirmed', 'Your team is already confirmed');
      if (t.leader_id !== studentId) throw forbidden('Only the leader can confirm');
      if (Number(t.n) !== 1) {
        throw badRequest('not_solo', 'You still have other members — use confirm team instead');
      }
      await client.query(
        `UPDATE teams SET status = 'confirmed', is_solo = true, route = $2, confirmed_at = now(), updated_at = now()
          WHERE id = $1`,
        [teamId, route],
      );
    } else {
      const created = await client.query<{ id: string }>(
        `INSERT INTO teams (leader_id, route, status, is_solo, confirmed_at)
         VALUES ($1, $2, 'confirmed', true, now()) RETURNING id`,
        [studentId, route],
      );
      teamId = created.rows[0].id;
      await client.query(
        `INSERT INTO team_members (team_id, student_id, is_leader) VALUES ($1, $2, true)`,
        [teamId, studentId],
      );
    }

    // Auto-cancel any pending requests involving this student.
    const cancelled = await client.query<{ from_student: string; to_student: string }>(
      `UPDATE requests SET status = 'auto_cancelled', resolved_at = now()
        WHERE status = 'pending' AND (from_student = $1 OR to_student = $1)
        RETURNING from_student, to_student`,
      [studentId],
    );
    await client.query(`UPDATE students SET status = 'teamed' WHERE id = $1`, [studentId]);

    await writeAudit(
      { actorId: studentId, actorKind: 'student', action: 'team.confirm_solo', targetType: 'team', targetId: teamId, detail: { route } },
      client,
    );
    await notifyStudent({ studentId, type: 'team_confirmed', payload: { teamId, solo: true } }, client);
    for (const c of cancelled.rows) {
      const other = c.from_student === studentId ? c.to_student : c.from_student;
      await notifyStudent({ studentId: other, type: 'request_auto_cancelled', payload: {} }, client);
    }

    return loadTeamView(teamId, client);
  });
}

/** Leave a forming (not yet confirmed) team. Leaders may only leave if alone. */
export async function leaveTeam(studentId: string): Promise<void> {
  await withTransaction(async (client) => {
    const membership = await client.query(
      `SELECT tm.team_id, tm.is_leader, t.status,
              (SELECT count(*) FROM team_members WHERE team_id = tm.team_id) AS n
         FROM team_members tm JOIN teams t ON t.id = tm.team_id
        WHERE tm.student_id = $1 FOR UPDATE OF t`,
      [studentId],
    );
    if (membership.rowCount === 0) throw badRequest('no_team', 'You are not in a team');
    const m = membership.rows[0];
    if (m.status !== 'forming') throw conflict('team_locked', 'A confirmed team cannot be left');
    if (m.is_leader && Number(m.n) > 1) {
      throw conflict('leader_has_members', 'Remove members before leaving, or confirm the team');
    }
    await client.query('DELETE FROM team_members WHERE team_id = $1 AND student_id = $2', [m.team_id, studentId]);
    if (Number(m.n) === 1) {
      // Team is now empty — cancel its pending invites and delete it.
      await client.query(
        `UPDATE requests SET status = 'auto_cancelled', resolved_at = now() WHERE team_id = $1 AND status = 'pending'`,
        [m.team_id],
      );
      await client.query('DELETE FROM teams WHERE id = $1', [m.team_id]);
    }
    await writeAudit(
      { actorId: studentId, actorKind: 'student', action: 'team.leave', targetType: 'team', targetId: m.team_id },
      client,
    );
  });
}
