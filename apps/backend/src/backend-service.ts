import { createProjectLifecyclePlan, type ProjectStatus } from './project-lifecycle';
import type { ApiErrorBody, ApiRequest, ApiResponse, Deployment, EnvironmentVariable, Project, ProjectDomain, User } from './models';
import { defaultStore, type BackendStore } from './store';
import { AuthService, type LoginInput, type RegisterInput } from './services/auth';
import { AuditLogService } from './services/audit-log';
import { CertificateStatusService } from './services/certificate-status';
import { DeploymentStatusService } from './services/deployment-status';
import { DnsVerificationService } from './services/dns-verification';
import { GitLabService } from './services/gitlab';
import { KubernetesService } from './services/kubernetes';
import { createId, maskSecret, normalizeSlug, nowIso } from './utils';

interface RouteMatch {
  segments: string[];
  query: URLSearchParams;
}

interface CreateProjectBody {
  name?: unknown;
  slug?: unknown;
}

export class BackendService {
  private readonly auth: AuthService;
  private readonly audit: AuditLogService;
  private readonly certificates = new CertificateStatusService();
  private readonly deployments = new DeploymentStatusService();
  private readonly dns = new DnsVerificationService();
  private readonly gitlab = new GitLabService();
  private readonly kubernetes = new KubernetesService();

  constructor(private readonly store: BackendStore = defaultStore) {
    this.auth = new AuthService(store);
    this.audit = new AuditLogService(store);
  }

  async handle(request: ApiRequest): Promise<ApiResponse> {
    try {
      const route = this.parsePath(request.path);
      const method = request.method.toUpperCase();

      if (method === 'POST' && this.matches(route, 'auth', 'register')) {
        const result = this.auth.register(this.registerInput(request.body));
        this.audit.record(result.user.id, 'user.registered', { email: result.user.email });
        return this.created(result);
      }

      if (method === 'POST' && this.matches(route, 'auth', 'login')) {
        const result = this.auth.login(this.loginInput(request.body));
        this.audit.record(result.user.id, 'user.logged_in', { email: result.user.email });
        return this.ok(result);
      }

      const user = this.auth.authenticate(request.headers?.authorization ?? request.headers?.Authorization);

      if (method === 'GET' && this.matches(route, 'projects')) {
        return this.ok({ projects: this.listProjects(user) });
      }

      if (method === 'POST' && this.matches(route, 'projects')) {
        return this.created({ project: this.createProject(user, this.requiredObject(request.body) as CreateProjectBody) }, 202);
      }

      const projectId = route.segments[1];
      if (route.segments[0] === 'projects' && projectId) {
        const project = this.requireProject(projectId, user);

        if (method === 'GET' && route.segments.length === 2) {
          return this.ok({ project });
        }

        if (method === 'DELETE' && route.segments.length === 2) {
          return this.ok({ project: this.archiveProject(project, user) });
        }

        if (method === 'GET' && this.matches(route, 'projects', projectId, 'status')) {
          return this.ok({
            status: project.status,
            repositoryUrl: project.repositoryUrl,
            namespaceProvisioned: project.namespaceProvisioned,
            platformSubdomainAttached: project.platformSubdomainAttached,
            activeDomains: project.domains.filter((domain) => domain.verified).map((domain) => domain.hostname),
            latestDeployment: project.deployments.at(-1),
          });
        }

        if (method === 'POST' && this.matches(route, 'projects', projectId, 'gitlab-repository')) {
          return this.ok({ repository: await this.createGitLabRepository(project, user), project });
        }

        if (method === 'POST' && this.matches(route, 'projects', projectId, 'kubernetes-namespace')) {
          return this.ok({ namespace: await this.provisionKubernetesNamespace(project, user), project });
        }

        if (method === 'POST' && this.matches(route, 'projects', projectId, 'platform-subdomain')) {
          return this.ok({ hostname: this.attachPlatformSubdomain(project, user), project });
        }

        if (method === 'POST' && this.matches(route, 'projects', projectId, 'domains')) {
          return this.created({ domain: this.addCustomDomain(project, user, this.requiredObject(request.body)) }, 202);
        }

        if (method === 'POST' && route.segments[2] === 'domains' && route.segments[3] && route.segments[4] === 'verify') {
          return this.ok({ domain: await this.verifyCustomDomain(project, user, route.segments[3], this.optionalObject(request.body)) });
        }

        if (method === 'POST' && this.matches(route, 'projects', projectId, 'deployments')) {
          return this.created({ deployment: this.triggerDeployment(project, user, this.optionalObject(request.body)), project }, 202);
        }

        if (method === 'GET' && route.segments[2] === 'deployments' && route.segments[3]) {
          return this.ok({ deployment: this.requireDeployment(project, route.segments[3]) });
        }

        if (method === 'GET' && this.matches(route, 'projects', projectId, 'logs')) {
          return this.ok({ deployments: project.deployments.map(({ id, state, logs }) => ({ id, state, logs })) });
        }

        if (method === 'GET' && this.matches(route, 'projects', projectId, 'environment-variables')) {
          return this.ok({ environmentVariables: project.environmentVariables.map((variable) => ({ ...variable, value: maskSecret(variable.value) })) });
        }

        if (method === 'PUT' && this.matches(route, 'projects', projectId, 'environment-variables')) {
          return this.ok({ environmentVariables: this.upsertEnvironmentVariables(project, user, this.requiredObject(request.body)) });
        }

        if (method === 'DELETE' && route.segments[2] === 'environment-variables' && route.segments[3]) {
          return this.ok({ environmentVariables: this.deleteEnvironmentVariable(project, user, route.segments[3]) });
        }
      }

      return this.error(404, 'not_found', 'Endpoint not found.');
    } catch (error) {
      return this.error(400, 'bad_request', error instanceof Error ? error.message : 'Request failed.');
    }
  }

