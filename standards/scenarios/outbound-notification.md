# Scenario: Outbound Notification / Alert Dispatch

> **Pattern:** `outbound-notification`
> **Trigger:** MQ message, MuleSoft error handler, business event threshold, or scheduler
> **Latency target:** < 30 seconds (best-effort; not mission-critical path)
> **Volume:** Low (alerts are exception events; high volume = monitoring problem)

---

## When to Use This Pattern

- A system event must trigger a human notification (email, Slack, Teams, SMS)
- Monitoring alerts: DLQ depth exceeded, error rate spike, batch job completion
- Business alerts: order over threshold, payment failed, SLA breach
- Integration status notifications: nightly batch succeeded/failed, migration progress
- Pure dispatch — no data transformation, no system reads; just route and send

**Distinguish from process-orchestration:** Orchestration manages multi-step workflows with state.
Outbound notification is fire-and-forget — one event in, one (or a few) messages out, no return value.

**Distinguish from event-driven:** Event-driven reacts to an event and updates backend systems.
Notification only sends a human-readable alert — no data mutations.

**Do not use** for: transactional emails that are the primary business output (use process-orchestration
with a notification step), mass marketing emails (use Salesforce Marketing Cloud or Marketo directly),
or any notification where delivery confirmation is required for compliance.

---

## Reference Architecture

### Error Alert Dispatch

```
Any MuleSoft flow (error occurs)
        │  on-error-propagate
        ▼
Global Error Handler
  └── flow-ref: dispatch-error-notification-subflow
        │
   ┌────┼──────┐
   ▼    ▼      ▼
Email  Slack  Teams    ← based on configuration; not all channels always active
```

### Business Event Notification

```
Business event trigger (MQ message, threshold check, scheduler)
        │
        ▼
{domain}-notification-flow
  ├── Evaluate condition (is threshold exceeded?)
  ├── Build notification payload (template + data)
  ├── Route to enabled channels
  └── Log dispatch result (do not fail on notification failure)
```

---

## decisions.json Defaults

```json
{
  "integration": {
    "primaryPattern": "outbound-notification",
    "direction": "unidirectional"
  },
  "nfr": {
    "latency": "async-ok",
    "frequency": "triggered",
    "volume": "low"
  },
  "errorHandling": {
    "strategy": "retry-only",
    "maxRetries": 3,
    "backoff": "fixed",
    "dlq": false,
    "errorEnvelope": false
  },
  "notifications": {
    "email": true,
    "slack": false,
    "teams": false,
    "sms": false
  },
  "devops": {
    "munitCoverage": 60
  }
}
```

---

## Flow Structure

### Global Error Notification Sub-flow

```xml
<sub-flow name="dispatch-error-notification-subflow">
  <!-- Build error context -->
  <set-variable variableName="notificationPayload">
    <![CDATA[%dw 2.0
    output application/json
    ---
    {
      severity:        "ERROR",
      app:             "${app.name}",
      environment:     "${mule.env}",
      flowName:        flow.name,
      errorType:       error.errorType.identifier,
      errorMessage:    error.description,
      correlationId:   correlationId,
      timestamp:       now() as String,
      payload:         payload as String {maxLength: 500}  // truncate for safety
    }]]>
  </set-variable>

  <!-- Only alert in non-dev environments -->
  <choice>
    <when expression="#[Mule::p('mule.env') != 'local' and Mule::p('mule.env') != 'dev']">
      <flow-ref name="route-notifications-subflow"/>
    </when>
    <otherwise>
      <logger level="ERROR" message="[LOCAL/DEV] Notification suppressed: #[vars.notificationPayload]"/>
    </otherwise>
  </choice>
</sub-flow>
```

### Channel Routing Sub-flow

