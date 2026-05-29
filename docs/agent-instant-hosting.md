# Agent-first instant static hosting roadmap

## Feature epic: Agent-first instant static hosting

This epic adds a second publishing path optimized for AI agents and low-friction static sites. Today, divband's default production flow is project-centric: the backend provisions a GitLab repository and Kubernetes namespace, then GitLab CI builds and deploys into project-scoped runtime infrastructure. The instant hosting flow should instead accept already-built static files through an API, store immutable publish versions in object storage, and expose them immediately at slug-based URLs without requiring an initial GitLab repository, runner, container image, or Kubernetes rollout.

The new path should still reuse the divband control plane for slugs, ownership, audit events, billing lifecycle, domains, abuse enforcement, and eventual account claiming. It is not a replacement for the existing GitLab/Kubernetes deployment model; it is a complementary fast path for agents, static previews, prototypes, documentation, and simple single-page applications.

## Relationship to current platform docs

Implementers should read these existing documents before designing the API and data model:

- [`docs/architecture.md`](architecture.md) describes the current platform purpose, core services, request flow, provisioning flow, and isolation boundaries for GitLab-backed projects and Kubernetes namespaces.
- [`docs/deployments.md`](deployments.md) describes the current GitLab-driven deployment lifecycle, CI/CD template matrix, required variables, deployment status reporting, and rollback model.
- [`docs/security.md`](security.md) describes the identity model, project roles, API token requirements, project isolation controls, secret handling, custom-domain rules, and runner trust boundaries.

Key differences from the current path:

| Area | Current GitLab/Kubernetes path | Agent-first instant hosting path |
| --- | --- | --- |
| Source of deployable content | Git commits built by GitLab CI | Prebuilt static files uploaded directly through publish API URLs |
| Runtime unit | Project namespace, service, ingress route, and optional container image | Immutable object-storage version routed by slug |
| Initial identity | Authenticated user or organization project owner | Anonymous 24h publish by default, later claimable into an account |
| Rollout mechanism | CI updates Kubernetes workload/route and reports status | Finalize endpoint atomically promotes an uploaded version for a slug |
| Serving layer | Kubernetes ingress/Gateway API to project service | Edge/static serving layer reads slug-to-version routing metadata |
| Primary trust boundary | GitLab runner plus Kubernetes namespace and service account | Upload capability URLs, object storage permissions, scanner gates, slug ownership, and rate limits |

## Goals

- Let an agent publish a built static directory with only API calls and upload URLs.
- Make the anonymous first publish path fast, bounded, and safe through 24-hour expiry and abuse controls.
- Allow users to claim anonymous publishes into durable owned sites without republishing.
- Preserve divband's existing account, domain, billing, audit, and security concepts where they apply.
- Provide machine-readable distribution surfaces so coding agents can discover and use the hosting API.

## Non-goals

- Running arbitrary server-side code in the instant hosting path.
- Replacing GitLab-backed projects, CI/CD templates, Kubernetes namespaces, or container deployments.
- Providing unbounded anonymous hosting, custom domains, or permanent retention without an account.
- Exposing object storage buckets directly as the canonical public URL surface.

## Milestone 1: MVP publish API

Deliver the smallest complete anonymous static publish loop.

### Scope

- Add `POST /api/v1/publish` to create a pending publish session.
  - Request includes desired `slug`, file manifest, content types, byte sizes, checksums, and optional SPA fallback hint.
  - Response includes publish ID, normalized slug, expiry timestamp, upload constraints, presigned upload URLs, and finalize URL.
- Issue presigned upload URLs for each file in the manifest.
  - URLs are scoped to one object key, method, content length, checksum, and short expiration window.
  - Uploaded objects land in a non-public staging prefix until finalize succeeds.
- Add `POST /api/v1/publish/{slug}/finalize`.
  - Validates the pending publish session, upload completeness, checksums, total size, file count, and scanner status.
  - Creates an immutable version record.
  - Atomically points the slug's live route at the new version.
- Support anonymous 24h expiry.
  - Anonymous publish sessions and unclaimed live sites expire 24 hours after creation unless claimed.
  - Expiry removes routing metadata and schedules object deletion.
- Expose a slug-based live URL.
  - Example shape: `https://{slug}.divband.ir/` or another platform static-hosting subdomain selected by product/security.
  - Slug uniqueness and normalization must be enforced before upload URLs are issued.

### Acceptance criteria

- An unauthenticated agent can create a publish session, upload files through presigned URLs, finalize the publish, and fetch the live URL.
- Finalize is idempotent for the same completed publish session and fails safely for incomplete, expired, oversized, or checksum-mismatched uploads.
- Anonymous publishes are automatically unavailable after 24 hours unless claimed.
- The implementation does not create a GitLab repository, GitLab runner job, container image, Kubernetes namespace, or Kubernetes ingress for the MVP path.

## Milestone 2: Accounts and claim flow

Convert anonymous publishes into durable account-owned static sites.

### Scope

- Generate a claim token for anonymous publishes.
  - Token is returned once at publish creation/finalize and stored only as a hash.
  - Token allows a user to attach the anonymous publish to an account before expiry.
