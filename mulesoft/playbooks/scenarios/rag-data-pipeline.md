# Scenario: RAG Data Pipeline (Retrieval-Augmented Generation)

> **Pattern:** `rag-data-pipeline`
> **Trigger:** Scheduler (incremental sync) or event-driven (new document published)
> **Latency target:** Pipeline: minutes (async); Retrieval query: < 2s (sync)
> **Volume:** Low–medium documents/day (embedding is expensive; sync only changed docs)

---

## When to Use This Pattern

- An AI assistant or chatbot must answer questions grounded in enterprise data (not hallucination)
- Enterprise knowledge base, product documentation, contracts, policies, or support articles must
  be searchable by semantic similarity — not just keyword match
- LLM needs up-to-date context from internal systems it was not trained on
- Agentforce, Einstein, or a custom AI agent needs to "know" about current enterprise records
- You are building the data pipeline side (ingestion, chunking, embedding, upsert to vector store) —
  the retrieval/query side is usually handled by the AI application itself

**RAG has two halves. This scenario covers the integration (write) half:**
```
[Ingestion Pipeline]               [Query Path — NOT this scenario]
Document → chunk → embed           User question → embed → similarity search
→ upsert to vector store           → retrieve top-K chunks → LLM with context
```

**Do not use** for: general search (use Elasticsearch), structured data queries (use API), or when
the knowledge base is static and can be loaded once at model deploy time (no MuleSoft needed).

---

## Reference Architecture

### Document Ingestion Pipeline

```
Source (SharePoint / S3 / Confluence / Salesforce Knowledge / ServiceNow / DB)
        │  new or changed document event / scheduler poll
        ▼
{domain}-rag-pipeline-proc-api
  ├── Fetch document content (text extraction if PDF/DOCX)
  ├── Chunk document (fixed-size or semantic chunking)
  ├── For each chunk:
  │     ├── Generate embedding (call embedding model API)
  │     └── Upsert to vector store (chunk text + embedding + metadata)
  ├── Update sync watermark (Object Store)
  └── Log ingest summary
        │
   ┌────┴────┐
   ▼         ▼
Vector Store   Metadata Store
(embeddings)   (doc ID, source, timestamps — for filtering)
```

### Retrieval Path (Query — for reference; implemented in AI app, not MuleSoft)

```
User query
  → embed query
  → vector similarity search (top-K chunks)
  → retrieve chunk text + metadata
  → inject into LLM prompt as context
  → LLM generates grounded answer
```

---

## decisions.json Defaults

```json
{
  "integration": {
    "integrationStyle": "messaging",
    "primaryPattern": "rag-data-pipeline",
    "direction": "unidirectional"
  },
  "nfr": {
    "latency": "async-ok",
    "frequency": "scheduled",
    "volume": "low"
  },
  "errorHandling": {
    "strategy": "retry-then-dlq",
    "compensationStrategy": "retry",
    "maxRetries": 3,
    "backoff": "exponential",
    "dlq": true,
    "invalidMessageChannel": false,
    "errorEnvelope": true
  },
  "flowControl": {
    "direction": "pull",
    "messageTtlHours": 24,
    "maxConcurrency": 4,
    "backpressureEnabled": false,
    "deduplicationEnabled": false
  },
  "scheduling": {
    "required": true,
    "type": "cron",
    "watermarking": true,
    "objectStore": "persistent"
  },
  "systems": {
    "connectors": ["amazon-s3"]
  },
  "devops": {
    "munitCoverage": 80
  }
}
```

---

## Vector Store Selection

| Store | MuleSoft integration | Notes |
|-------|---------------------|-------|
| Salesforce Data Cloud (Vector DB) | MuleSoft Vectors connector | Best for Salesforce/Agentforce-native deployments |
| Pinecone | HTTP connector (REST API) | Fully managed; serverless; widely used |
| Weaviate | HTTP connector (REST/GraphQL) | Open source; self-hosted or cloud |
| Chroma | HTTP connector (REST API) | Open source; good for dev/prototype |
| pgvector (PostgreSQL) | Database connector + JDBC | Easiest if already on PostgreSQL |
| Azure AI Search | HTTP connector | Azure-native; supports hybrid search |
| Amazon OpenSearch | HTTP connector | AWS-native; supports kNN search |

Default: **Salesforce Data Cloud** if the client is Salesforce-native (Agentforce integration).
**pgvector** for minimal infrastructure. **Pinecone** for standalone vector search needs.

---

## Embedding Model Selection

