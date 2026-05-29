# VM reference architecture

This reference architecture describes small, persistent virtual-machine deployments for Divband. It is intended for operators who want durable hosts, explicit network identities, and Ansible-driven bootstrap before moving to larger managed-cloud patterns.

The design assumes the repository remains the source of truth for platform services and automation:

- Dashboard and API services live in `apps/frontend` and `apps/backend`.
- Tenant Kubernetes manifests and runtime templates live in `infra/k8s/base`.
- GitLab project, CI/CD, and runner automation lives in `infra/gitlab/terraform`.
- Operational contracts, labels, metrics, alerts, and runbooks are defined in `docs/operations.md`.

## Minimum topology

Use the minimum topology for development, internal demos, or a small persistent environment where host count matters more than high availability.

| Host group | Minimum count | Purpose | Notes |
| --- | ---: | --- | --- |
| Divband control VM | 1 | Runs the Divband backend and frontend control-plane services. | Can also run GitLab for development-only deployments when resources are constrained. Keep persistent disks and backups because this VM owns the operator-facing platform state. |
| Kubernetes control-plane VM | 1 | Runs the Kubernetes API server and cluster control-plane components. | A single node is not highly available. Use it for development, staging, or low-risk deployments only. |
| Kubernetes worker VMs | 1+ | Run tenant workloads, ingress components, platform add-ons, and optionally Divband services if they are deployed into the cluster. | Use at least two workers when possible so node maintenance does not stop all tenant workloads. |
| Separate GitLab VM | Optional | Runs self-managed GitLab outside the Divband control VM. | Recommended once GitLab CPU, memory, disk I/O, or backup cadence diverges from the dashboard/API VM. |
| Runner VM | Optional | Runs one or more GitLab runners. | Use a separate runner host when CI jobs need isolation from GitLab and control-plane services. |

A practical minimum layout is therefore three VMs: one Divband control VM, one Kubernetes control-plane VM, and one Kubernetes worker VM. A more comfortable small layout is five VMs: Divband control, Kubernetes control-plane, two workers, and either a GitLab or runner host.

## Production-oriented topology

Use the production-oriented topology when the environment hosts customer traffic, needs rolling maintenance, or needs failure tolerance across individual VMs.

| Host group | Recommended count | Purpose | Production guidance |
| --- | ---: | --- | --- |
| Kubernetes control-plane nodes | 3 | Provide a highly available Kubernetes API and control plane. | Place nodes on separate hypervisors, racks, or availability zones when possible. Put a stable API endpoint in front of them. |
| Kubernetes worker nodes | 2+ | Run tenant workloads and shared cluster add-ons. | Scale horizontally by tenant capacity, ingress throughput, and rollout concurrency. Keep platform and tenant resource requests visible in quota reports. |
| Divband control services | 2+ replicas on Kubernetes or dedicated VMs | Run the dashboard and API. | Prefer running the services as Kubernetes deployments behind the external load balancer. Use dedicated VMs only when cluster independence is an explicit operational requirement. |
| GitLab | Separate self-managed instance or managed GitLab | Hosts project repositories, CI/CD metadata, tokens, and merge requests. | Keep GitLab outside the Divband control VM. Use managed GitLab when available to reduce backup and upgrade burden. |
| Runner pool | Separate runner VMs or Kubernetes runner executors | Builds and deploys projects. | Use dedicated runner pools with project-specific tags, protected variables, and no untagged execution for deployment jobs. |
| Database, object storage, and secret store | Separate managed services or dedicated hosts where applicable | Store application state, static assets, artifacts, backups, and secrets. | Use managed PostgreSQL, S3-compatible object storage, and Vault or a cloud secret manager when possible. Avoid co-locating these durable dependencies with ephemeral runners. |
| External load balancer | 1 highly available endpoint | Routes public traffic to ingress and exposes stable platform endpoints. | Terminate or pass through TLS according to the ingress design. Use it for the Kubernetes API endpoint when running multiple control-plane nodes. |

Production deployments should keep tenant workloads, CI execution, source control, persistent data, and platform control services in separately maintainable failure domains. Shared services can still be automated from this repository, but the durable data plane should have its own backups, rotation policies, and monitoring.

## Host groups and Ansible inventory mapping

The existing Ansible inventory groups map directly to the VM host groups used by both topologies.

| VM host group | Ansible inventory group | Used by | Description |
| --- | --- | --- | --- |
| All VMs | `all` | `infra/ansible/playbooks/site.yml` common preparation | Shared SSH, users, timezone, firewall, and global variables. |
| Divband control services | `k8s_control_plane` for in-cluster deployment, or a dedicated host group if services are kept outside Kubernetes | `divband_app` role runs from `k8s_control_plane[0]` in the current site playbook | The current Ansible flow installs Divband into Kubernetes from the first control-plane node. If operators run backend/frontend directly on a VM, keep those hosts documented separately and reuse the same image, hostname, and secret variables. |
| Kubernetes control-plane VMs | `k8s_control_plane` | `kubernetes` role with `kubernetes_node_role: control_plane` | Kubernetes API and control-plane bootstrap nodes. The first host is also used for cluster add-on installation. |
| Kubernetes worker VMs | `k8s_workers` | `kubernetes` role with `kubernetes_node_role: worker` | Tenant workload and shared add-on nodes. |
| GitLab VM or GitLab connector host | `gitlab` | `gitlab` role | Installs self-managed GitLab with `gitlab_mode: install` or connects automation to an existing GitLab with `gitlab_mode: connect`. |
| Runner VMs | `runners` | `gitlab_runner` role | Registers GitLab runners and applies runner-specific project keys, tokens, executor settings, and tags. |
| External load balancers | `load_balancers` | Operator-managed or future role | Stable public entry point for ingress and, in production, the Kubernetes API endpoint. |
| Monitoring or operations VMs | `monitoring` | Operator-managed or future role | Optional home for monitoring, log storage, alert routing, or bastion-style operational tools. |

