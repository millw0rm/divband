import type { ProjectStatus } from './project-lifecycle';

export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface AuthSession {
  token: string;
  userId: string;
  expiresAt: string;
}

export interface ProjectDomain {
  id: string;
  hostname: string;
  verificationToken: string;
  verificationRecord: string;
  verified: boolean;
  certificateStatus: CertificateState;
  createdAt: string;
  verifiedAt?: string;
}

export type CertificateState = 'not_requested' | 'pending' | 'issued' | 'failed';
export type DeploymentState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface Deployment {
  id: string;
  projectId: string;
  state: DeploymentState;
  gitRef: string;
  commitSha?: string;
  startedAt?: string;
  finishedAt?: string;
  logs: string[];
}

export interface EnvironmentVariable {
  key: string;
  value: string;
  protected: boolean;
  updatedAt: string;
}

export interface Project {
  id: string;
  ownerId: string;
  slug: string;
  name: string;
  status: ProjectStatus;
  gitlabPath: string;
  namespace: string;
  platformHostname: string;
  runnerTag: string;
  repositoryUrl?: string;
  namespaceProvisioned: boolean;
  platformSubdomainAttached: boolean;
  domains: ProjectDomain[];
  deployments: Deployment[];
  environmentVariables: EnvironmentVariable[];
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  action: string;
  projectId?: string;
  metadata: JsonObject;
  createdAt: string;
}

export interface ApiRequest {
  method: string;
  path: string;
  headers?: Record<string, string | undefined>;
  body?: unknown;
}

export interface ApiResponse<T = unknown> {
  status: number;
  body: T;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}