  private createProject(user: User, body: CreateProjectBody): Project {
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Untitled project';
    const slugSource = typeof body.slug === 'string' ? body.slug : name;
    const slug = normalizeSlug(slugSource);
    if (!slug) {
      throw new Error('Project slug is required.');
    }

    const plan = createProjectLifecyclePlan(slug, `divband/${user.id}`);
    const timestamp = nowIso();
    const project: Project = {
      id: createId('project'),
      ownerId: user.id,
      name,
      slug: plan.slug,
      status: 'draft',
      gitlabPath: plan.gitlabPath,
      namespace: plan.namespace,
      platformHostname: plan.platformHostname,
      runnerTag: plan.runnerTag,
      namespaceProvisioned: false,
      platformSubdomainAttached: false,
      domains: [],
      deployments: [],
      environmentVariables: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.store.projects.set(project.id, project);
    this.audit.record(user.id, 'project.created', { slug: project.slug }, project.id);
    return project;
  }

  private listProjects(user: User): Project[] {
    return [...this.store.projects.values()].filter((project) => project.ownerId === user.id && project.status !== 'archived');
  }

  private async createGitLabRepository(project: Project, user: User): Promise<unknown> {
    const repository = await this.gitlab.createRepository(project);
    await this.gitlab.configureRunnerTag(project);
    project.repositoryUrl = repository.webUrl;
    this.touch(project, 'repository_provisioned');
    this.audit.record(user.id, 'project.gitlab_repository_created', { path: repository.path }, project.id);
    return repository;
  }

  private async provisionKubernetesNamespace(project: Project, user: User): Promise<unknown> {
    const namespace = await this.kubernetes.provisionNamespace(project);
    project.namespaceProvisioned = true;
    this.touch(project, 'namespace_provisioned');
    this.audit.record(user.id, 'project.kubernetes_namespace_provisioned', { namespace: namespace.name }, project.id);
    return namespace;
  }

  private attachPlatformSubdomain(project: Project, user: User): string {
    project.platformSubdomainAttached = true;
    this.touch(project);
    this.audit.record(user.id, 'project.platform_subdomain_attached', { hostname: project.platformHostname }, project.id);
    return project.platformHostname;
  }

  private addCustomDomain(project: Project, user: User, body: Record<string, unknown>): ProjectDomain {
    const hostname = typeof body.hostname === 'string' ? body.hostname.trim().toLowerCase() : '';
    if (!hostname || !hostname.includes('.')) {
      throw new Error('A valid hostname is required.');
    }

    const challenge = this.dns.createChallenge(hostname);
    const domain: ProjectDomain = {
      id: createId('domain'),
      hostname,
      verificationToken: challenge.token,
      verificationRecord: `${challenge.recordName} ${challenge.recordType} ${challenge.recordValue}`,
      verified: false,
      certificateStatus: 'not_requested',
      createdAt: nowIso(),
    };

    project.domains.push(domain);
    this.touch(project, 'domain_pending_verification');
    this.audit.record(user.id, 'project.custom_domain_added', { hostname }, project.id);
    return domain;
  }

  private async verifyCustomDomain(project: Project, user: User, domainId: string, body: Record<string, unknown>): Promise<ProjectDomain> {
    const domain = this.requireDomain(project, domainId);
    const observedToken = typeof body.observedToken === 'string' ? body.observedToken : undefined;
    const verified = await this.dns.verify(domain.hostname, domain.verificationToken, observedToken);
    if (!verified) {
      throw new Error('DNS verification failed.');
    }

    const updatedDomain = this.certificates.markRequested({ ...domain, verified: true, verifiedAt: nowIso() });
    Object.assign(domain, updatedDomain);
    this.touch(project, 'domain_active');
    this.audit.record(user.id, 'project.custom_domain_verified', { hostname: domain.hostname }, project.id);
    return domain;
  }

  private triggerDeployment(project: Project, user: User, body: Record<string, unknown>): Deployment {
    const gitRef = typeof body.gitRef === 'string' ? body.gitRef : 'main';
    const commitSha = typeof body.commitSha === 'string' ? body.commitSha : undefined;
    const deployment = this.deployments.trigger(project, gitRef, commitSha);
    project.deployments.push(deployment);
    this.touch(project, 'building');
    this.audit.record(user.id, 'project.deployment_triggered', { deploymentId: deployment.id, gitRef }, project.id);
    return deployment;
  }

  private upsertEnvironmentVariables(project: Project, user: User, body: Record<string, unknown>): EnvironmentVariable[] {
    const variables = Array.isArray(body.variables) ? body.variables : [];
    for (const rawVariable of variables) {
      if (!this.isRecord(rawVariable) || typeof rawVariable.key !== 'string' || typeof rawVariable.value !== 'string') {
        throw new Error('Each environment variable requires a string key and value.');
      }

      const key = rawVariable.key.trim().toUpperCase();
      if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
        throw new Error(`Invalid environment variable key: ${rawVariable.key}`);
      }

      const existing = project.environmentVariables.find((variable) => variable.key === key);
      const next: EnvironmentVariable = {
        key,
        value: rawVariable.value,
        protected: rawVariable.protected === true,
        updatedAt: nowIso(),
      };

      if (existing) {
        Object.assign(existing, next);
      } else {
        project.environmentVariables.push(next);
      }
    }

    this.touch(project);
    this.audit.record(user.id, 'project.environment_variables_updated', { keys: variables.length }, project.id);
    return project.environmentVariables.map((variable) => ({ ...variable, value: maskSecret(variable.value) }));
  }

