import type { Deployment, EnvironmentVariable, Project, ProjectDomain } from '../../backend/src/models';
import type { ProjectStatus } from '../../backend/src/project-lifecycle';

export type DashboardPageId =
  | 'sign-in'
  | 'sign-up'
  | 'projects'
  | 'create-project'
  | 'project-overview'
  | 'gitlab-repository'
  | 'deployment-status'
  | 'domain-management'
  | 'environment-variables'
  | 'logs-build-history'
  | 'ai-assistant';

export interface DashboardSection {
  id: DashboardPageId;
  title: string;
  description: string;
  requiresProject: boolean;
  apiCalls: readonly string[];
}

export type LifecycleState =
  | 'created'
  | 'repository_provisioned'
  | 'namespace_provisioned'
  | 'building'
  | 'deployed'
  | 'domain_pending_verification'
  | 'domain_active'
  | 'failed';

export interface LifecycleStep {
  state: LifecycleState;
  label: string;
  description: string;
  isComplete: boolean;
  isCurrent: boolean;
  isFailed: boolean;
}

export interface DashboardSession {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

export interface ProjectStatusSummary {
  status: ProjectStatus;
  repositoryUrl?: string;
  namespaceProvisioned: boolean;
  platformSubdomainAttached: boolean;
  activeDomains: string[];
  latestDeployment?: Deployment;
}

export interface ProjectDashboardModel {
  selectedProject?: Project;
  projects: Project[];
  statusSummary?: ProjectStatusSummary;
  lifecycle: LifecycleStep[];
  repository?: RepositoryPanelModel;
  deployment?: DeploymentPanelModel;
  domains?: DomainPanelModel;
  environmentVariables?: EnvironmentVariable[];
  logs?: BuildLogSummary[];
  assistant?: AssistantPanelModel;
}

export interface RepositoryPanelModel {
  gitlabPath: string;
  repositoryUrl?: string;
  runnerTag: string;
  isProvisioned: boolean;
  provisionAction: ApiAction;
}

export interface DeploymentPanelModel {
  state: 'not_started' | Deployment['state'];
  latestDeployment?: Deployment;
  deployAction: ApiAction;
}

export interface DomainPanelModel {
  platformHostname: string;
  platformSubdomainAttached: boolean;
  domains: ProjectDomain[];
  addDomainAction: ApiAction;
}

export interface BuildLogSummary {
  id: string;
  state: Deployment['state'];
  lines: string[];
}

export interface AssistantPanelModel {
  projectId?: string;
  messages: AssistantMessage[];
  quickRequests: string[];
  submitAction?: ApiAction;
}

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface ApiAction {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  label: string;
}

export interface CreateProjectInput {
  name: string;
  slug?: string;
}

export interface UpsertEnvironmentVariablesInput {
  variables: Array<Pick<EnvironmentVariable, 'key' | 'value' | 'protected'>>;
}

export interface AssistantRequestInput {
  prompt: string;
  targetBranch?: string;
}

type JsonRecord = Record<string, unknown>;

type FetchLike = (url: string, init: FetchRequestInit) => Promise<FetchResponseLike>;

interface FetchRequestInit {
  method: string;
  headers: Record<string, string>;
  body?: string;
}

interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export const lifecycleLabels: Record<LifecycleState, string> = {
  created: 'Created',
  repository_provisioned: 'Repository provisioned',
  namespace_provisioned: 'Namespace provisioned',
  building: 'Building',
  deployed: 'Deployed',
  domain_pending_verification: 'Domain pending verification',
  domain_active: 'Domain active',
  failed: 'Failed',
};

const lifecycleDescriptions: Record<LifecycleState, string> = {
  created: 'The project exists and is waiting for infrastructure provisioning.',
  repository_provisioned: 'A GitLab repository and runner tag are ready for source changes.',
  namespace_provisioned: 'The Kubernetes namespace, policy, quota, and RBAC boundary are ready.',
  building: 'A deployment build is running or queued for this project.',
  deployed: 'The latest successful build is serving traffic.',
  domain_pending_verification: 'A custom domain was added and is waiting for DNS verification.',
  domain_active: 'The custom domain is verified and ready to receive traffic.',
  failed: 'Provisioning, verification, or deployment needs attention.',
};

const lifecycleOrder: LifecycleState[] = [
  'created',
  'repository_provisioned',
  'namespace_provisioned',
  'building',
  'deployed',
  'domain_pending_verification',
  'domain_active',
];

export const dashboardSections: DashboardSection[] = [
  {
    id: 'sign-in',
    title: 'Sign in',
    description: 'Authenticate with an existing divband account.',
    requiresProject: false,
    apiCalls: ['POST /auth/login'],
  },
  {
    id: 'sign-up',
    title: 'Sign up',
    description: 'Create a divband account and start a session.',
    requiresProject: false,
    apiCalls: ['POST /auth/register'],
  },
  {
    id: 'projects',
    title: 'Project list',
    description: 'Browse existing projects with lifecycle status badges.',
    requiresProject: false,
    apiCalls: ['GET /projects'],
  },
  {
    id: 'create-project',
    title: 'Create project',
    description: 'Create a project record before provisioning begins.',
    requiresProject: false,
    apiCalls: ['POST /projects'],
  },
  {
    id: 'project-overview',
    title: 'Project overview',
    description: 'Show metadata, lifecycle progress, hostnames, and latest activity.',
    requiresProject: true,
    apiCalls: ['GET /projects/{projectId}', 'GET /projects/{projectId}/status'],
  },
  {
    id: 'gitlab-repository',
    title: 'GitLab repository status',
    description: 'Provision and review the GitLab repository URL, project path, and runner tag.',
    requiresProject: true,
    apiCalls: ['POST /projects/{projectId}/gitlab-repository'],
  },
  {
    id: 'deployment-status',
    title: 'Deployment status',
    description: 'Start deployments and track queued, running, succeeded, failed, or cancelled builds.',
    requiresProject: true,
    apiCalls: ['POST /projects/{projectId}/deployments', 'GET /projects/{projectId}/deployments/{deploymentId}'],
  },
  {
    id: 'domain-management',
    title: 'Domain management',
    description: 'Attach platform hostnames, add custom domains, and verify DNS challenges.',
    requiresProject: true,
    apiCalls: [
      'POST /projects/{projectId}/platform-subdomain',
      'POST /projects/{projectId}/domains',
      'POST /projects/{projectId}/domains/{domainId}/verify',
    ],
  },
  {
    id: 'environment-variables',
    title: 'Environment variables',
    description: 'Review masked variables and update protected runtime configuration.',
    requiresProject: true,
    apiCalls: ['GET /projects/{projectId}/environment-variables', 'PUT /projects/{projectId}/environment-variables'],
  },
  {
    id: 'logs-build-history',
    title: 'Logs and build history',
    description: 'Inspect recent build records and deployment log lines.',
    requiresProject: true,
    apiCalls: ['GET /projects/{projectId}/logs'],
  },
  {
    id: 'ai-assistant',
    title: 'AI assistant',
    description: 'Chat about feature requests and project changes before generating reviewed work.',
    requiresProject: true,
    apiCalls: ['POST /projects/{projectId}/assistant/requests'],
  },
];

export class DashboardApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: FetchLike,
    private token?: string,
  ) {}

  setSession(session: DashboardSession): void {
    this.token = session.token;
  }

  async signIn(email: string, password: string): Promise<DashboardSession> {
    return this.request<DashboardSession>('POST', '/auth/login', { email, password });
  }

  async signUp(email: string, name: string, password: string): Promise<DashboardSession> {
    return this.request<DashboardSession>('POST', '/auth/register', { email, name, password });
  }

  async listProjects(): Promise<Project[]> {
    const response = await this.request<{ projects: Project[] }>('GET', '/projects');
    return response.projects;
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const response = await this.request<{ project: Project }>('POST', '/projects', input);
    return response.project;
  }

  async getProject(projectId: string): Promise<Project> {
    const response = await this.request<{ project: Project }>('GET', `/projects/${encodeURIComponent(projectId)}`);
    return response.project;
  }

  async getProjectStatus(projectId: string): Promise<ProjectStatusSummary> {
    return this.request<ProjectStatusSummary>('GET', `/projects/${encodeURIComponent(projectId)}/status`);
  }

  async provisionGitLabRepository(projectId: string): Promise<Project> {
    const response = await this.request<{ project: Project }>('POST', `/projects/${encodeURIComponent(projectId)}/gitlab-repository`);
    return response.project;
  }

  async provisionNamespace(projectId: string): Promise<Project> {
    const response = await this.request<{ project: Project }>('POST', `/projects/${encodeURIComponent(projectId)}/kubernetes-namespace`);
    return response.project;
  }

  async attachPlatformSubdomain(projectId: string): Promise<Project> {
    const response = await this.request<{ project: Project }>('POST', `/projects/${encodeURIComponent(projectId)}/platform-subdomain`);
    return response.project;
  }

  async addDomain(projectId: string, hostname: string): Promise<ProjectDomain> {
    const response = await this.request<{ domain: ProjectDomain }>('POST', `/projects/${encodeURIComponent(projectId)}/domains`, { hostname });
    return response.domain;
  }

  async verifyDomain(projectId: string, domainId: string, observedToken: string): Promise<ProjectDomain> {
    const response = await this.request<{ domain: ProjectDomain }>(
      'POST',
      `/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domainId)}/verify`,
      { observedToken },
    );
    return response.domain;
  }

  async triggerDeployment(projectId: string, gitRef = 'main', commitSha?: string): Promise<Deployment> {
    const response = await this.request<{ deployment: Deployment }>('POST', `/projects/${encodeURIComponent(projectId)}/deployments`, {
      gitRef,
      commitSha,
    });
    return response.deployment;
  }

  async getEnvironmentVariables(projectId: string): Promise<EnvironmentVariable[]> {
    const response = await this.request<{ environmentVariables: EnvironmentVariable[] }>(
      'GET',
      `/projects/${encodeURIComponent(projectId)}/environment-variables`,
    );
    return response.environmentVariables;
  }

  async upsertEnvironmentVariables(projectId: string, input: UpsertEnvironmentVariablesInput): Promise<EnvironmentVariable[]> {
    const response = await this.request<{ environmentVariables: EnvironmentVariable[] }>(
      'PUT',
      `/projects/${encodeURIComponent(projectId)}/environment-variables`,
      input,
    );
    return response.environmentVariables;
  }

  async getLogs(projectId: string): Promise<BuildLogSummary[]> {
    const response = await this.request<{ deployments: BuildLogSummary[] }>('GET', `/projects/${encodeURIComponent(projectId)}/logs`);
    return response.deployments;
  }

  async submitAssistantRequest(projectId: string, input: AssistantRequestInput): Promise<AssistantMessage> {
    return this.request<AssistantMessage>('POST', `/projects/${encodeURIComponent(projectId)}/assistant/requests`, input);
  }

  private async request<T>(method: ApiAction['method'], path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json();

    if (!response.ok) {
      const errorMessage = readApiError(payload) ?? `Request failed with HTTP ${response.status}.`;
      throw new Error(errorMessage);
    }

    return payload as T;
  }
}