The current `site.yml` playbook prepares all hosts, bootstraps the Kubernetes control plane, joins workers, installs ingress/cert-manager/External Secrets/observability/Divband from the first control-plane node, then provisions GitLab and registers runners.

## Platform service path mapping

| Platform concern | Repository path | How it fits the VM architecture |
| --- | --- | --- |
| Dashboard frontend | `apps/frontend` | Built into the dashboard image and exposed as the operator/user web UI on the Divband control endpoint. |
| Backend API and orchestration | `apps/backend` | Owns project lifecycle, GitLab repository automation, Kubernetes namespace rendering/apply behavior, domain verification, deployment status, secrets metadata, and audit events. |
| Tenant Kubernetes manifests | `infra/k8s/base` | Provides base namespace, RBAC, quota, network policy, workload, service, ingress, certificate, and External Secret templates applied to the Kubernetes cluster. |
| GitLab automation | `infra/gitlab/terraform` | Creates or updates GitLab projects, variables, tokens, branch protections, and runner token outputs used by the Ansible runner role. |
| Operations contract | `docs/operations.md` | Defines labels, log and metric expectations, operational limits, alert classes, and the MVP provisioning runbook that operators should validate after VM bootstrap. |

## Example inventory

The following inventory uses documentation-only IP addresses from `192.0.2.0/24`. Replace hostnames, addresses, SSH user, secret references, image tags, and domain names before running Ansible.

```yaml
---
all:
  vars:
    ansible_user: ubuntu
    ansible_ssh_private_key_file: ~/.ssh/divband-platform.pem
    ansible_python_interpreter: /usr/bin/python3

    divband_domain: divband.example
    divband_environment: production
    divband_timezone: UTC

    container_runtime_engine: containerd
    kubernetes_distribution: k3s
    kubernetes_api_endpoint: "https://192.0.2.50:6443"
    kubernetes_pod_cidr: 10.42.0.0/16
    kubernetes_service_cidr: 10.43.0.0/16
    kubernetes_template_dir: "{{ playbook_dir }}/../../k8s/base"

    ingress_class_name: nginx
    cert_manager_cluster_issuer: letsencrypt-prod
    cert_manager_acme_email: ops@divband.example
    cert_manager_acme_server: https://acme-v02.api.letsencrypt.org/directory

    external_secrets_store_name: divband-tenant-secrets
    external_secrets_provider: vault
    external_secrets_vault_server: https://vault.divband.example
    external_secrets_vault_path: secret

    gitlab_mode: connect
    gitlab_url: https://gitlab.example
    gitlab_external_url: "{{ gitlab_url }}"
    gitlab_terraform_dir: "{{ playbook_dir }}/../../gitlab/terraform"
    gitlab_runner_executor: docker

    divband_namespace: divband-system
    divband_backend_image: registry.gitlab.com/example/divband/backend:v1.0.0
    divband_frontend_image: registry.gitlab.com/example/divband/frontend:v1.0.0
    divband_public_hostname: app.divband.example

  children:
    k8s_control_plane:
      hosts:
        k8s-cp-1:
          ansible_host: 192.0.2.11
          node_labels:
            divband.io/node-pool: control-plane
        k8s-cp-2:
          ansible_host: 192.0.2.12
          node_labels:
            divband.io/node-pool: control-plane
        k8s-cp-3:
          ansible_host: 192.0.2.13
          node_labels:
            divband.io/node-pool: control-plane

    k8s_workers:
      hosts:
        k8s-worker-1:
          ansible_host: 192.0.2.21
          node_labels:
            divband.io/node-pool: tenant
            topology.kubernetes.io/zone: zone-a
        k8s-worker-2:
          ansible_host: 192.0.2.22
          node_labels:
            divband.io/node-pool: tenant
            topology.kubernetes.io/zone: zone-b

    gitlab:
      hosts:
        gitlab-1:
          ansible_host: 192.0.2.31
          gitlab_mode: install
          gitlab_external_url: https://gitlab.example

    runners:
      hosts:
        runner-tenant-a:
          ansible_host: 192.0.2.41
          gitlab_runner_project_key: tenant-a/web
          gitlab_runner_tags:
            - divband-tenant-a-web
            - docker
        runner-tenant-b:
          ansible_host: 192.0.2.42
          gitlab_runner_project_key: tenant-b/api
          gitlab_runner_tags:
            - divband-tenant-b-api
            - docker

    load_balancers:
      hosts:
        lb-1:
          ansible_host: 192.0.2.50
          public_vip: 198.51.100.10
          forwards:
            kubernetes_api: 6443
            http: 80
            https: 443

    monitoring:
      hosts:
        monitoring-1:
          ansible_host: 192.0.2.61
          retention_days: 30
```

For a minimum non-production inventory, keep only one `k8s_control_plane` host, one `k8s_workers` host, and either omit the `gitlab` and `runners` groups or point `gitlab_mode: connect` at an existing GitLab instance. For production, keep three control-plane hosts, two or more workers, a separate GitLab or managed GitLab endpoint, a separate runner pool, and an external load balancer endpoint.
