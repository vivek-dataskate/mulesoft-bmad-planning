# Story Template: Set Up CI/CD Pipeline

**Story Type:** Global DevOps
**When to include:** Always — every project, generated once
**Priority:** P1
**Standard:** `standards/MULESOFT_DESIGN_STANDARDS.md → Runtime / DevOps`
**Scaffold File:** `.github/workflows/deploy.yml` (GitHub Actions) | `azure-pipelines.yml` (Azure DevOps) | `Jenkinsfile` (Jenkins)
**Condition on file:** Generated when `decisions.json devops.cicd != "none"`

---

## User Story

As a developer, I need an automated pipeline that runs MUnit tests on every PR and deploys to CloudHub 2.0 on merge to main, so that the coverage gate is enforced automatically and no broken build reaches production.

---

## Acceptance Criteria

### Pipeline File
- [ ] Pipeline file exists at the correct path per `decisions.json devops.cicd`:
  - `github-actions` → `.github/workflows/deploy.yml`
  - `azure-devops` → `azure-pipelines.yml`
  - `jenkins` → `Jenkinsfile`
- [ ] Pipeline file is syntactically valid and passes linting

### Build Requirements
- [ ] Build uses **Java 17** (not Java 11 — support ends Aug 2026 for 4.6 LTS)
- [ ] Build uses **mule-maven-plugin** — not a generic Maven build or raw `mvn test`
- [ ] Mule runtime version matches `decisions.json scaffold.runtime` (default: 4.8.0)

### Trigger Rules
- [ ] PR to main/master: run tests only — NO deployment
- [ ] Push / merge to main: run tests → deploy to dev → (optionally UAT)
- [ ] Manual trigger available for prod deployment with explicit approval gate

### MUnit Coverage Gate (hard block — not a warning)
- [ ] MUnit tests run on every PR build
- [ ] Coverage gate enforced per integration pattern — pipeline FAILS below floor:
  - `request-reply` (A), `api-aggregation` (I): **80%** minimum
  - `event-driven` (B), `pubsub-fanout` (M): **75%** minimum
  - `batch` (C), `data-migration` (K): **75%** minimum
  - `outbound-notification` (N): **60%** minimum
  - All other patterns (D, E, F, G, H, J, L, O, P, Q, R): **80%** minimum
- [ ] Deploy step is skipped / blocked if any MUnit test fails
- [ ] Coverage report artifact uploaded for review on each run

### Deployment
- [ ] Deploy targets **CloudHub 2.0** (not CloudHub 1.0 — deprecated)
- [ ] Region: `{decisions.json devops.region}` (default: `us-east-1`)
- [ ] Environments: `{decisions.json devops.environments}` (minimum: dev + prod)
- [ ] Prod deployment requires **manual approval gate** before proceeding
- [ ] Connected App credentials for CloudHub 2.0 deploy injected from CI/CD secrets store

### Secrets Handling in Pipeline
- [ ] Zero hardcoded credentials in pipeline file
- [ ] All credentials injected from:
  - GitHub Actions: GitHub Secrets (`${{ secrets.MULESOFT_CONNECTED_APP_ID }}`)
  - Azure DevOps: Azure Key Vault linked variable group
  - Jenkins: Jenkins Credentials plugin
- [ ] CI/CD secrets are separate from application Secrets Manager (pipeline needs deploy creds, app needs runtime creds)

### Exchange Publishing (if `decisions.json devops.exchangePublish=true`)
- [ ] API spec published to Anypoint Exchange on successful build of main branch
- [ ] Exchange asset version matches `pom.xml` version
- [ ] Exchange publish step runs AFTER tests pass, BEFORE deploy

---

## Pipeline Flow Diagram

```
PR opened
  └─ run MUnit tests
       ├─ FAIL → block merge (coverage gate)
       └─ PASS → allow merge

Push to main
  └─ run MUnit tests
       ├─ FAIL → stop pipeline, notify dev
       └─ PASS → deploy to dev
                   └─ [optional] deploy to uat
                         └─ manual approval
                               └─ deploy to prod
```

---

## Implementation Notes

- Reference: `standards/MULESOFT_DESIGN_STANDARDS.md → Runtime` (Mule 4.8.0 / Java 17)
- Scaffold generates the pipeline file skeleton — developer fills in org ID, environment names, and runtime version
- `mule-maven-plugin` configuration is in `pom.xml` — pipeline calls `mvn clean deploy`
- For GitHub Actions: use `actions/setup-java@v4` with `java-version: '17'`