export function normalizeLifecycleState(status: ProjectStatus): LifecycleState {
  if (status === 'draft') {
    return 'created';
  }

  if (status === 'archived') {
    return 'failed';
  }

  return status;
}

export function buildLifecycleSteps(status: ProjectStatus): LifecycleStep[] {
  const normalized = normalizeLifecycleState(status);
  const currentIndex = normalized === 'failed' ? -1 : lifecycleOrder.indexOf(normalized);
  const orderedStates = normalized === 'failed' ? [...lifecycleOrder, 'failed' as const] : lifecycleOrder;

  return orderedStates.map((state, index) => ({
    state,
    label: lifecycleLabels[state],
    description: lifecycleDescriptions[state],
    isComplete: currentIndex >= 0 && index < currentIndex,
    isCurrent: state === normalized,
    isFailed: normalized === 'failed' && state === 'failed',
  }));
}

export function buildDashboardModel(
  projects: Project[],
  selectedProject?: Project,
  statusSummary?: ProjectStatusSummary,
  environmentVariables: EnvironmentVariable[] = [],
  logs: BuildLogSummary[] = [],
  assistantMessages: AssistantMessage[] = [],
): ProjectDashboardModel {
  const status = statusSummary?.status ?? selectedProject?.status ?? 'draft';

  return {
    projects,
    selectedProject,
    statusSummary,
    lifecycle: buildLifecycleSteps(status),
    repository: selectedProject ? buildRepositoryPanel(selectedProject) : undefined,
    deployment: selectedProject ? buildDeploymentPanel(selectedProject) : undefined,
    domains: selectedProject ? buildDomainPanel(selectedProject) : undefined,
    environmentVariables,
    logs,
    assistant: buildAssistantPanel(selectedProject, assistantMessages),
  };
}

