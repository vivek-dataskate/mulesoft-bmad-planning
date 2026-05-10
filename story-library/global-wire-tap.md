# Story Template: Wire Tap Audit Flow Setup

**Story Type:** Global Infrastructure (Conditional)
**When to include:** Only if `decisions.json wireTap.enabled = true` — this is an explicit architect decision made at Level 4 planning. Not a default.
**Priority:** P1
**Standard:** `standards/MULESOFT_DESIGN_STANDARDS.md → Cross-Cutting Patterns → Wire Tap`
**Scaffold File:** `src/main/mule/error-handler.xml` (shared async block) or `src/main/mule/global-config.xml`

---

## User Story

As an ops engineer, I need a non-intrusive wire tap that captures a copy of every message flowing through the integration without affecting primary flow latency or reliability, so that I can audit message content and debug production issues without modifying running flows.

---

## Acceptance Criteria

### Wire Tap Implementation
- [ ] Async wire-tap block defined as a shared fragment in `global-config.xml` or `error-handler.xml`
- [ ] Wire tap implemented using `<async>` scope — does NOT block or add latency to the primary flow
- [ ] Wire tap publishes to `{domain}-audit-{env}-queue` (Anypoint MQ)
- [ ] Wire tap is invoked from every primary flow at entry point (configure once in shared block, not per-flow)

### Audit Message Content
- [ ] Audit message contains:
  ```json
  {
    "flow": "<flow-name>",
    "correlationId": "<correlationId>",
    "payloadSummary": "<first N bytes or field subset — never full PII payload>",
    "payloadSize": "<bytes>",
    "timestamp": "<ISO-8601>",
    "environment": "<env>"
  }
  ```
- [ ] Full raw payload is NOT written to audit queue (privacy, size) — use payload summary or field subset
- [ ] PII fields masked or excluded from audit message (per `architecture.md → Semantic Dissonance / PII` section)

### Audit Queue Configuration
- [ ] Audit queue name: `{wireTap.queueName}` (from decisions.json; default pattern: `{domain}-audit-{env}-queue`)
- [ ] Audit queue TTL: **`{wireTap.retentionHours}` hours** (set by architect in decisions.json; default 72h)
- [ ] DLQ for audit queue: `{wireTap.queueName}-dlq`
- [ ] Queue max depth sized for `(peak messages/hour × wireTap.retentionHours)` — if depth fills before TTL expires, tail drop silently discards new audit messages
- [ ] Queue depth alert: > 80% → MEDIUM → Ops team

### Reliability (Wire Tap Must NOT Break Primary Flow)
- [ ] Wire tap `<async>` block wrapped in `on-error-continue` — audit failure is write-off, never breaks primary
- [ ] If audit queue is unavailable: log WARN, continue primary flow
- [ ] Wire tap latency contribution to primary flow: zero (async — fire and forget)

### MUnit Test
- [ ] MUnit test: verify wire tap publishes to audit queue on happy path
- [ ] MUnit test: verify primary flow continues normally when wire tap mock throws exception

---

## Wire Tap XML Reference

```xml
<!-- Shared async wire-tap — reference from primary flows -->
<async doc:name="Wire Tap">
  <anypoint-mq:publish
    config-ref="Anypoint_MQ_Config"
    destination="${mq.queue.audit}"
    messageId="#[correlationId]">
    <anypoint-mq:body>
      #[output application/json ---
        {
          flow: flow.name,
          correlationId: correlationId,
          payloadSize: sizeOf(write(payload, "application/json")),
          timestamp: now() as String {format: "yyyy-MM-dd'T'HH:mm:ssZ"},
          environment: p('mule.env')
        }
      ]
    </anypoint-mq:body>
  </anypoint-mq:publish>
</async>
```

---

## Implementation Notes

- Reference: `standards/MULESOFT_DESIGN_STANDARDS.md → Cross-Cutting Patterns → Wire Tap`
- Wire tap is enterprise and regulated profile only — not included in minimal or standard profiles
- Audit queue is separate from the DLQ and business event queues — do not reuse
- If `scaffold.profile=regulated`: audit message content requirements may be stricter per compliance section in prd.md
