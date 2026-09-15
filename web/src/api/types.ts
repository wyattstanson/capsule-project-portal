export type Role =
  | 'student'
  | 'project_coordinator'
  | 'cdc_coordinator'
  | 'admin'
  | 'proctor';

export interface Principal {
  sub: string;
  kind: 'student' | 'staff';
  role: Role;
  email: string;
  name: string;
}

export interface Member {
  studentId: string;
  name: string;
  regNo: string;
  isLeader: boolean;
}

export interface Team {
  id: string;
  title: string | null;
  route: 'inhouse' | 'cdc';
  status: 'forming' | 'confirmed' | 'submitted' | 'approved' | 'rejected';
  isSolo: boolean;
  projectId: string | null;
  leaderId: string;
  members: Member[];
}

export interface StudentRow {
  id: string;
  reg_no: string;
  name: string;
  school: string;
  branch: string;
}

export interface IncomingRequest {
  id: string;
  team_id: string;
  status: string;
  created_at: string;
  from_name: string;
  from_reg_no: string;
  recipient_teamed: boolean;
}

export interface OutgoingRequest {
  id: string;
  to_student: string;
  status: string;
  created_at: string;
  to_name: string;
  to_reg_no: string;
}

export interface AppNotification {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface SubmissionRow {
  id: string;
  team_id: string;
  remark: string | null;
  reason: string | null;
  attachment_url: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewer_remark?: string | null;
  reviewer_role?: string;
  created_at: string;
  reviewed_at?: string | null;
  title?: string | null;
  route?: string;
  is_solo?: boolean;
  members?: { name: string; regNo: string; school?: string; branch?: string }[];
}

export interface Dashboard {
  totalStudents: number;
  groupsFormed: number;
  notParticipated: number;
  studentsByStatus: Record<string, number>;
  teamsByRoute: { route: string; status: string; count: number }[];
}

export interface Deadline {
  key: string;
  label: string;
  deadline_at: string;
}
