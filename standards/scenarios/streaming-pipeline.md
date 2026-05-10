# Scenario: Streaming Pipeline (Real-Time Analytics / Data Lake Feed)

> **Pattern:** `streaming-pipeline`
> **Trigger:** Kafka/Kinesis consumer (continuous, unbounded stream)
> **Latency target:** < 10 seconds end-to-end (micro-batch window acceptable)
> **Volume:** Very-high to bulk (millions of events/day; high sustained throughput)

---

## When to Use This Pattern

- Continuous stream of events must flow to a data lake, data warehouse, or analytics platform
- High-volume operational events (clicks, transactions, IoT sensor readings, logs) must be processed
  in near-real-time without batch windows
- Stream enrichment: add context to raw events before landing in the sink
- Fan-in: multiple Kafka topics merged into a single enriched stream
- Real-time dashboards or fraud detection that cannot tolerate batch lag

**Distinguish from event-driven:** Event-driven reacts to individual business events and calls
operational systems. Streaming pipeline handles high-volume, continuous, append-only data flows
into analytics infrastructure.

**Distinguish from batch:** Batch processes finite datasets on a schedule. Streaming pipeline is
continuous — the stream never ends.

**Do not use** for: operational system updates (individual record creates/updates — use event-driven),
B2B document exchange (use b2b-edi), or when a nightly batch is all the business needs.

---

## Reference Architecture

### Stream to Data Lake

```
Event Sources (Kafka / Kinesis / Platform Events)
  Topic: events.{domain}.raw
        │
        ▼
{domain}-stream-proc-api
  ├── Kafka consumer (batch of messages, micro-batch window)
  ├── Filter invalid / test events
  ├── Enrich (add geo, user profile, product metadata from cache)
  ├── Transform to Parquet-friendly schema
  ├── Write to S3 / Azure Data Lake / Redshift in micro-batches
  └── Commit Kafka offset only after successful sink write
        │
        ▼
S3 / Azure Data Lake / Google BigQuery / Redshift
        │
        ▼
Analytics / BI / ML Platform
```

### Stream Transformation and Re-publish

```
Kafka topic: orders.raw
        │
        ▼
{domain}-stream-proc-api
  ├── Filter + enrich + transform
  └── Publish to: Kafka topic: orders.enriched
                               orders.high-value (filtered)
                               orders.international (filtered)
```

---

## decisions.json Defaults

```json
{
  "integration": {
    "primaryPattern": "streaming-pipeline",
    "direction": "unidirectional"
  },
  "nfr": {
    "latency": "under-10s",
    "frequency": "real-time",
    "volume": "bulk",
    "throughput": "very-high",
    "availability": "99.9"
  },
  "errorHandling": {
    "strategy": "retry-then-dlq",
    "maxRetries": 3,
    "backoff": "fixed",
    "dlq": true,
    "errorEnvelope": true
  },
  "systems": {
    "connectors": ["kafka", "amazon-s3"]
  },
  "devops": {
    "munitCoverage": 70
  }
}
```

---

## Flow Structure

### Kafka Consumer → S3 Sink (micro-batch)

```xml
<flow name="kafka-stream-{domain}-to-s3-flow">
  <kafka:consumer
    config-ref="Kafka_Consumer_Config"
    topic="${kafka.topic.{domain}.raw}"
    groupId="${kafka.groupId.{domain}.stream}"
    fetchMaxWaitMs="500"
    maxPollRecords="500"/>

  <!-- Process each message in the poll batch -->
  <!-- Note: payload is a single message; use parallel-foreach for micro-batching -->

  <!-- 1. Filter: drop test/internal events -->
  <choice>
    <when expression="#[payload.source == 'test']">
      <logger level="DEBUG" message="Filtered test event"/>
    </when>
    <otherwise>
      <!-- 2. Enrich from cache (Object Store or Redis) -->
      <flow-ref name="{domain}-enrich-event-subflow"/>

      <!-- 3. Transform to target schema -->
      <ee:transform>
        <ee:message>
          <ee:set-payload resource="dwl/map-{domain}-event-to-sink.dwl"/>
        </ee:message>
      </ee:transform>

      <!-- 4. Write to S3 (append to current micro-batch file) -->
      <flow-ref name="{domain}-write-to-s3-subflow"/>
    </otherwise>
  </choice>

  <error-handler ref="global-error-handler"/>
</flow>
```

### S3 Writer Sub-flow (buffer + flush pattern)

```xml
<sub-flow name="{domain}-write-to-s3-subflow">
  <!-- Buffer events in Object Store; flush to S3 every N records or T seconds -->
  <!-- For simplicity, write directly per message at lower volumes -->
  <!-- At high volumes, use aggregator module or external buffer (Kinesis Firehose) -->
  <amazon-s3:put-object
    config-ref="Amazon_S3_Config"
    bucketName="${s3.bucket.datalake}"
    key="#['events/{domain}/' ++ (now() as Date {format: 'yyyy/MM/dd'}) ++ '/' ++ uuid() ++ '.json']">
    <amazon-s3:body>#[output application/json --- payload]</amazon-s3:body>
  </amazon-s3:put-object>
</sub-flow>
```

### Kafka Re-publish with Fan-Out

