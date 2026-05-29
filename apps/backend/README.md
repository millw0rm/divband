# divband backend

The backend API is responsible for user authentication and project lifecycle orchestration.

Initial modules:

- `src/backend-service.ts` provides a dependency-light request handler for the initial API surface.
- `src/project-lifecycle.ts` defines project states and orchestration steps.
- `src/services/gitlab.ts` contains the GitLab repository integration boundary.
- `src/services/kubernetes.ts` contains the Kubernetes namespace integration boundary.
- `src/services/dns-verification.ts` creates and verifies custom-domain DNS challenges.
- `src/services/certificate-status.ts` tracks custom-domain certificate state.
- `src/services/deployment-status.ts` tracks build/deploy state and logs.
- `src/services/audit-log.ts` records user and project audit events.

The OpenAPI contract is maintained in `openapi.yaml`.