  private deleteEnvironmentVariable(project: Project, user: User, key: string): EnvironmentVariable[] {
    project.environmentVariables = project.environmentVariables.filter((variable) => variable.key !== key.toUpperCase());
    this.touch(project);
    this.audit.record(user.id, 'project.environment_variable_deleted', { key: key.toUpperCase() }, project.id);
    return project.environmentVariables.map((variable) => ({ ...variable, value: maskSecret(variable.value) }));
  }

  private archiveProject(project: Project, user: User): Project {
    project.archivedAt = nowIso();
    this.touch(project, 'archived');
    this.audit.record(user.id, 'project.archived', {}, project.id);
    return project;
  }

  private requireProject(projectId: string, user: User): Project {
    const project = this.store.projects.get(projectId);
    if (!project || project.ownerId !== user.id) {
      throw new Error('Project not found.');
    }

    return project;
  }

  private requireDomain(project: Project, domainId: string): ProjectDomain {
    const domain = project.domains.find((item) => item.id === domainId);
    if (!domain) {
      throw new Error('Domain not found.');
    }

    return domain;
  }

  private requireDeployment(project: Project, deploymentId: string): Deployment {
    const deployment = project.deployments.find((item) => item.id === deploymentId);
    if (!deployment) {
      throw new Error('Deployment not found.');
    }

    return deployment;
  }

  private touch(project: Project, status?: ProjectStatus): void {
    if (status) {
      project.status = status;
    }
    project.updatedAt = nowIso();
  }

  private parsePath(path: string): RouteMatch {
    const url = new URL(path, 'https://api.divband.local');
    return {
      segments: url.pathname.split('/').filter(Boolean).map(decodeURIComponent),
      query: url.searchParams,
    };
  }

  private matches(route: RouteMatch, ...segments: string[]): boolean {
    return route.segments.length === segments.length && route.segments.every((segment, index) => segment === segments[index]);
  }


  private registerInput(body: unknown): RegisterInput {
    const record = this.requiredObject(body);
    if (typeof record.email !== 'string' || typeof record.name !== 'string' || typeof record.password !== 'string') {
      throw new Error('Registration requires email, name, and password.');
    }

    return { email: record.email, name: record.name, password: record.password };
  }

  private loginInput(body: unknown): LoginInput {
    const record = this.requiredObject(body);
    if (typeof record.email !== 'string' || typeof record.password !== 'string') {
      throw new Error('Login requires email and password.');
    }

    return { email: record.email, password: record.password };
  }

  private requiredObject(body: unknown): Record<string, unknown> {
    if (!this.isRecord(body)) {
      throw new Error('JSON object body is required.');
    }

    return body;
  }

  private optionalObject(body: unknown): Record<string, unknown> {
    return this.isRecord(body) ? body : {};
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private ok<T>(body: T): ApiResponse<T> {
    return { status: 200, body };
  }

  private created<T>(body: T, status = 201): ApiResponse<T> {
    return { status, body };
  }

  private error(status: number, code: string, message: string): ApiResponse<ApiErrorBody> {
    return { status, body: { error: { code, message } } };
  }
}

export const backendService = new BackendService();
export const handleApiRequest = (request: ApiRequest): Promise<ApiResponse> => backendService.handle(request);
