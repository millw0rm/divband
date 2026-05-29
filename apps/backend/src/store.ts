import type { AuditEvent, AuthSession, Project, User } from './models';

export interface BackendStore {
  users: Map<string, User>;
  usersByEmail: Map<string, string>;
  passwordHashesByUserId: Map<string, string>;
  sessions: Map<string, AuthSession>;
  projects: Map<string, Project>;
  auditEvents: AuditEvent[];
}

export function createBackendStore(): BackendStore {
  return {
    users: new Map(),
    usersByEmail: new Map(),
    passwordHashesByUserId: new Map(),
    sessions: new Map(),
    projects: new Map(),
    auditEvents: [],
  };
}

export const defaultStore = createBackendStore();
