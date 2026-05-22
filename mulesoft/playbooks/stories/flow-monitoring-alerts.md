# Story Template: Configure Monitoring Alerts (Per Flow)

**Story Type:** Per-Flow — Observability
**Generated:** Once per entry in `decisions.json flows[]`
**Priority:** P1
**Standard:** `standards/DESIGN_STANDARDS.md → Monitoring Alerts (production mandatory)`
**Platform:** Anypoint Monitoring

---

## User Story

As an ops engineer, I need Anypoint Monitoring alerts configured for `{flow-name}` in production, so that on-call is paged for DLQ depth, error rate spikes, and latency degradation before they become incidents.

---

## Acceptance Criteria

### Production-Mandatory Alerts (all required — no exceptions)

- [ ] **DLQ depth > 0** → **HIGH** → page on-call immediately
  - Alert fires as soon as DLQ depth transitions from 0 to 1
  - No grace period — even one DLQ message is a P1 investigation
- [ ] **Error rate > 5%** in any **5-minute window** → **HIGH** → page on-call
- [ ] **p95 latency > 3 seconds** → **MEDIUM** → alert Ops team
- [ ] **Memory > 80%** → **MEDIUM** → alert Ops team
- [ ] **Auth refresh failure** → **HIGH** → page on-call
  - Triggered when any OAuth2 / JWT token refresh fails after 1 retry

### Async Flow Alerts (include if flow has MQ trigger)
- [ ] **MQ queue depth > 80%** of configured max → **MEDIUM** → alert Ops team (consumer may be slow)
- [ ] **MQ queue depth > 90%** → **HIGH** → page on-call (consumer is falling behind)
- [ ] **MQ queue depth = 100%** (tail drop active) → **CRITICAL** → page on-call immediately (messages are being dropped)
- [ ] DLQ depth > 0 is already covered in production-mandatory above

### Sync Flow Alerts (include if flow has HTTP listener trigger, pattern A or I)
- [ ] **p99 latency > 10 seconds** (if `nfr.latency = under-10s`) → **HIGH**
- [ ] **HTTP 503 rate > 1%** in 5-minute window → **HIGH** (upstream timeout / retry exhaustion)

### Custom Dashboard (if `decisions.json observability.customDashboard = true`)
- [ ] Custom Anypoint Monitoring dashboard created with panels:
  - Message throughput (messages/min) for this flow
  - Error rate (%) over time
  - p50 / p95 / p99 latency
  - DLQ depth (if async)
  - MQ queue depth (if async)
- [ ] Dashboard shared with ops team and tech lead

### Business Events (if `decisions.json observability.businessEvents = true`)
- [ ] Business event tracking configured for key milestones in this flow:
  - Flow entry (message received)
  - Successful processing (downstream confirmed)
  - Error path (DLQ or invalid-messages)
- [ ] Business events visible in Anypoint Monitoring → Business Events view
- [ ] KPI metrics reported: throughput/day, error %, avg processing time

### External Platform (if `decisions.json observability.externalPlatform` is set)
- [ ] Anypoint Monitoring data forwarded to: `{observability.externalPlatform}` (Splunk / Datadog / Azure Monitor)
- [ ] Alert rules created in external platform (not duplicated in Anypoint — one alert source per metric)
- [ ] Log forwarding configured: JSON logs → external platform index

### Notification Channels
- [ ] Alert channels configured per `decisions.json notifications.*`:
  - `notifications.email = true` → email to `{notifications.emailRecipients}`
  - `notifications.slack = true` → `{notifications.slackWebhook}` webhook
  - `notifications.teams = true` → Teams webhook URL in Secrets Manager
  - PagerDuty (if HIGH/CRITICAL severity): PagerDuty integration key in Secrets Manager
- [ ] Alerts reviewed with client ops team before UAT sign-off

---

## Alert Configuration Summary
*(PM agent populates from decisions.json observability and notifications blocks)*

| Metric | Threshold | Severity | Channel | Flow Scope |
|--------|-----------|----------|---------|-----------|
| DLQ depth | > 0 | HIGH | {channel} | `{queue-name}-dlq` |
| Error rate | > 5% / 5min | HIGH | {channel} | `{flow-name}` |
| p95 latency | > 3s | MEDIUM | {channel} | `{flow-name}` |
| Memory | > 80% | MEDIUM | {channel} | All flows |
| Auth refresh | failure | HIGH | {channel} | `{flow-name}` |
| MQ queue depth | > 80% | MEDIUM | {channel} | `{queue-name}` |
| MQ queue depth | > 90% | HIGH | {channel} | `{queue-name}` |
| MQ queue depth | = 100% | CRITICAL | {channel} | `{queue-name}` |

---

## Implementation Notes

- Reference: `standards/DESIGN_STANDARDS.md → Monitoring Alerts`
- Anypoint Monitoring alerts configured in Anypoint Platform console — not in code
- For CloudHub 2.0: Anypoint Monitoring is available; custom dashboards require Gold/Titanium subscription
- Alert thresholds should be reviewed with client before UAT — they may have tighter SLAs than our defaults
- Per-flow alert and per-application alert are different: configure both if needed
