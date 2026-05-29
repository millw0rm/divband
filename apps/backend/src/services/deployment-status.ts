import type { Deployment, DeploymentState, Project } from '../models';
import { createId, nowIso } from '../utils';

export class DeploymentStatusService {
  trigger(project: Project, gitRef: string, commitSha?: string): Deployment {
    return {
      id: createId('deploy'),
      projectId: project.id,
      state: 'queued',
      gitRef,
      commitSha,
      logs: [`${nowIso()} queued deployment for ${gitRef}`],
    };
  }

  transition(deployment: Deployment, state: DeploymentState, logLine?: string): Deployment {
    const timestamp = nowIso();
    return {
      ...deployment,
      state,
      startedAt: deployment.startedAt ?? (state === 'running' ? timestamp : undefined),
      finishedAt: ['succeeded', 'failed', 'cancelled'].includes(state) ? timestamp : deployment.finishedAt,
      logs: logLine ? [...deployment.logs, `${timestamp} ${logLine}`] : deployment.logs,
    };
  }
}
