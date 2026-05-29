# Ansible infrastructure bootstrap

`infra/ansible` is the VM bootstrap layer for a divband platform environment. It prepares base hosts, installs a container runtime, bootstraps a Kubernetes cluster, installs platform add-ons, connects GitLab, registers runners, and deploys the divband backend/frontend control plane.

## Layout

- `ansible.cfg` — local defaults that point Ansible at `inventory.yml` and `roles/`.
- `inventory.example.yml` — copyable inventory with the expected host groups: `control_plane`, `workers`, `gitlab`, `runners`, `load_balancers`, and `monitoring`.
- `playbooks/site.yml` — main entry point for a full environment bootstrap.
- `roles/common` — admin users, SSH hardening, firewall rules, base packages, and time sync.
- `roles/container_runtime` — installs `containerd` by default or Docker when `container_runtime_engine: docker` is set.
- `roles/kubernetes` — installs k3s control-plane and worker nodes. The role is intentionally isolated so it can be extended for kubeadm later.
- `roles/ingress` — installs the nginx ingress controller.
- `roles/cert_manager` — installs cert-manager and applies an ACME `ClusterIssuer`.
- `roles/external_secrets` — installs External Secrets Operator and configures a `ClusterSecretStore`.
- `roles/gitlab` — connects to an existing GitLab endpoint, optionally installs GitLab, and can run the Terraform stack under `../gitlab/terraform`.
- `roles/gitlab_runner` — registers runners with the authentication tokens produced by GitLab provisioning.
- `roles/divband_app` — deploys the backend/frontend control plane and points the backend at the Kubernetes template renderer.

## Integration points

This Ansible layer intentionally reuses existing repository paths instead of duplicating platform definitions:

- Kubernetes tenant templates are read from `infra/k8s/base/` and can be applied with `divband_apply_base_templates: true` after replacing placeholders or adapting the kustomization flow.
- GitLab tenant/project provisioning is delegated to the Terraform stack in `infra/gitlab/terraform/` when `gitlab_run_terraform: true` is set.
- The backend service uses `apps/backend/src/services/kubernetes.ts`, which defaults `KUBERNETES_TEMPLATE_DIR` to `infra/k8s/base` and can apply rendered manifests when `KUBERNETES_APPLY=true`.

## 1. Copy the example inventory

From the repository root:

```sh
cp infra/ansible/inventory.example.yml infra/ansible/inventory.yml
```

Keep `inventory.yml` out of source control if it contains real IP addresses, hostnames, or secrets.

## 2. Add VM IP addresses

Edit `infra/ansible/inventory.yml` and replace each documentation address with the real VM IP or DNS name:

```yaml
control_plane:
  hosts:
    cp-1:
      ansible_host: 10.0.10.11
workers:
  hosts:
    worker-1:
      ansible_host: 10.0.10.21
gitlab:
  hosts:
    gitlab-1:
      ansible_host: 10.0.20.11
runners:
  hosts:
    runner-1:
      ansible_host: 10.0.30.11
load_balancers:
  hosts:
    lb-1:
      ansible_host: 10.0.40.11
monitoring:
  hosts:
    monitoring-1:
      ansible_host: 10.0.50.11
```

Use the groups consistently:

- `control_plane` hosts run the Kubernetes API and cluster add-ons.
- `workers` hosts join the Kubernetes cluster as application nodes.
- `gitlab` hosts either run GitLab or represent the existing GitLab endpoint that Terraform configures.
- `runners` hosts run GitLab Runner and need the runner authentication token from provisioning.
- `load_balancers` and `monitoring` are prepared by `common` now and reserved for follow-up roles.

## 3. Configure required variables and secrets

Set non-secret variables in `inventory.yml`, `group_vars/all.yml`, or environment-specific group vars. Put secrets in Ansible Vault, your CI secret store, or your operator password manager.

Required or commonly customized variables:

| Variable | Purpose |
| --- | --- |
| `ansible_user` / `ansible_ssh_private_key_file` | SSH account and key used to reach the VMs. |
| `divband_admin_users` | Operator accounts and SSH public keys to create on every host. |
| `divband_domain`, `divband_public_hostname` | Platform DNS names for the control plane and tenant routes. |
| `container_runtime_engine` | `containerd` by default; set to `docker` only when needed. |
| `kubernetes_distribution` | `k3s` in this scaffold. |
| `kubernetes_api_endpoint` | API endpoint workers use to join the cluster, usually the first control-plane IP or a load balancer. |
| `cert_manager_acme_email`, `cert_manager_acme_server`, `cert_manager_cluster_issuer` | ACME account and issuer settings. |
| `external_secrets_store_name` and provider settings | Must match the `REPLACE_WITH_CLUSTER_SECRET_STORE` value expected by `infra/k8s/base/external-secret.yaml`. |
| `gitlab_url`, `gitlab_terraform_dir`, `gitlab_run_terraform` | GitLab endpoint and optional Terraform automation settings. |
| `gitlab_runner_token` | Runner authentication token created by GitLab provisioning. Use Vault or set `gitlab_runner_project_key` to read `runner_authentication_tokens` from Terraform outputs. |
| `gitlab_runner_project_key` | Optional key in the GitLab Terraform `runner_authentication_tokens` output for this runner. |
| `divband_backend_image`, `divband_frontend_image` | Images for the backend/frontend control-plane deployment. |

Recommended Vault file example:

```yaml
vault_kubernetes_join_token: "replace-only-when-preseeding-workers"
vault_gitlab_root_password: "replace-if-installing-gitlab"
vault_gitlab_runner_token: "glrt-replace-with-runner-auth-token"
```

Create and edit a Vault file:

```sh
ansible-vault create infra/ansible/group_vars/all/vault.yml
```

## 4. Install Ansible dependencies

The roles use `ansible.posix` and `community.general` modules for authorized keys, timezone, and firewall management:

```sh
ansible-galaxy collection install -r infra/ansible/requirements.yml
```

## 5. Bootstrap the environment

Run the full site playbook from `infra/ansible`:

```sh
cd infra/ansible
ansible-playbook -i inventory.yml playbooks/site.yml --ask-vault-pass
```

Useful targeted runs:

```sh
ansible-playbook -i inventory.yml playbooks/site.yml --limit control_plane --ask-vault-pass
ansible-playbook -i inventory.yml playbooks/site.yml --limit runners --ask-vault-pass
```

## Expected post-install checks

Run these checks after the playbook completes:

```sh
kubectl --kubeconfig /etc/rancher/k3s/k3s.yaml get nodes -o wide
kubectl --kubeconfig /etc/rancher/k3s/k3s.yaml get pods -A
kubectl --kubeconfig /etc/rancher/k3s/k3s.yaml get clusterissuer
kubectl --kubeconfig /etc/rancher/k3s/k3s.yaml get clustersecretstore
kubectl --kubeconfig /etc/rancher/k3s/k3s.yaml -n divband-system get deploy,svc,ingress
gitlab-runner verify
terraform -chdir=infra/gitlab/terraform output
```

Expected results:

- Every control-plane and worker node is `Ready`.
- `ingress-nginx`, `cert-manager`, and `external-secrets` pods are running.
- The configured `ClusterIssuer` is `Ready=True`.
- The `ClusterSecretStore` can authenticate to the external secret backend.
- `divband-backend` and `divband-frontend` deployments are available in `divband-system`.
- GitLab runners appear online in GitLab and have the expected `divband` tags.
- The backend can render tenant manifests using `infra/k8s/base/` through `KUBERNETES_TEMPLATE_DIR`.
