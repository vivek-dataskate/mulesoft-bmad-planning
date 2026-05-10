# Scenario: Hybrid Integration

> **Pattern:** `hybrid`  
> **Trigger:** Mixed (HTTP + Scheduler + MQ in the same project)  
> **Latency target:** Varies per flow — document each separately  
> **Volume:** Varies per flow

---

## When to Use This Pattern

- A single project requires both real-time API calls and scheduled batch/sync jobs
- An event-driven flow triggers a batch process (event → bulk export)
- A synchronous read endpoint exists alongside an async write pipeline
- Phase 1 is scheduled-sync, Phase 2 adds real-time reads

**Hybrid is not a shortcut.** Use it only when the business process genuinely spans patterns. If you find yourself calling it hybrid because the requirements are unclear, go back to discovery.

---

## Reference Architecture

```
                    ┌─── Real-Time Path ───┐
Consumer (HTTP) ──→ exp-api ──→ proc-api ──→ sys-apis
                    └──────────────────────┘

                    ┌─── Async/Event Path ──────────────────┐
MQ / Scheduler ──→ proc-api ──→ sys-apis                    │
                    └──(batch job or foreach + DLQ)──────────┘

Both paths share:
  • Same sys-apis (different flows, same app or separate apps)
  • Same global-config.xml connector configs
  • Same global error handler
  • Same monitoring dashboards
```

---

## decisions.json Defaults

```json
{
  "integration": {
    "primaryPattern": "hybrid",
    "secondaryPatterns": ["real-time", "scheduled-sync"]
  },
  "nfr": {
    "latency": "under-3s",
    "frequency": "real-time"
  },
  "errorHandling": {
    "strategy": "retry-then-dlq",
    "maxRetries": 3,
    "backoff": "exponential",
    "dlq": true,
    "errorEnvelope": true
  },
  "devops": {
    "munitCoverage": 80
  }
}
```

---

## Defining Hybrid Flows

When `primaryPattern` is `hybrid`, the `integration.flows` array must document **every flow** with its pattern:

```json
"flows": [
  {
    "name": "http-get-account-flow",
    "layer": "experience",
    "source": "HTTP consumer",
    "target": "order-proc-api",
    "trigger": "http",
    "description": "Real-time account lookup for mobile app"
  },
  {
    "name": "scheduler-sync-invoice-flow",
    "layer": "process",
    "source": "scheduler",
    "target": "netsuite-sys-api",
    "trigger": "scheduler",
    "description": "Nightly invoice delta sync to Salesforce"
  },
  {
    "name": "mq-subscriber-process-order-flow",
    "layer": "process",
    "source": "anypoint-mq",
    "target": "salesforce-sys-api",
    "trigger": "mq-subscriber",
    "description": "Event-driven order creation from ERP events"
  }
]
```

---

## App Decomposition Rules

For hybrid projects, determine whether to use one process API or multiple:

| Rule | Action |
|------|--------|
| Real-time flows have sub-second SLA | Isolate in a dedicated proc-api so batch does not starve them |
| Batch window is long (> 30 min) | Separate proc-api for batch; share sys-apis |
| < 5 total flows across both patterns | Single proc-api is acceptable |
| Different teams own different patterns | Separate apps with separate pipelines |

---

## Worker Sizing for Hybrid

Batch and real-time have competing resource profiles:
- Real-time: low memory, latency-sensitive
- Batch: high memory, throughput-sensitive

**Recommended:** If batch and real-time share one app, size for the batch peak and use CloudScheduler to run batch jobs during off-peak hours.

| Scenario | vCores | Replicas |
|----------|--------|---------|
| Light hybrid (< 5 flows, low volume) | 0.2 | 2 |
| Medium hybrid | 1.0 | 2 |
| Heavy hybrid (batch > 100K records + active real-time) | 2.0 | 2+ |

---

## Error Handling

Each flow sub-pattern follows its own strategy:

| Sub-pattern | Strategy |
|------------|---------|
| Real-time flows | fail-fast |
| Scheduled-sync flows | retry-only |
| Event-driven / async flows | retry-then-dlq |

The global error handler must handle all three. Use `error-handler` with flow-specific routing where needed.

---

## Observability (Hybrid-Specific)

Hybrid projects must have:
- Separate Anypoint Monitoring metrics views per flow pattern
- Alert on DLQ for async flows
- Alert on P95 latency for real-time flows
- Business Events enabled if the project includes a client-facing operations dashboard

---

## Watermarking in Hybrid

If the project includes both a real-time read and a scheduled write:
- Watermark belongs to the scheduled-sync flow only
- Real-time reads are stateless — no watermark
- Object Store key naming must be scoped to the scheduled flow: `{flowName}-lastSync`

---

## MUnit Test Coverage

For each sub-pattern in the hybrid project, apply the corresponding scenario's test requirements:
- Real-time flows → see `real-time.md` test checklist
- Batch flows → see `batch.md` test checklist
- Scheduled-sync flows → see `scheduled-sync.md` test checklist
- Event-driven flows → see `event-driven.md` test checklist

Minimum overall coverage: **80%** (highest tier wins when patterns mix).

---

## Common Hybrid Anti-Patterns to Avoid

| Anti-pattern | Why it's wrong | Fix |
|-------------|---------------|-----|
| Calling a batch job from an HTTP listener synchronously | Consumer waits for batch to complete | Publish to MQ; batch subscribes; return 202 Accepted |
| Sharing a flow between real-time and scheduled triggers | Unclear SLA ownership | Separate flows per trigger type |
| Using a single Object Store key for two different flows | Watermark collision | Scope keys per flow name |
| Running batch at peak hours in a shared app | Starves real-time latency | Schedule batch during off-peak; or separate apps |

---

## Example Project

**Client:** LeoLabs — satellite tracking  
- Real-time: `http-get-conjunction-flow` (partner consumers query CDMs)  
- Scheduled-sync: `scheduler-sync-satellite-flow` (nightly TLE import from SFTP)  
- Event-driven: `mq-subscriber-process-alert-flow` (conjunction alerts to Slack/Teams)  
**Connectors:** `http`, `sftp`, `anypoint-mq`, `email`  
**Security tier:** partner  
**Deployment:** CloudHub 2.0, 1.0 vCores × 2 replicas
