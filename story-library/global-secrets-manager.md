# Story Template: Configure Secrets Manager

**Story Type:** Global Infrastructure / Security
**When to include:** Always for `regulated` and `government` profiles (mandatory). Recommended for `internal` and `partner` — scaffold generates a commented-out template block; architect opts in by setting `decisions.json security.secretsManager = true`.
**Priority:** P0 for regulated|government. P1 (recommended) for internal|partner.
**Standard:** `standards/MULESOFT_DESIGN_STANDARDS.md → Security Tiers`
**Scaffold Files:** `src/main/mule/global-config.xml`, `src/main/resources/properties/*.yaml`

---

## User Story

As a developer, I need all credentials stored in a central Secrets Manager and referenced via property placeholders, so that no password, token, or API key ever appears in source code or properties files committed to git.

---

## Acceptance Criteria

### Properties Provider Configuration
- [ ] Secrets Manager properties provider configured in `global-config.xml`
  - AWS Secrets Manager: use `aws-secrets-manager-properties-provider` (if deployment=cloudhub2 on AWS)
  - Azure Key Vault: use `azure-key-vault-properties-provider` (if Azure infrastructure)
  - Anypoint Secrets Manager: use `cloudhub2-properties-provider` (CloudHub 2.0 native option)
- [ ] Provider configured per environment — dev and prod use separate namespaces/paths
- [ ] Provider credentials themselves injected from CI/CD secrets store (not in code)

### Properties File Rules
- [ ] `properties/local.yaml`, `dev.yaml`, `uat.yaml`, `prod.yaml` all exist
- [ ] Properties files contain ONLY non-secret config values: URLs, timeouts, queue names, cron expressions, environment flags
- [ ] Zero occurrences of password, token, secret, apiKey, clientSecret, authToken in any `.yaml` file
- [ ] All secret references use `${secrets.{key}}` placeholder pattern (never `${config.{key}}` for credentials)
- [ ] `.gitignore` excludes: `.env`, `local-secrets.yaml`, `*credentials*`, `*secrets*.yaml`

### Secret Key Inventory Completed
- [ ] All connector credentials registered in Secrets Manager per environment (see table below)
- [ ] Secret keys follow naming convention: `{connector}.{property}` (e.g., `salesforce.clientSecret`, `netsuite.privateKey`)
- [ ] Secret rotation policy defined for prod (minimum: rotate on personnel change; recommended: 90 days)

### Validation
- [ ] Application starts successfully in dev with secrets provider configured
- [ ] `git log --diff-filter=A -- '*.yaml' '*.properties'` shows no secrets in git history
- [ ] Code review checklist item: reviewer scans for hardcoded credentials before approval

---

## Secrets Inventory
*(PM agent populates from decisions.json systems.connectors and security.level)*

| Secret Key | System / Connector | Type | Required Environments |
|-----------|-------------------|------|----------------------|
| `{connector}.clientId` | {system} | OAuth Client ID | dev, uat, prod |
| `{connector}.clientSecret` | {system} | OAuth Client Secret | dev, uat, prod |
| `{connector}.privateKey` | {system} | Private Key (JWT) | dev, uat, prod |

---

## Security Tier Notes

| Security Level | Additional Secrets Requirements |
|---------------|--------------------------------|
| `internal` | Client ID + secret for API manager policies |
| `partner` | OAuth2 client credentials per partner; store with partner prefix |
| `regulated` | All above + JWT signing key + encryption keys for PII fields |
| `government` | All above + mTLS certificate + private key (store as binary secret) |

---

## Implementation Notes

- Reference: `standards/MULESOFT_DESIGN_STANDARDS.md → Security Tiers`
- CloudHub 2.0 injects secrets as environment variables at runtime — the properties provider reads them
- For `regulated` and `government` profiles: field encryption keys MUST be in Secrets Manager (not properties files, not Object Store)
- Never commit a working `local.yaml` with real credentials; use placeholder values or local Secrets Manager emulator
