# divband frontend

The frontend dashboard module provides a dependency-light dashboard model, API client, and HTML renderer for the initial product surface.

Implemented pages:

- Sign in and sign up.
- Project list and creation.
- Project overview and lifecycle status.
- GitLab repository and CI runner status.
- Deployment status.
- Domain management and DNS verification instructions.
- Environment variables.
- Logs and build history.
- AI assistant chat for feature requests and project changes.

The dashboard calls the backend API through `DashboardApiClient` and presents clear lifecycle states:

- Created.
- Repository provisioned.
- Namespace provisioned.
- Building.
- Deployed.
- Domain pending verification.
- Domain active.
- Failed.