```xml
<sub-flow name="route-notifications-subflow">
  <!-- Send to each enabled channel; wrap in try so one failure doesn't prevent others -->

  <!-- Email -->
  <try>
    <flow-ref name="send-email-notification-subflow"/>
    <error-handler>
      <on-error-continue type="ANY">
        <logger level="WARN" message="Email notification failed — continuing"/>
      </on-error-continue>
    </error-handler>
  </try>

  <!-- Slack (if configured) -->
  <choice>
    <when expression="#[Mule::p('notification.slack.enabled') == 'true']">
      <try>
        <flow-ref name="send-slack-notification-subflow"/>
        <error-handler>
          <on-error-continue type="ANY">
            <logger level="WARN" message="Slack notification failed — continuing"/>
          </on-error-continue>
        </error-handler>
      </try>
    </when>
  </choice>

  <!-- Teams (if configured) -->
  <choice>
    <when expression="#[Mule::p('notification.teams.enabled') == 'true']">
      <try>
        <flow-ref name="send-teams-notification-subflow"/>
        <error-handler>
          <on-error-continue type="ANY">
            <logger level="WARN" message="Teams notification failed — continuing"/>
          </on-error-continue>
        </error-handler>
      </try>
    </when>
  </choice>
</sub-flow>
```

### Email Sub-flow

```xml
<sub-flow name="send-email-notification-subflow">
  <email:send config-ref="Email_SMTP_Config"
    subject="#['[' ++ Mule::p('mule.env') ++ '] ' ++ vars.notificationPayload.severity ++ ': ' ++ vars.notificationPayload.errorType]"
    toAddresses="${notification.email.recipients}">
    <email:body contentType="text/html">
      <!-- Use external DWL template: dwl/email-error-template.dwl -->
      <ee:transform>
        <ee:message>
          <ee:set-payload resource="dwl/email-error-notification.dwl"/>
        </ee:message>
      </ee:transform>
    </email:body>
  </email:send>
</sub-flow>
```

### Slack Sub-flow (Webhook — preferred over Slack connector for simple notifications)

```xml
<sub-flow name="send-slack-notification-subflow">
  <!-- Use HTTP connector with Slack Incoming Webhook URL (simpler than Slack connector) -->
  <http:request config-ref="Slack_Webhook_Config"
    path="/"
    method="POST">
    <http:body><![CDATA[%dw 2.0
      output application/json
      var color = if (vars.notificationPayload.severity == "ERROR") "#FF0000"
                  else if (vars.notificationPayload.severity == "WARN") "#FFA500"
                  else "#36A64F"
      ---
      {
        attachments: [{
          color:  color,
          title:  vars.notificationPayload.severity ++ ": " ++ vars.notificationPayload.errorType,
          text:   vars.notificationPayload.errorMessage,
          fields: [
            { title: "App",           value: vars.notificationPayload.app,           short: true },
            { title: "Environment",   value: vars.notificationPayload.environment,   short: true },
            { title: "Flow",          value: vars.notificationPayload.flowName,      short: true },
            { title: "CorrelationId", value: vars.notificationPayload.correlationId, short: true }
          ],
          ts: now() as Number
        }]
      }]]>
    </http:body>
  </http:request>
</sub-flow>
```

### Teams Sub-flow (Webhook)

```xml
<sub-flow name="send-teams-notification-subflow">
  <http:request config-ref="Teams_Webhook_Config"
    path="/"
    method="POST">
    <http:body><![CDATA[%dw 2.0
      output application/json
      ---
      {
        "@type":    "MessageCard",
        "@context": "http://schema.org/extensions",
        summary:    vars.notificationPayload.severity ++ ": " ++ vars.notificationPayload.errorType,
        themeColor: if (vars.notificationPayload.severity == "ERROR") "FF0000" else "FFA500",
        sections: [{
          activityTitle:    vars.notificationPayload.app ++ " [" ++ vars.notificationPayload.environment ++ "]",
          activitySubtitle: vars.notificationPayload.flowName,
          text:             vars.notificationPayload.errorMessage,
          facts: [
            { name: "CorrelationId", value: vars.notificationPayload.correlationId },
            { name: "ErrorType",     value: vars.notificationPayload.errorType },
            { name: "Timestamp",     value: vars.notificationPayload.timestamp }
          ]
        }]
      }]]>
    </http:body>
  </http:request>
</sub-flow>
```

### SMS (Twilio) Sub-flow