export function renderDashboardPage(pageId: DashboardPageId, model: ProjectDashboardModel): string {
  const page = dashboardSections.find((section) => section.id === pageId);
  if (!page) {
    return renderShell('Unknown page', '<p>The requested dashboard page does not exist.</p>');
  }

  const content = renderPageContent(pageId, model);
  return renderShell(page.title, `${renderNavigation(pageId)}<main>${content}</main>`);
}

function buildRepositoryPanel(project: Project): RepositoryPanelModel {
  return {
    gitlabPath: project.gitlabPath,
    repositoryUrl: project.repositoryUrl,
    runnerTag: project.runnerTag,
    isProvisioned: Boolean(project.repositoryUrl),
    provisionAction: {
      method: 'POST',
      path: `/projects/${project.id}/gitlab-repository`,
      label: 'Provision GitLab repository',
    },
  };
}

function buildDeploymentPanel(project: Project): DeploymentPanelModel {
  const latestDeployment = project.deployments.at(-1);

  return {
    state: latestDeployment?.state ?? 'not_started',
    latestDeployment,
    deployAction: {
      method: 'POST',
      path: `/projects/${project.id}/deployments`,
      label: 'Deploy main branch',
    },
  };
}

function buildDomainPanel(project: Project): DomainPanelModel {
  return {
    platformHostname: project.platformHostname,
    platformSubdomainAttached: project.platformSubdomainAttached,
    domains: project.domains,
    addDomainAction: {
      method: 'POST',
      path: `/projects/${project.id}/domains`,
      label: 'Add custom domain',
    },
  };
}