| Model | Provider | Dimensions | Notes |
|-------|---------|-----------|-------|
| text-embedding-3-small | OpenAI | 1536 | Good default; cost-effective |
| text-embedding-3-large | OpenAI | 3072 | Higher quality; 3× cost |
| amazon.titan-embed-text-v2 | AWS Bedrock | 1024 | AWS-native; use with OpenSearch |
| text-embedding-ada-002 | OpenAI (legacy) | 1536 | Older; replaced by v3 |
| voyage-3 | Voyage AI / Anthropic | 1024 | High quality for enterprise docs |

**Critical:** Embedding model must be the SAME for ingestion and retrieval. Never mix models.
Store the model ID used for ingestion in the vector store metadata.

---

## Flow Structure

### Document Ingestion Flow (Scheduler-triggered)

```xml
<flow name="scheduler-rag-ingest-{domain}-flow">
  <scheduler>
    <scheduling-strategy>
      <cron expression="${rag.ingest.cron.{domain}}" timeZone="UTC"/>
    </scheduling-strategy>
  </scheduler>

  <!-- 1. Read watermark -->
  <os:retrieve key="rag-{domain}-lastSync" target="lastSync"
    defaultValue="1970-01-01T00:00:00Z" objectStore="persistent-store"/>

  <!-- 2. Fetch changed documents since watermark -->
  <!-- Example: SharePoint delta query, S3 list by lastModified, Salesforce SOQL -->
  <flow-ref name="fetch-changed-{domain}-documents-subflow"/>

  <!-- 3. Process each document -->
  <foreach collection="#[payload]" counterVariableName="docIndex">
    <try>
      <flow-ref name="rag-process-document-subflow"/>
      <error-handler>
        <on-error-continue type="ANY">
          <logger level="WARN"
            message="#['RAG ingest failed for doc ' ++ payload.id ++ ': ' ++ error.description]"/>
        </on-error-continue>
      </error-handler>
    </try>
  </foreach>

  <!-- 4. Advance watermark -->
  <os:store key="rag-{domain}-lastSync"
    value="#[now() as String {format: &quot;yyyy-MM-dd'T'HH:mm:ss'Z'&quot;}]"
    objectStore="persistent-store"/>

  <error-handler ref="global-error-handler"/>
</flow>
```

### Document Processing Sub-flow (chunk → embed → upsert)

```xml
<sub-flow name="rag-process-document-subflow">
  <!-- 1. Extract text (handle PDF, DOCX, HTML, plain text) -->
  <flow-ref name="extract-document-text-subflow"/>

  <!-- 2. Chunk the text -->
  <ee:transform>
    <ee:set-variable variableName="chunks">
      <![CDATA[%dw 2.0
      output application/java
      var text        = payload.extractedText
      var chunkSize   = 512       // tokens (~400 words)
      var chunkOverlap = 64       // overlap for context continuity
      var words       = text splitBy " "
      ---
      // Simple word-based chunking; replace with semantic chunking for better results
      (0 to (floor(sizeOf(words) / (chunkSize - chunkOverlap)))) map (i) ->
        words[(i * (chunkSize - chunkOverlap)) to
              min(sizeOf(words) - 1, (i * (chunkSize - chunkOverlap)) + chunkSize - 1)]
        joinBy " "
      ]]>
    </ee:set-variable>
  </ee:transform>

  <!-- 3. For each chunk: embed + upsert -->
  <foreach collection="#[vars.chunks]" counterVariableName="chunkIndex">
    <!-- Generate embedding -->
    <http:request config-ref="OpenAI_Config"
      path="/embeddings" method="POST">
      <http:body><![CDATA[{
        "model": "${ai.embedding.model}",
        "input": #[payload]
      }]]></http:body>
    </http:request>

    <!-- Upsert to vector store with metadata -->
    <flow-ref name="upsert-vector-chunk-subflow"/>
  </foreach>
</sub-flow>
```

### Vector Upsert Sub-flow (Pinecone example)

```xml
<sub-flow name="upsert-vector-chunk-subflow">
  <!-- Build vector record with metadata for filtering -->
  <ee:transform>
    <ee:set-payload><![CDATA[%dw 2.0
    output application/json
    ---
    {
      vectors: [{
        id:     vars.document.id ++ "-chunk-" ++ vars.chunkIndex,
        values: payload.data[0].embedding,
        metadata: {
          documentId:  vars.document.id,
          source:      vars.document.source,
          title:       vars.document.title,
          chunkIndex:  vars.chunkIndex,
          chunkText:   vars.chunks[vars.chunkIndex - 1],
          lastUpdated: now() as String,
          domain:      "{domain}",
          embeddingModel: "${ai.embedding.model}"
        }
      }],
      namespace: "${pinecone.namespace.{domain}}"
    }]]>
    </ee:set-payload>
  </ee:transform>

  <http:request config-ref="Pinecone_Config"
    path="/vectors/upsert" method="POST"/>
</sub-flow>
```