- Add owned permanent sites.
  - Claimed sites receive durable ownership, retention, audit events, and account/project linkage.
  - Claimed sites no longer follow the anonymous 24h expiry policy.
- Add API keys for agent workflows.
  - Keys should follow the storage, one-time display, expiration, revocation, and scoped authorization expectations from `docs/security.md`.
  - Keys can create and manage publishes for the owning user, organization, or site.
- Add list/update/delete publishes APIs.
  - List owned sites and versions.
  - Update mutable metadata such as display name, SPA fallback behavior, password-protection settings, or default version alias.
  - Delete a site or specific non-live versions subject to retention and abuse/audit rules.

### Acceptance criteria

- A user can claim an anonymous site using the claim token and keep the same live slug URL.
- Authenticated API keys can publish new versions to owned slugs without browser sessions.
- Owners can list, update, and delete their publishes through documented APIs.
- Authorization checks prevent a user or key from modifying unowned slugs and versions.

## Milestone 3: Edge/static serving

Build the serving plane for fast, immutable static content.

### Scope

- Use an object storage backend for versioned static assets.
  - Store files under immutable site/version prefixes.
  - Keep staging, live, deleted, and quarantine states separate.
- Implement slug-to-version routing.
  - Runtime lookup maps host/path slug to the active immutable version.
  - Finalize and rollback/version switch operations update metadata atomically.
- Add SPA fallback.
  - Configurable fallback to `/index.html` for client-routed applications when no exact object exists.
  - Preserve correct behavior for real 404s and static assets.
- Add directory listings/viewers.
  - Decide per-site defaults for directory index resolution, generated listings, or viewer pages.
  - Avoid exposing hidden files, source maps, or metadata unless explicitly allowed.

### Acceptance criteria

- Static assets are served from the edge/static layer without involving a project Kubernetes namespace.
- Existing live versions remain immutable and recoverable while a new version is uploaded or scanned.
- SPA fallback behavior is configurable and tested against nested routes and missing assets.
- Directory listing/viewer behavior is explicit, documented, and safe by default.

## Milestone 4: Distribution

Make the hosting capability discoverable and easy for agents to install.

### Scope

- Publish OpenAPI docs for all instant hosting endpoints.
  - Include anonymous publish, finalize, claim, API key, list, update, delete, version, and error schemas.
- Add `/.well-known/agent.json`.
  - Advertise service metadata, supported auth modes, API base URL, OpenAPI URL, limits URL, terms URL, and contact/security links.
- Add `/llms.txt`.
  - Provide concise, model-readable usage guidance, endpoint summaries, rate-limit notes, and links to canonical docs.
- Build an installable agent skill.
  - Package instructions and helper scripts for agents to publish a local static directory.
  - Include safety checks for build output path, file count, total size, and ignored secrets.
- Provide an MCP server.
  - Tools should cover creating publish sessions, uploading manifests or files, finalizing, claiming, listing, and deleting publishes.

### Acceptance criteria

- A coding agent can discover the service, read machine-oriented docs, install the skill, and publish a static directory without using the dashboard.
- OpenAPI and agent metadata are versioned with the API and deployed at stable URLs.
- MCP tools enforce the same auth, limits, and validation as direct REST calls.

## Milestone 5: Monetization and abuse controls

Add business model controls and production abuse defenses.

### Scope

- Define free/paid tiers.
  - Limits may include anonymous retention, owned-site count, storage, bandwidth, file count, maximum object size, version history, and API rate.
- Support custom domains for eligible tiers.
  - Reuse the domain ownership, uniqueness, TLS issuance, renewal, and revocation principles from `docs/security.md`.
  - Route custom domains to slug/version metadata rather than Kubernetes services.
- Add password protection.
  - Allow simple site-level access gates for previews or private static sites.
  - Ensure password state is stored securely and does not leak through static assets or logs.
- Add analytics.
  - Track privacy-conscious request counts, bandwidth, referrers, status codes, countries/regions, and cache hit rates.
  - Attribute usage to anonymous publish ID, claimed site ID, account, and billing tier where available.
- Add rate limiting.
  - Limit anonymous publish creation, upload URL generation, finalize attempts, bandwidth, and API key usage.
  - Consider IP, account, slug, token, and behavioral dimensions.
- Add phishing/malware scanning.
  - Scan uploaded content before promotion to live routing.
  - Quarantine suspicious publishes, block finalize or disable live routes, and record audit/abuse events.

### Acceptance criteria

- Tier limits are enforced before costly operations and surfaced through API errors and documentation.
- Custom domains for static sites do not conflict with the existing project-domain model.
- Abuse scanning can prevent a malicious upload from becoming live and can disable a live site after detection.
- Rate limits protect anonymous and authenticated surfaces without blocking normal agent workflows.

## Open design questions

- Should instant static sites share the existing project model or use a lighter `site`/`publish` model that can later attach to a project?
- What platform hostname should static sites use if they need isolation from GitLab/Kubernetes-hosted project subdomains?
- Which object storage provider and CDN/edge runtime should be the first production target?
- Should anonymous slugs be user-chosen, random by default, or random until claimed?
- How should rollback/version promotion be exposed for claimed sites: as publish finalize, explicit version activation, or both?
- Which scanner verdicts block finalize synchronously versus disable routes asynchronously?