function buildAssistantPanel(project: Project | undefined, messages: AssistantMessage[]): AssistantPanelModel {
  const projectContext = project ? ` for ${project.name}` : '';

  return {
    projectId: project?.id,
    messages,
    quickRequests: [
      `Add a landing page${projectContext}`,
      `Update copy and SEO metadata${projectContext}`,
      `Investigate the latest failed build${projectContext}`,
    ],
    submitAction: project
      ? {
          method: 'POST',
          path: `/projects/${project.id}/assistant/requests`,
          label: 'Send feature request',
        }
      : undefined,
  };
}

function renderPageContent(pageId: DashboardPageId, model: ProjectDashboardModel): string {
  switch (pageId) {
    case 'sign-in':
      return renderAuthCard('Sign in', 'POST /auth/login', ['email', 'password']);
    case 'sign-up':
      return renderAuthCard('Sign up', 'POST /auth/register', ['name', 'email', 'password']);
    case 'projects':
      return renderProjectList(model.projects);
    case 'create-project':
      return renderCreateProject();
    case 'project-overview':
      return renderProjectOverview(model);
    case 'gitlab-repository':
      return renderRepository(model.repository);
    case 'deployment-status':
      return renderDeployment(model.deployment);
    case 'domain-management':
      return renderDomains(model.domains);
    case 'environment-variables':
      return renderEnvironmentVariables(model.environmentVariables ?? []);
    case 'logs-build-history':
      return renderLogs(model.logs ?? []);
    case 'ai-assistant':
      return renderAssistant(model.assistant);
  }
}