```xml
<sub-flow name="send-sms-notification-subflow">
  <!-- Use for CRITICAL/PAGER severity only — SMS is expensive and disruptive -->
  <http:request config-ref="Twilio_Config"
    path="/2010-04-01/Accounts/${twilio.accountSid}/Messages.json"
    method="POST">
    <http:body>
      <![CDATA[To=${notification.sms.to}&From=${twilio.from}&Body=CRITICAL: #[vars.notificationPayload.app] #[vars.notificationPayload.errorType] at #[vars.notificationPayload.timestamp]]]>
    </http:body>
    <http:headers>
      <http:header key="Content-Type" value="application/x-www-form-urlencoded"/>
    </http:headers>
  </http:request>
</sub-flow>
```

---

## Notification Properties Configuration

Define all notification settings in properties files:

```properties
# notification.yaml (per environment)
notification.email.recipients=ops-team@company.com,on-call@company.com
notification.email.sender=mulesoft-alerts@company.com
notification.slack.enabled=true
notification.slack.webhook.url=${secure::slack.webhook.url}
notification.teams.enabled=false
notification.teams.webhook.url=${secure::teams.webhook.url}
notification.sms.enabled=false
notification.sms.to=+15551234567
```

Webhook URLs must be stored in Secrets Manager, not properties files. Reference via
`${secure::property.name}` with the Anypoint Secrets Manager connector or AWS Secrets Manager
Properties Provider.

---

## Severity Levels and Channel Mapping

| Severity | Email | Slack | Teams | SMS | When to use |
|----------|-------|-------|-------|-----|-------------|
| INFO | dev only | No | No | No | Batch completion, status updates |
| WARN | Yes | Optional | No | No | Recoverable errors, retries exhausted |
| ERROR | Yes | Yes | Optional | No | Flow failure, DLQ events |
| CRITICAL | Yes | Yes | Yes | Yes | Data loss risk, system down, security event |

---

## Notification Rate Limiting

Notification storms (DLQ flooding, cascading errors) cause alert fatigue. Apply:
- **Deduplication**: use Object Store with TTL to suppress duplicate alerts (same error type + app,
  within 15 min window)
- **Throttle**: maximum 5 alerts/minute per channel (log suppressed alerts at WARN)
- **Grouping**: for batch jobs, send one summary notification at completion, not one per failed record

```dataweave
// Deduplication key
"${app.name}-" ++ error.errorType.identifier
// TTL: 15 min
```

---

## Email Template Standards

- Subject: `[{ENV}] {SEVERITY}: {errorType} in {appName}`
- Body: HTML only; include correlationId, timestamp, flowName, truncated payload (max 500 chars)
- Never include full payload, stack traces, or PII in notification bodies
- Include a link to Anypoint Monitoring deep-link for the relevant flow (if available)

---

## Error Handling

Notification failures must NEVER break the primary flow. Always wrap notification calls in
`on-error-continue`. A failed Slack webhook is a nuisance; it must not cause a DLQ event.

Strategy: **retry-only** (not retry-then-dlq — there is no DLQ for notifications)

| Failure | Action |
|---------|--------|
| SMTP server unavailable | Retry 3× fixed 5s; log WARN if all fail; continue |
| Slack webhook 5xx | Retry 2× fixed 2s; log WARN if fail; continue |
| Teams webhook 4xx | Log ERROR (check webhook URL); continue |
| SMS API failure | Log WARN; continue (SMS is best-effort) |

---

## MUnit Test Coverage

Notification flows have lower coverage requirements (60%):

- [ ] Happy path — error event → email sent (mock SMTP)
- [ ] Slack enabled → Slack webhook called with correct payload shape
- [ ] DEV/LOCAL environment → notification suppressed (no email/Slack call)
- [ ] SMTP failure → flow continues without error (on-error-continue)
- [ ] Duplicate alert within deduplication window → suppressed

---

## Example Project

**Client:** LeoLabs — integration ops alerts for DLQ events, batch job completion, error spikes
**Flows:** `dispatch-error-notification-subflow`, `route-notifications-subflow`,
          `send-email-notification-subflow`, `send-slack-notification-subflow`
**Connectors:** `email`, `http` (Slack/Teams webhooks), `anypoint-mq` (trigger)
**Security tier:** internal
**Deployment:** Included in existing proc-api apps as shared sub-flows (not a standalone app)
