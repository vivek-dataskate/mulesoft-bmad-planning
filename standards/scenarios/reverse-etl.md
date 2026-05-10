# Scenario: Reverse ETL

> **Pattern:** `reverse-etl`
> **Trigger:** Scheduler (batch sync) or event-driven (metric threshold crossed)
> **Latency target:** async-ok (minutes to hours lag acceptable)
> **Volume:** Low–high (depends on number of enriched records and sync frequency)

---

## When to Use This Pattern

- Analytics or data warehouse results need to flow back into operational CRM, ERP, or ITSM systems
- ML model scores, propensity scores, or customer segments computed in the data warehouse must
  appear in Salesforce so sales reps can act on them
- Finance needs KPIs computed in Snowflake/BigQuery pushed to NetSuite for reporting dashboards
- A client says "our data warehouse knows things our CRM doesn't — how do we get that data in?"
- Data enrichment computed offline (churn risk, LTV, segment) should gate operational workflows

**This is the architectural inverse of ETL/ELT (E/K scenarios):**
```
ETL / ELT (patterns E, C, K):   Operational system → MuleSoft → Data warehouse
Reverse ETL (this pattern):     Data warehouse → MuleSoft → Operational system
```

**Do not use** when: data flows are bidirectional and need real-time sync (use F: cdc-streaming
or A: request-reply instead). Also do not use when the operational system already has a native
data warehouse connection (e.g., Salesforce CRM Analytics) — MuleSoft is not needed as a relay.

---

## Reference Architecture

```
Data Warehouse (Snowflake / Redshift / BigQuery / Databricks)
        │  MuleSoft queries via JDBC or HTTP API
        │  Query: SELECT * FROM enriched_view WHERE updated_at > :watermark
        ▼
{domain}-reverse-etl-proc-api
  ├── Read enriched rows (with watermark)
  ├── Transform warehouse schema → operational system schema
  ├── For each record batch:
  │     ├── Upsert to operational system (Salesforce, NetSuite, ServiceNow…)
  │     └── Log result (success / updated / created / skipped)
  ├── Advance watermark (Object Store)
  └── Emit business event (count synced, count failed)
        ↓
Operational System (Salesforce / NetSuite / Dynamics 365 / ServiceNow / HubSpot)
  └── Record enriched with analytics data (segment, score, flag, metric)
```

---

## decisions.json Defaults

```json
{
  "integration": {
    "integrationStyle": "messaging",
    "primaryPattern": "reverse-etl",
    "direction": "unidirectional"
  },
  "nfr": {
    "latency": "async-ok",
    "frequency": "scheduled",
    "volume": "medium"
  },
  "errorHandling": {
    "strategy": "retry-then-dlq",
    "compensationStrategy": "retry",
    "maxRetries": 3,
    "backoff": "exponential",
    "dlq": true,
    "invalidMessageChannel": true,
    "errorEnvelope": true
  },
  "flowControl": {
    "direction": "pull",
    "messageTtlHours": 24,
    "maxConcurrency": 4,
    "backpressureEnabled": true,
    "deduplicationEnabled": true,
    "deduplicationTtlMinutes": 1440
  },
  "scheduling": {
    "required": true,
    "type": "cron",
    "watermarking": true,
    "objectStore": "persistent"
  },
  "devops": {
    "munitCoverage": 80
  }
}
```

---

## Warehouse Connectivity Options

| Warehouse | MuleSoft Approach | Notes |
|-----------|------------------|-------|
| **Snowflake** | Database connector + Snowflake JDBC driver | Driver JAR required in lib/; use `warehouse` and `role` in connection string |
| **Amazon Redshift** | Database connector + Redshift JDBC driver | Use IAM auth for CloudHub 2.0 (no static credentials) |
| **Google BigQuery** | HTTP connector (BigQuery REST API) | Use OAuth2 service account; `jobs.query` for sync, `jobs.insert` for async large queries |
| **Databricks** | HTTP connector (SQL Warehouse REST API) | Personal access token or OAuth2; use `/api/2.0/sql/statements` endpoint |
| **Azure Synapse** | Database connector + SQL Server JDBC | Same connector as MSSQL |
| **dbt Cloud** | HTTP connector (dbt Cloud API) | Trigger model runs via API; read results from warehouse after run completes |