function renderShell(title: string, body: string): string {
  return `<section class="dashboard-shell"><header><p class="eyebrow">divband dashboard</p><h1>${escapeHtml(title)}</h1></header>${body}</section>`;
}

function renderNavigation(activePage: DashboardPageId): string {
  const links = dashboardSections
    .map((section) => `<a href="#${section.id}"${section.id === activePage ? ' aria-current="page"' : ''}>${escapeHtml(section.title)}</a>`)
    .join('');

  return `<nav aria-label="Dashboard pages">${links}</nav>`;
}

function renderAuthCard(title: string, action: string, fields: string[]): string {
  const fieldMarkup = fields.map((field) => `<label>${escapeHtml(titleCase(field))}<input name="${escapeHtml(field)}" /></label>`).join('');
  return `<article class="card"><h2>${escapeHtml(title)}</h2><p>Calls <code>${escapeHtml(action)}</code>.</p><form>${fieldMarkup}<button>${escapeHtml(title)}</button></form></article>`;
}

function renderProjectList(projects: Project[]): string {
  if (projects.length === 0) {
    return '<article class="card empty"><h2>No projects yet</h2><p>Create a project to begin repository, namespace, deployment, and domain provisioning.</p></article>';
  }

  const items = projects
    .map(
      (project) =>
        `<li><strong>${escapeHtml(project.name)}</strong><span>${escapeHtml(project.slug)}</span><mark>${escapeHtml(lifecycleLabels[normalizeLifecycleState(project.status)])}</mark></li>`,
    )
    .join('');

  return `<article class="card"><h2>Projects</h2><ul class="project-list">${items}</ul></article>`;
}

function renderCreateProject(): string {
  return '<article class="card"><h2>Create project</h2><p>Calls <code>POST /projects</code> and starts the lifecycle at <strong>Created</strong>.</p><form><label>Name<input name="name" /></label><label>Slug<input name="slug" /></label><button>Create project</button></form></article>';
}

function renderProjectOverview(model: ProjectDashboardModel): string {
  const project = model.selectedProject;
  if (!project) {
    return renderSelectProjectPrompt();
  }

  const lifecycle = model.lifecycle
    .map((step) => `<li data-state="${step.state}"${step.isCurrent ? ' aria-current="step"' : ''}><strong>${escapeHtml(step.label)}</strong><span>${escapeHtml(step.description)}</span></li>`)
    .join('');

  return `<article class="card"><h2>${escapeHtml(project.name)}</h2><p>${escapeHtml(project.platformHostname)}</p><ol class="lifecycle">${lifecycle}</ol></article>`;
}

function renderRepository(repository: RepositoryPanelModel | undefined): string {
  if (!repository) {
    return renderSelectProjectPrompt();
  }

  return `<article class="card"><h2>GitLab repository</h2><dl><dt>Path</dt><dd>${escapeHtml(repository.gitlabPath)}</dd><dt>Repository URL</dt><dd>${escapeHtml(repository.repositoryUrl ?? 'Not provisioned')}</dd><dt>Runner tag</dt><dd>${escapeHtml(repository.runnerTag)}</dd></dl><button data-method="${repository.provisionAction.method}" data-path="${escapeHtml(repository.provisionAction.path)}">${escapeHtml(repository.provisionAction.label)}</button></article>`;
}

