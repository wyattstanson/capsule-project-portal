import { query, withTransaction } from '../../db/pool.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { nextProjectId } from '../../lib/id.js';
import { notifyStudent } from '../../lib/notify.js';
import { enqueuePortalSync } from '../../queue/index.js';
import { writeAudit } from '../audit/service.js';
import type { Role } from '../../auth/principal.js';

type ReviewerRole = 'project_coordinator' | 'cdc_coordinator';

export interface CreateSubmissionInput {
  title?: string;
  remark?: string;
  reason?: string;
  attachmentUrl?: string;
}

/** Submit a confirmed team for coordinator review (route decides reviewer). */
export async function createSubmission(studentId: string, input: CreateSubmissionInput) {
  return withTransaction(async (client) => {
    const teamRes = await client.query(
      `SELECT t.id, t.route, t.status, t.leader_id, t.is_solo
         FROM team_members tm JOIN teams t ON t.id = tm.team_id
        WHERE tm.student_id = $1 FOR UPDATE OF t`,
      [studentId],
    );
    if (teamRes.rowCount === 0) throw badRequest('no_team', 'You are not in a team');
    const team = teamRes.rows[0];
    if (team.leader_id !== studentId) throw forbidden('Only the team leader can submit');
    if (!['confirmed', 'rejected'].includes(team.status)) {
      throw conflict('bad_state', 'Confirm your team before submitting');
    }

    const reviewerRole: ReviewerRole =
      team.route === 'cdc' ? 'cdc_coordinator' : 'project_coordinator';

    // Route-specific required fields.
    if (team.route === 'inhouse') {
      if (!input.title || input.title.trim().length < 3) {
        throw badRequest('title_required', 'A project title is required (min 3 chars)');
      }
    } else {
      if (!input.reason || input.reason.trim().length < 3) {
        throw badRequest('reason_required', 'A reason is required for the CDC route');
      }
      if (!input.attachmentUrl) {
        throw badRequest('proof_required', 'Upload proof of placement');
      }
    }

    if (team.route === 'inhouse') {
      await client.query('UPDATE teams SET title = $2, updated_at = now() WHERE id = $1', [
        team.id,
        input.title!.trim(),
      ]);
    }
    await client.query(`UPDATE teams SET status = 'submitted', updated_at = now() WHERE id = $1`, [
      team.id,
    ]);

    const sub = await client.query<{ id: string }>(
      `INSERT INTO submissions (team_id, remark, reason, attachment_url, reviewer_role)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [team.id, input.remark ?? null, input.reason ?? null, input.attachmentUrl ?? null, reviewerRole],
    );

    // Members move to 'submitted' status for the dashboard counters.
    await client.query(
      `UPDATE students SET status = 'submitted'
        WHERE id IN (SELECT student_id FROM team_members WHERE team_id = $1)`,
      [team.id],
    );

    await writeAudit(
      { actorId: studentId, actorKind: 'student', action: 'submission.create', targetType: 'submission', targetId: sub.rows[0].id, detail: { teamId: team.id, reviewerRole } },
      client,
    );
    return { submissionId: sub.rows[0].id, reviewerRole };
  });
}

/** Coordinator's review queue for their role. */
export async function listQueue(reviewerRole: ReviewerRole, status = 'pending') {
  const rows = await query(
    `SELECT sub.id, sub.team_id, sub.remark, sub.reason, sub.attachment_url,
            sub.status, sub.created_at, t.title, t.route, t.is_solo,
            (SELECT json_agg(json_build_object('name', s.name, 'regNo', s.reg_no, 'school', s.school, 'branch', s.branch))
               FROM team_members tm JOIN students s ON s.id = tm.student_id
              WHERE tm.team_id = t.id) AS members
       FROM submissions sub JOIN teams t ON t.id = sub.team_id
      WHERE sub.reviewer_role = $1 AND sub.status = $2
      ORDER BY sub.created_at ASC`,
    [reviewerRole, status],
  );
  return rows.rows;
}

/** Approve or reject a submission. Approval mints a project id atomically. */
export async function reviewSubmission(
  staffId: string,
  staffRole: Role,
  submissionId: string,
  decision: 'approve' | 'reject',
  remark: string,
) {
  return withTransaction(async (client) => {
    const subRes = await client.query(
      `SELECT id, team_id, reviewer_role, status FROM submissions WHERE id = $1 FOR UPDATE`,
      [submissionId],
    );
    if (subRes.rowCount === 0) throw notFound('Submission not found');
    const sub = subRes.rows[0];
    // RBAC: a coordinator may only act on their own queue.
    if (sub.reviewer_role !== staffRole) throw forbidden('This submission is not in your queue');
    if (sub.status !== 'pending') throw conflict('already_reviewed', 'This submission was already reviewed');

    const teamRes = await client.query(`SELECT id, route FROM teams WHERE id = $1 FOR UPDATE`, [
      sub.team_id,
    ]);
    const teamId = teamRes.rows[0].id;

    const members = await client.query<{ student_id: string; reg_no: string; email: string }>(
      `SELECT s.id AS student_id, s.reg_no, s.email
         FROM team_members tm JOIN students s ON s.id = tm.student_id
        WHERE tm.team_id = $1`,
      [teamId],
    );

    if (decision === 'approve') {
      const projectId = await nextProjectId(client);
      await client.query(
        `UPDATE submissions SET status = 'approved', reviewer_remark = $2, reviewed_by = $3, reviewed_at = now() WHERE id = $1`,
        [submissionId, remark || null, staffId],
      );
      await client.query(
        `UPDATE teams SET status = 'approved', project_id = $2, updated_at = now() WHERE id = $1`,
        [teamId, projectId],
      );
      await client.query(
        `UPDATE students SET status = 'approved' WHERE id = ANY($1::uuid[])`,
        [members.rows.map((m) => m.student_id)],
      );
      await writeAudit(
        { actorId: staffId, actorKind: 'staff', action: 'submission.approve', targetType: 'submission', targetId: submissionId, detail: { teamId, projectId, remark } },
        client,
      );
      for (const m of members.rows) {
        await notifyStudent({ studentId: m.student_id, type: 'approved', payload: { projectId, teamId } }, client);
      }
      // Sync the assigned project id to the external student portal (queued).
      enqueuePortalSync({
        teamId,
        projectId,
        members: members.rows.map((m) => ({ regNo: m.reg_no, email: m.email })),
      }).catch(() => {});
      return { status: 'approved', projectId };
    }

    // REJECT — team returns to 'rejected' so the leader can edit & resubmit.
    await client.query(
      `UPDATE submissions SET status = 'rejected', reviewer_remark = $2, reviewed_by = $3, reviewed_at = now() WHERE id = $1`,
      [submissionId, remark || null, staffId],
    );
    await client.query(`UPDATE teams SET status = 'rejected', updated_at = now() WHERE id = $1`, [teamId]);
    await client.query(
      `UPDATE students SET status = 'teamed' WHERE id = ANY($1::uuid[])`,
      [members.rows.map((m) => m.student_id)],
    );
    await writeAudit(
      { actorId: staffId, actorKind: 'staff', action: 'submission.reject', targetType: 'submission', targetId: submissionId, detail: { teamId, remark } },
      client,
    );
    for (const m of members.rows) {
      await notifyStudent({ studentId: m.student_id, type: 'rejected', payload: { teamId, remark } }, client);
    }
    return { status: 'rejected' };
  });
}

/** A team's submission history (for showing rejection remarks + resubmit). */
export async function submissionHistory(teamId: string) {
  const rows = await query(
    `SELECT id, remark, reason, attachment_url, reviewer_role, status, reviewer_remark, reviewed_at, created_at
       FROM submissions WHERE team_id = $1 ORDER BY created_at DESC`,
    [teamId],
  );
  return rows.rows;
}