**CloudHub 2.0 note:** Snowflake and Redshift JDBC drivers cannot go in pom.xml — they require
manual placement in the shared lib folder. Flag this as a TODO in the generated project.

---

## Flow Structure

### Scheduler-triggered Reverse ETL Flow

```xml
<flow name="scheduler-reverse-etl-{domain}-flow">
  <scheduler doc:name="Reverse ETL Scheduler">
    <scheduling-strategy>
      <cron expression="${reverse-etl.{domain}.cron}" timeZone="UTC"/>
    </scheduling-strategy>
  </scheduler>

  <!-- 1. Read watermark -->
  <os:retrieve key="reverse-etl-{domain}-lastSync" target="lastSync"
    defaultValue="1970-01-01T00:00:00Z" objectStore="persistent-store"
    doc:name="Read Watermark"/>

  <!-- 2. Query warehouse for enriched rows updated since watermark -->
  <db:select config-ref="Warehouse_Config" doc:name="Query Warehouse">
    <db:sql><![CDATA[
      SELECT record_id, external_system_id, segment, score, score_date, updated_at
      FROM analytics.enriched_{domain}_view
      WHERE updated_at > :lastSync
      ORDER BY updated_at ASC
      LIMIT :batchSize
    ]]></db:sql>
    <db:input-parameters><![CDATA[#[{
      lastSync:   vars.lastSync,
      batchSize:  ${reverse-etl.batch.size}
    }]]]></db:input-parameters>
  </db:select>

  <!-- 3. Process in batches -->
  <batch:job jobName="reverse-etl-{domain}-batch" doc:name="Batch Upsert">
    <batch:process-records>
      <batch:step name="transform-{domain}-step">
        <flow-ref name="transform-{domain}-warehouse-to-{target}-subflow"/>
      </batch:step>
      <batch:step name="upsert-{domain}-step" acceptExpression="#[vars.isValid]">
        <flow-ref name="upsert-{domain}-to-{target}-subflow"/>
      </batch:step>
    </batch:process-records>
    <batch:on-complete>
      <logger level="INFO"
        message="#['Reverse ETL complete: ' ++ batchResult.successfulRecords ++ ' synced, ' ++ batchResult.failedRecords ++ ' failed']"/>
    </batch:on-complete>
  </batch:job>

  <!-- 4. Advance watermark (only after successful batch) -->
  <os:store key="reverse-etl-{domain}-lastSync"
    value="#[now() as String {format: &quot;yyyy-MM-dd'T'HH:mm:ss'Z'&quot;}]"
    objectStore="persistent-store" doc:name="Advance Watermark"/>

  <error-handler ref="global-error-handler"/>
</flow>
```

### Transform Sub-flow (Warehouse Schema → Operational Schema)

```xml
<sub-flow name="transform-{domain}-warehouse-to-{target}-subflow">
  <ee:transform doc:name="Map Warehouse Fields to Operational Schema">
    <ee:set-payload><![CDATA[%dw 2.0
    output application/java
    ---
    {
      // Map warehouse fields to target operational system fields
      // TODO: complete field mapping per architecture.md Field Mapping table
      externalId:   payload.external_system_id,   // lookup key in operational system
      segment:      payload.segment,
      score:        payload.score,
      scoreDate:    payload.score_date as String,
      lastSyncedAt: now() as String
    }
    ]]></ee:set-payload>
  </ee:transform>
  <set-variable variableName="isValid"
    value="#[payload.externalId != null]" doc:name="Validate External ID"/>
</sub-flow>
```

### Upsert Sub-flow (to Salesforce example)

```xml
<sub-flow name="upsert-{domain}-to-salesforce-subflow">
  <salesforce:upsert config-ref="Salesforce_Config"
    externalIdFieldName="ExternalId__c"
    type="Contact"
    doc:name="Upsert Enriched Fields to Salesforce">
    <salesforce:records><![CDATA[#[[{
      ExternalId__c:        payload.externalId,
      Analytics_Segment__c: payload.segment,
      Propensity_Score__c:  payload.score,
      Score_Date__c:        payload.scoreDate,
      Last_Analytics_Sync__c: payload.lastSyncedAt
    }]]]]></salesforce:records>
  </salesforce:upsert>
</sub-flow>
```