```xml
<flow name="kafka-stream-enrich-{domain}-flow">
  <kafka:consumer
    config-ref="Kafka_Consumer_Config"
    topic="${kafka.topic.{domain}.raw}"
    groupId="${kafka.groupId.{domain}.enricher}"/>

  <!-- Enrich + transform -->
  <flow-ref name="{domain}-enrich-event-subflow"/>

  <!-- Publish to enriched topic (all events) -->
  <kafka:producer
    config-ref="Kafka_Producer_Config"
    topic="${kafka.topic.{domain}.enriched}"
    key="#[payload.id]"/>

  <!-- Conditional fan-out -->
  <async>
    <choice>
      <when expression="#[payload.amount > 10000]">
        <kafka:producer
          config-ref="Kafka_Producer_Config"
          topic="${kafka.topic.{domain}.high-value}"
          key="#[payload.id]"/>
      </when>
    </choice>
  </async>

  <error-handler ref="global-error-handler"/>
</flow>
```

---

## Consumer Group Strategy

| Requirement | Consumer group setup |
|-------------|---------------------|
| One consumer processes all messages | Single consumer group; 1 consumer per partition |
| Multiple independent consumers (each gets all messages) | Separate consumer group per consumer app |
| Load-balanced across MuleSoft instances | Same group ID across all replicas; Kafka distributes partitions |
| Ordered processing per entity | Partition by entity key; `maxConcurrency=1` per partition |

**Rule:** Consumer group ID must be stable across deployments. Changing it causes Kafka to
replay all messages from the earliest offset.

---

## Offset Commit Strategy

Never use auto-commit. Always commit offsets manually after confirmed sink write.

```
Process message
     │
     ▼
Write to sink (S3 / DB / target Kafka)
     │  success
     ▼
Commit Kafka offset
     │  failure (write failed)
     ▼
Do NOT commit → message replayed on next poll
```

MuleSoft Kafka connector commits automatically by default after flow completes without error.
Use error handlers to prevent commit on failure.

---

## Enrichment Cache

High-throughput streams cannot call external APIs per event (rate limits, latency).
Use a local cache layer:

| Cache type | Use when | TTL |
|-----------|---------|-----|
| Object Store (in-memory) | Single instance; < 10K unique keys | 15 min |
| Object Store (persistent) | Multi-instance; needs consistency | 30 min |
| Redis connector | Very high hit rate; sub-ms read required | Configurable |

Cache warming: on startup, pre-load hot reference data before consuming from stream.

---

## Sink Selection

| Target | Connector | Notes |
|--------|-----------|-------|
| Amazon S3 | `amazon-s3` | JSON/Parquet files; partition by date; Athena queryable |
| Azure Data Lake | `azure-blob` or Azure Data Lake connector | ADLS Gen2 for Synapse/Databricks |
| Google BigQuery | `google-bigquery` | Streaming inserts API; near-real-time queryable |
| Amazon Redshift | `database` (JDBC) | COPY from S3 preferred over direct JDBC for high volume |
| Elasticsearch | `elasticsearch` | Real-time search index; monitor shard health |
| Target Kafka topic | `kafka:producer` | Stream re-publishing; fan-out |

For very high volumes (> 1M events/day) to S3: prefer writing to Kinesis Firehose and letting it
buffer and deliver to S3. MuleSoft writes individual messages; Firehose handles batching/compression.

---

## Back-Pressure and Throughput

- Set `maxPollRecords` based on downstream sink throughput capacity
- Monitor consumer lag in Kafka (key health metric — rising lag = pipeline falling behind)
- Scale horizontally: add CloudHub 2.0 replicas = add Kafka consumers (partitions must be ≥ replicas)
- Partition count determines max parallelism — cannot exceed partition count with consumers

Worker sizing for streaming:
| Event rate | vCores | Replicas | Notes |
|-----------|--------|---------|-------|
| < 1K/sec | 0.2 | 2 | |
| 1K–10K/sec | 1.0 | 2 | Monitor GC pressure |
| > 10K/sec | 2.0 | 4+ | Consider dedicated Kafka Streams or Flink |

---

## Error Handling

Strategy: **retry-then-dlq**

| Failure | Action |
|---------|--------|
| Malformed event | Route to error topic / DLQ; commit offset (bad events must not block stream) |
| Enrichment cache miss | Use empty enrichment; log WARN; do not stop stream |
| Sink write failure (transient) | Retry 3× fixed 2s; then DLQ; do NOT commit offset |
| Sink unavailable | Pause consumer (do not commit); alert ops; resume when sink recovers |

**Never let a bad record block the stream.** Route unparseable events to a dead-letter Kafka
topic (`{topic}.dlq`) for later analysis.

---

## MUnit Test Coverage

Each streaming flow must have tests for:
- [ ] Valid event — enriched, transformed, written to sink
- [ ] Malformed event — routed to DLQ; offset committed; stream continues
- [ ] Sink write failure — retry fires; offset NOT committed on exhaustion
- [ ] Enrichment cache hit — no external call made
- [ ] Fan-out routing — high-value event published to both enriched and high-value topics

---

## Example Project

**Client:** E-commerce — Kafka order events → S3 data lake → Athena for BI dashboards
**Flows:** `kafka-stream-orders-to-s3-flow`, `orders-enrich-event-subflow`
**Connectors:** `kafka`, `amazon-s3`, `redis` (enrichment cache), `anypoint-mq` (DLQ)
**Security tier:** internal
**Deployment:** CloudHub 2.0, 1.0 vCores × 4 replicas (= 4 Kafka consumers; requires ≥ 4 partitions)