---

## Chunking Strategy

Choice of chunking strategy significantly impacts retrieval quality:

| Strategy | Chunk size | Best for |
|----------|-----------|---------|
| Fixed-size (words) | 300–600 words | Simple; fast; adequate for most prose |
| Fixed-size (tokens) | 512–1024 tokens | Precise token budget control |
| Semantic (sentence/paragraph) | Variable | Better context preservation; needs NLP lib |
| Hierarchical (doc → section → paragraph) | Multi-level | Long docs; structured content |

Overlap: always use 10–15% overlap between chunks so context is not lost at chunk boundaries.

Store chunk text in vector metadata — never require a round-trip to the source doc at query time.

---

## Document Deletion / Update

When a source document is deleted or updated, old vectors must be removed:
- **Update:** delete all chunks for `documentId`, then re-ingest (upsert new chunks)
- **Delete:** delete all chunks for `documentId` from vector store

Deletion flow:
```xml
<flow name="rag-delete-{domain}-document-flow">
  <!-- Trigger: CDC event, webhook, or scheduler delta with deletedIds -->
  <!-- Delete all vectors where metadata.documentId = event.documentId -->
  <http:request config-ref="Pinecone_Config"
    path="/vectors/delete" method="POST">
    <http:body><![CDATA[{
      "filter": { "documentId": { "$eq": "#[payload.documentId]" } },
      "namespace": "${pinecone.namespace.{domain}}"
    }]]></http:body>
  </http:request>
</flow>
```

---

## Metadata Schema Standards

Every vector chunk must carry these metadata fields for reliable filtering:

```json
{
  "documentId":     "unique ID from source system",
  "source":         "sharepoint | s3 | salesforce-knowledge | servicenow",
  "title":          "human-readable document title",
  "chunkIndex":     0,
  "chunkText":      "the actual text of this chunk",
  "lastUpdated":    "ISO-8601 timestamp",
  "domain":         "hr | legal | product | support",
  "language":       "en",
  "embeddingModel": "text-embedding-3-small",
  "accessLevel":    "public | internal | confidential"
}
```

The `accessLevel` field is critical — retrieval must filter by access level to prevent
confidential documents from being surfaced to unauthorized users. Enforce this at the query
layer, not just ingestion.

---

## Error Handling

Strategy: **retry-then-dlq** (per document; continue on single-doc failure)

| Failure | Action |
|---------|--------|
| Text extraction fails (corrupt doc) | Log WARN; skip doc; continue pipeline |
| Embedding API timeout | Retry 3× exponential; then DLQ the chunk |
| Embedding API 429 (rate limit) | Retry exponential 5/15/45s; reduce batch size |
| Vector store write failure | Retry 3× exponential; then DLQ with chunk data |
| Watermark NOT advanced if full pipeline fails | Protects against data loss; safe to re-run |

---

## MUnit Test Coverage

Each RAG pipeline flow must have tests for:
- [ ] Happy path — document fetched → chunked → embedded → upserted to vector store
- [ ] Watermark advances after successful pipeline; stays on failure
- [ ] Document update — old vectors deleted; new chunks upserted
- [ ] Document deletion — all chunks for documentId removed from vector store
- [ ] Embedding API unavailable — retry fires; DLQ populated; pipeline continues with next doc
- [ ] Corrupt document (unextractable text) — skipped; pipeline continues

---

## Example Project

**Client:** Enterprise knowledge base — Confluence + SharePoint → Pinecone → Agentforce grounding
**Flows:** `scheduler-rag-ingest-knowledge-flow`, `rag-process-document-subflow`,
          `upsert-vector-chunk-subflow`, `rag-delete-knowledge-document-flow`
**Connectors:** `http` (Confluence API, SharePoint API, OpenAI embeddings, Pinecone),
               `salesforce` (Agentforce grounding verification)
**Secondary pattern:** `scheduled-sync` (watermark-based delta fetch from source systems)
**Security tier:** internal (embeddings API call — mask confidential fields before embedding)
**Deployment:** CloudHub 2.0, 0.2 vCores × 1 replica (low CPU; mostly I/O bound)
