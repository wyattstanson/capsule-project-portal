// The authenticated identity carried on every request after the auth guard.
export type Role =
  | 'student'
  | 'project_coordinator'
  | 'cdc_coordinator'
  | 'admin'
  | 'proctor';

export interface Principal {
  // subject id: a students.id when kind='student', else a staff.id
  sub: string;
  kind: 'student' | 'staff';
  role: Role;
  email: string;
  name: string;
}

// Fastify request decoration.
declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
  }
}