function renderDeployment(deployment: DeploymentPanelModel | undefined): string {
  if (!deployment) {
    return renderSelectProjectPrompt();
  }

  const latest = deployment.latestDeployment
    ? `<p>Latest deployment <strong>${escapeHtml(deployment.latestDeployment.id)}</strong> is ${escapeHtml(deployment.latestDeployment.state)}.</p>`
    : '<p>No deployments have been started.</p>';

  return `<article class="card"><h2>Deployment status</h2><mark>${escapeHtml(deployment.state)}</mark>${latest}<button data-method="${deployment.deployAction.method}" data-path="${escapeHtml(deployment.deployAction.path)}">${escapeHtml(deployment.deployAction.label)}</button></article>`;
}

function renderDomains(domains: DomainPanelModel | undefined): string {
  if (!domains) {
    return renderSelectProjectPrompt();
  }

  const customDomains = domains.domains.length === 0
    ? '<li>No custom domains yet.</li>'
    : domains.domains
        .map(
          (domain) =>
            `<li><strong>${escapeHtml(domain.hostname)}</strong><span>${domain.verified ? 'Domain active' : 'Domain pending verification'}</span><code>${escapeHtml(domain.verificationRecord)}</code></li>`,
        )
        .join('');

  return `<article class="card"><h2>Domain management</h2><p>Platform hostname: <strong>${escapeHtml(domains.platformHostname)}</strong></p><p>Platform subdomain: ${domains.platformSubdomainAttached ? 'attached' : 'not attached'}</p><ul>${customDomains}</ul><button data-method="${domains.addDomainAction.method}" data-path="${escapeHtml(domains.addDomainAction.path)}">${escapeHtml(domains.addDomainAction.label)}</button></article>`;
}

function renderEnvironmentVariables(variables: EnvironmentVariable[]): string {
  const rows = variables.length === 0
    ? '<tr><td colspan="3">No environment variables configured.</td></tr>'
    : variables
        .map(
          (variable) =>
            `<tr><td><code>${escapeHtml(variable.key)}</code></td><td>${escapeHtml(variable.value)}</td><td>${variable.protected ? 'Protected' : 'Plain'}</td></tr>`,
        )
        .join('');

  return `<article class="card"><h2>Environment variables</h2><p>Values returned by the API are masked for safety.</p><table><tbody>${rows}</tbody></table></article>`;
}

function renderLogs(logs: BuildLogSummary[]): string {
  const blocks = logs.length === 0
    ? '<p>No builds have emitted logs yet.</p>'
    : logs
        .map((log) => `<section><h3>${escapeHtml(log.id)} · ${escapeHtml(log.state)}</h3><pre>${escapeHtml(log.lines.join('\n'))}</pre></section>`)
        .join('');

  return `<article class="card"><h2>Logs and build history</h2>${blocks}</article>`;
}

function renderAssistant(assistant: AssistantPanelModel | undefined): string {
  const panel = assistant ?? buildAssistantPanel(undefined, []);
  const messages = panel.messages.length === 0
    ? '<p>No messages yet. Describe the feature request or project change you want.</p>'
    : panel.messages.map((message) => `<p><strong>${escapeHtml(message.role)}</strong>: ${escapeHtml(message.content)}</p>`).join('');
  const quickRequests = panel.quickRequests.map((request) => `<button type="button">${escapeHtml(request)}</button>`).join('');

  return `<article class="card"><h2>AI assistant</h2>${messages}<div class="quick-requests">${quickRequests}</div><form><textarea name="prompt"></textarea><button data-method="POST" data-path="${escapeHtml(panel.submitAction?.path ?? '')}">Send feature request</button></form></article>`;
}

function renderSelectProjectPrompt(): string {
  return '<article class="card empty"><h2>Select a project</h2><p>Choose a project from the project list to view this page.</p></article>';
}

function readApiError(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const error = payload.error;
  if (isRecord(error) && typeof error.message === 'string') {
    return error.message;
  }

  return undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function titleCase(value: string): string {
  return value.replace(/(^|[-_\s])([a-z])/g, (_match: string, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