---

## Idempotency Approach

Reverse ETL relies on **upsert** (not insert) at the operational system. The operational system's
external ID field is the idempotency key. Records written multiple times produce the same state.

- Use the warehouse's primary key or a stable business key (not a warehouse-generated surrogate) as the external ID
- The target system's upsert endpoint must accept an external ID field: Salesforce `externalIdFieldName`,
  NetSuite `externalId`, ServiceNow `sys_id` or `externalId`
- Always confirm the external ID field is indexed in the operational system — upsert by unindexed field is slow

---

## Data Governance Requirements

Reverse ETL moves analytics decisions into systems of action. These decisions affect users.

| Requirement | Implementation |
|-------------|---------------|
| **Lineage** | Log warehouse query timestamp, row count, and model/view version in business events |
| **Drift detection** | Alert if score distribution shifts dramatically (> 20% deviation) — may indicate broken model |
| **Stale data guard** | If `score_date` is older than `${reverse-etl.staleness.threshold.days}`, skip the record and log WARN |
| **PII in scores** | Never log individual scores with PII fields. Log aggregates only. |
| **Consent** | If operational system holds marketing-consent data, verify consent before using analytics to drive actions |

---

## Error Handling

Strategy: **retry-then-dlq** (per record via Mule Batch)

| Failure | Action |
|---------|--------|
| Warehouse query fails | Halt flow; DLQ the scheduled trigger; do NOT advance watermark |
| Single record transform fails | Route to Invalid Message Channel (data quality issue — retry won't fix) |
| Single record upsert fails (transient) | Batch retry; on maxRetries: DLQ the record |
| Operational system rate-limited (429) | Exponential backoff; reduce `maxConcurrency` |
| Watermark NOT advanced on batch failure | Next run re-fetches same window — safe; upsert is idempotent |

---

## Relationship to Other Patterns

| Pattern | Relationship |
|---------|-------------|
| **E (file-based-etl)** | Directional opposite — E flows operational → warehouse; T flows warehouse → operational |
| **D (scheduled-sync)** | Closest relative — both use watermark + scheduler; reverse ETL reads from warehouse not operational |
| **C (batch)** | Reverse ETL uses Mule Batch scope for record processing; same mechanics |
| **K (data-migration)** | K is one-time historical load; reverse ETL is ongoing recurring sync |
| **P (ai-augmented-flow)** | If the warehouse score was generated by an ML model, P describes calling that model inline; T describes syncing its output back to operational systems |

---

## MUnit Test Coverage

- [ ] Happy path — warehouse rows fetched → transformed → upserted to operational system
- [ ] Watermark advances on success; stays on warehouse query failure
- [ ] Stale score guard — record with `score_date` beyond threshold skipped, logged
- [ ] Invalid record (null external ID) — routed to Invalid Message Channel, not DLQ
- [ ] Operational system 429 — backoff triggers; retry succeeds
- [ ] Operational system unavailable — DLQ populated; watermark not advanced
- [ ] Upsert idempotency — same record upserted twice produces same result; no duplicate

---

## Example Projects

**Client:** SaaS company — Snowflake ML churn scores → Salesforce Contact enrichment
**Flows:** `scheduler-reverse-etl-churn-flow`, `transform-churn-warehouse-to-salesforce-subflow`,
          `upsert-churn-to-salesforce-subflow`
**Connectors:** `database` (Snowflake JDBC), `salesforce`
**Secondary pattern:** `outbound-notification` (alert if > 10% records failed)
**Security tier:** partner (Salesforce uses oauth-jwt; warehouse uses IAM role)

**Client:** Retail — BigQuery customer LTV segments → Dynamics 365 Customer entity
**Flows:** `scheduler-reverse-etl-ltv-flow`
**Connectors:** `http` (BigQuery REST API), `dynamics365`
**Secondary pattern:** `outbound-notification` (email ops on completion)
