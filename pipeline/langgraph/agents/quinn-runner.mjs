/**
 * Quinn multi-step runner — 12 parallel haiku sub-agents + deterministic merge.
 *
 * Architecture:
 *   - Orchestrator reads quinn-stage.json ONCE and injects into all sub-agents
 *   - Sub-agents run in PARALLEL (all have complete stage data):
 *       quinn-meta-biz  (haiku, $0.12): meta + bizContext
 *       quinn-s1        (haiku, $0.18): Section 1 — Use Cases HTML
 *       quinn-s2        (haiku, $0.15): Section 2 — Systems & Access HTML
 *       quinn-s3        (haiku, $0.12): Section 3 — Field Mapping HTML
 *       quinn-s4        (haiku, $0.08): Section 4 — Volume & Performance HTML
 *       quinn-s5        (haiku, $0.08): Section 5 — Security & Compliance HTML
 *       quinn-s6        (haiku, $0.07): Section 6 — Error Handling HTML
 *       quinn-s7        (haiku, $0.08): Section 7 — Deployment & DevOps HTML
 *       quinn-s8        (haiku, $0.06): Section 8 — Operations & Support HTML
 *       quinn-s9        (haiku, $0.08): Section 9 — Testing & Go-Live HTML
 *       quinn-s10       (haiku, $0.08): Section 10 — System-Specific Details HTML
 *       quinn-flags     (haiku, $0.08): internalFlags + pricingSummary HTML
 *   - Runner deterministically merges all 12 outputs into quinn.json
 *
 * Cost target: $0.65 (12 haiku calls, avg $0.054 each at 30k in / 2k out)
 * Orchestrator post-hook renderIntake() extracts intakeContent → intake-content.json → HTML
 * Agent boundary: sub-agents write ONLY via write_output → quinn.json
 *                 intake-content.json is written by orchestrate post-hook, NOT by Quinn
 */
import { runAgent, runSubStep, readStage } from '../agent-runner.mjs';
import { subagentCache }                  from './subagent-cache.mjs';
import { BANNED_PHRASES_INLINE }          from '../constants.mjs';

// ── HTML format reference injected into every sub-agent prompt ────────────────

const HTML_FORMAT = `\
HTML FORMAT — use these exact CSS class patterns:

SYSTEM SLUGS — derive from system name: lowercase, replace spaces/special chars with hyphens.
Examples: "HD Portal (Home Depot Service Center)" → "hd-portal-home-depot-service-center"
          "Salesforce" → "salesforce"
          "ComputerEase (Deltek)" → "computerease-deltek"
          "MuleSoft IDP" → "mulesoft-idp"

EVERY <div class='q'> MUST include data-sys listing the space-separated slugs of systems it touches:

BLANK QUESTION (client fills in):
<div class='q' data-sys="system-slug-a system-slug-b"><div class='q-num'>N</div><div class='q-body'><p class='q-text'>Question text</p><textarea class='answer' rows='2' placeholder='e.g. ...'></textarea></div></div>

PRE-FILLED QUESTION (evidence from stage — client confirms):
<div class='q' data-sys="system-slug"><div class='q-num'>N</div><div class='q-body'><p class='q-text'>Question text</p><textarea class='answer is-prefilled' rows='3'>Pre-filled answer — Confirm: ☐ Correct ☐ Correct it: ___</textarea></div></div>

CRITICAL/P0 QUESTION (MUST still have a pre-filled suggested answer — never blank):
<div class='q' data-sys="system-slug"><div class='q-num'>N</div><div class='q-body'><p class='q-text'><em>⚠️ CRITICAL:</em> Question text</p><textarea class='answer is-prefilled' rows='2'>⚠️ NEEDS CLIENT CONFIRMATION: best-guess suggested answer — Confirm: ☐ Correct ☐ Correct it: ___</textarea></div></div>

UC BLOCK (Use Case — Section 1 only) — questions inside UC blocks also need data-sys:
<details class='uc' open><summary class='uc-hd'><span class='uc-tag'>UC1</span><h3>UC Name (trigger)</h3><span class='uc-chevron'>▼</span></summary><div class='uc-body'>
<p class='uc-note'>source → target · entity · trigger details</p>
<div class='q' data-sys="source-slug target-slug">...</div>
<p class='q-hint'>→ See Section 3.N for the pre-filled UC1 field mapping table.</p>
<div class='scope-grid'>
<div class='scope-item scope-in'><span class='scope-label'>In Scope</span>specific action DataSkate performs</div>
<div class='scope-item scope-assumed'><span class='scope-label'>Assumes Pre-exists</span>what must already exist at go-live</div>
<div class='scope-item scope-out'><span class='scope-label'>Out of Scope</span>what DataSkate will NOT do</div>
</div>
</div></details>

TABLE (static — no client input):
<table class='dtbl'><thead><tr><th>Col</th></tr></thead><tbody><tr><td>value</td></tr></tbody></table>

TABLE ROW WITH CLIENT INPUT:
<tr><td><strong>System</strong></td><td><input class='tbl-ans is-prefilled' value='pre-filled'></td><td><input class='tbl-ans' placeholder='blank'></td><td><span class='status-badge status-pending'>Pending</span></td></tr>

STATUS BADGES: status-pending | status-blocked | status-ok

SUBSECTION HEADER (within a section): <h3>2.7 — Sub-section Title</h3>

TABLE HINT: <p class='tbl-hint'>Hint text here</p>
FIELD NOTE:  <p class='q-hint'>→ Cross-reference or annotation</p>`;

// ── Shared instruction suffix ─────────────────────────────────────────────────

const SHARED_SUFFIX = `\
ALL DATA IS INJECTED: STAGE_DATA above contains everything you need. Do NOT call read_stage (already injected). Do NOT call search_knowledge — use STAGE_DATA directly. Call write_output ONCE when your HTML is complete. No other tool calls.
AGGRESSIVE PRE-FILL — MANDATORY: Every <textarea class='answer'> MUST have content. NEVER produce an empty textarea. Rules by evidence level:
  • Strong evidence (explicitly in STAGE_DATA): pre-fill verbatim, add 'is-prefilled', label '— Confirm: ☐ Correct ☐ Correct it: ___'
  • Inferred/standard (industry pattern or DataSkate standard): pre-fill with label '⚠️ Assumed — confirm: ☐ Correct ☐ Correct it: ___'
  • Genuinely unknown (specific credentials, account IDs never captured): pre-fill 'DataSkate to receive during kickoff — contact [name from STAGE_DATA.namedContacts] to provide before dev begins. — Confirm: ☐ Correct ☐ Correct it: ___'
CRITICAL questions: pre-fill with suggested best-guess answer + ⚠️ NEEDS CLIENT CONFIRMATION prefix. Still pre-fill — do not leave blank.
TARGET: 90%+ of your <div class='q'> blocks should have class='answer is-prefilled' textareas. A blank textarea is a failure.
${BANNED_PHRASES_INLINE}
INTERNAL TAGS: NEVER embed [SYSTEM: X], [TRIGGERED BY: X], or [INFERRED] labels in client-facing question text.`;

// ── Sub-agent prompts ─────────────────────────────────────────────────────────

const META_BIZ_PROMPT = `\
You are quinn-meta-biz. Build the meta header and bizContext intro for the DataSkate intake portal.

STAGE_DATA:
{STAGE_JSON}

${HTML_FORMAT}

OUTPUT — call write_output with exactly:
{
  "meta": {
    "clientName": "Full client company name",
    "clientSlug": "slug",
    "eyebrow": "DataSkate × Client Name",
    "docTitle": "Integration Discovery Questionnaire",
    "docSubtitle": "N flows · System A + System B + ... · Most answers are pre-filled — please verify and correct",
    "date": "YYYY-MM-DD",
    "architect": "from STAGE_DATA._project.architect",
    "architectEmail": "from STAGE_DATA._project.architectEmail",
    "source": "N scoping calls (date range) — contact names"
  },
  "bizContext": {
    "snapshot": "Psychology-adapted welcome paragraph. Lead with primaryPainQuote verbatim (attributed lightly) if positive. End with what specifically stops on go-live day. Then bold line: 'Most answers in this form are already filled in from your scoping calls.' Use operational-pragmatist lens: make it concrete, not visionary.",
    "journeyCards": [
      {
        "phase": "phase-1",
        "label": "Phase 1 — Connected",
        "headline": "Specific systems become a single data path (name them)",
        "body": "<strong>Things that stop on go-live Monday:</strong> list each manual step by name (UC1, UC2, etc.)"
      },
      {
        "phase": "phase-2",
        "label": "Phase 2 — Automated",
        "headline": "Triggers replace human dispatch on every step between X and Y",
        "body": "Phase 2 potential flows from stage — name specific systems and data entities"
      },
      {
        "phase": "phase-3",
        "label": "Phase 3 — Agentic",
        "headline": "AI reads the data foundation Phase 1 built",
        "body": "If salesforceDetected: AgentForce reads the Salesforce objects Phase 1 established. Else: AI layer peers are using becomes available on the Phase 1 data model."
      }
    ],
    "p0Blockers": [
      {
        "title": "short label",
        "clientAction": "plain English — what client must do, no jargon. Lead with em dash. One paragraph.",
        "sectionRef": "section number where this blocker is addressed"
      }
    ]
  }
}

RULES:
- snapshot: use psychologyProfile.primaryProfile lens from STAGE_DATA. operational-pragmatist → end with specific manual steps that stop. visionary-strategic → end with AI future. roi-analytical → include cost/time anchor.
- Lead with a real quote from the client if you can infer one from confirmedFlows context. Single quotes, attributed lightly.
- journeyCards: ground in actual confirmedFlows and systems from STAGE_DATA. No generic language.
- p0Blockers: take from STAGE_DATA.p0Blockers[] — clientAction must be plain English a non-technical person can act on.
ALL DATA IS INJECTED in STAGE_DATA above. Call write_output ONCE with the complete JSON object. No other tool calls. No HTML question divs — this is metadata JSON only.`;

// S1 is split into s1a + s1b because 12 UC blocks exceed the 8K token limit.
// Each part gets half the confirmedFlows injected via stageSlice — the runner merges bodyHtml.

const S1A_PROMPT = `\
You are quinn-s1a. Write the FIRST PART of Section 1 — Use Cases & Integration Flows.

STAGE_DATA:
{STAGE_JSON}

${HTML_FORMAT}

OUTPUT — call write_output with exactly:
{
  "bodyHtml": "...complete HTML for this part..."
}

WRITE (in this order):
1. Two opening questions (use <div class='q'>):
   Q1: What business problem does this integration solve, in plain language? (pre-fill from stage)
   Q2: New integration, replacement, or enhancement? (pre-fill from stage)

2. One <details class='uc'> block per flow in STAGE_DATA.flo.confirmedFlows[] — ALL of them:
   - First UC: open=true, rest: closed
   - 2–3 questions specific to that UC
   - Scope boundary block (In Scope / Assumes Pre-exists / Out of Scope)
   - Field mapping cross-ref: <p class='q-hint'>→ See Section 3.N for the pre-filled UC field mapping table.</p>

SCOPE BOUNDARY RULES:
- In Scope: specific action DataSkate performs for this flow
- Assumes Pre-exists: pull from STAGE_DATA.vera.systemPrerequisites[] for systems in this flow
- Out of Scope: what DataSkate will NOT do. Marketing systems → add 'Campaign/Journey creation, email template design, send scheduling are out of scope.' ERP systems → 'Chart of accounts, GL mapping, tax configuration are out of scope.'

DO NOT write a potential flows table — that is in part B.
${SHARED_SUFFIX}`;

const S1B_PROMPT = `\
You are quinn-s1b. Write the SECOND PART of Section 1 — Use Cases & Integration Flows.

STAGE_DATA:
{STAGE_JSON}

${HTML_FORMAT}

OUTPUT — call write_output with exactly:
{
  "bodyHtml": "...complete HTML for this part..."
}

WRITE (in this order):
1. One <details class='uc'> block per flow in STAGE_DATA.flo.confirmedFlows[] — ALL of them (this is the second batch):
   - All UCs: closed (open=false — the first UC is already open in Part A)
   - 2–3 questions specific to that UC
   - Scope boundary block (In Scope / Assumes Pre-exists / Out of Scope)
   - Field mapping cross-ref: <p class='q-hint'>→ See Section 3.N for the pre-filled UC field mapping table.</p>

2. Potential Flows table:
   <h3>Potential Flows — Not Priced in This Proposal</h3>
   <table class='dtbl'><thead><tr><th>ID</th><th>Flow + Rationale</th><th>Priority</th><th>Scope Decision</th></tr></thead><tbody>
   One row per STAGE_DATA.flo.potentialFlows[]. Scope Decision cell: <input type='checkbox'> Add to scope
   </tbody></table>

SCOPE BOUNDARY RULES:
- In Scope: specific action DataSkate performs for this flow
- Assumes Pre-exists: pull from STAGE_DATA.vera.systemPrerequisites[] for systems in this flow
- Out of Scope: what DataSkate will NOT do.

${SHARED_SUFFIX}`;

const S2_PROMPT = `\
You are quinn-s2. Write Section 2 — Systems and Access for the DataSkate intake questionnaire.

STAGE_DATA:
{STAGE_JSON}

${HTML_FORMAT}

OUTPUT — call write_output with exactly:
{
  "section": { "id": "2", "title": "Systems and Access", "bodyHtml": "...complete HTML..." }
}

SECTION 2 STRUCTURE:
1. Base questions 6-11 (systems list, cloud/on-premise, API docs, existing ESB, Anypoint subscription, Exchange assets):
   - Pre-fill system list from STAGE_DATA.flo.confirmedFlows[] systems
   - Pre-fill cloud/on-premise from STAGE_DATA.rex.systemProfiles[].onPremise
   - Pre-fill API docs from STAGE_DATA.rex.systemProfiles[].sandboxAvailable

2. Admin ownership table (one row per system):
   Columns: System | Admin Owner (Name + Email) | API User Creator | Backup Admin | Env Available | Status
   Pre-fill from STAGE_DATA.sage.namedContacts[] matching each system.
   Mark P0 Blocked status for systems with p0Blockers in stage.

3. Subsection 2.7 — Credentials to Deliver Before Kickoff:
   <h3>2.7 — Credentials to Deliver Before Kickoff</h3>
   Table: System | What to deliver | How to deliver | Who delivers it | Status
   Rules per system:
   - Auth type from STAGE_DATA.rex.systemProfiles[].authMethod — do NOT ask what auth method, ask for specific values.
   - HD Portal API key → note clipboard-disabled confidential email delivery (hand-transcribe buffer 10-15 min).
   - ComputerEase CE Live Service URL → explicitly state: 'This is NOT the VM IP — it is the Deltek relay URL provided post-ticket.'
   - OAuth systems (Salesforce, IDP) → note Connected App creation as prerequisite, secure share for secrets.
   - Mark P0 Blocked status for any system with CE Live Service blocker still open.

4. One final blank question: 'After DataSkate receives credentials, we will run a live GET call to confirm real API field names — provide any test record IDs safe to query.'

${SHARED_SUFFIX}`;

const S3_PROMPT = `\
You are quinn-s3. Write Section 3 — Data and Field Mapping for the DataSkate intake questionnaire.

STAGE_DATA:
{STAGE_JSON}

${HTML_FORMAT}

OUTPUT — call write_output with exactly:
{
  "section": { "id": "3", "title": "Data and Field Mapping", "bodyHtml": "...complete HTML..." }
}

SECTION 3 STRUCTURE:
1. Intro hint: <div class='tbl-hint'>All tables below are pre-filled from DataSkate's platform knowledge and transcript evidence. ⚠️ CRITICAL items require client confirmation before development begins.</div>

2. Subsection 3.1 — External ID Fields (Idempotency Keys):
   Table: Entity | Source Key | Salesforce External ID Field | Target Key | Confirm?
   One row per key entity from confirmed flows. Pre-fill from STAGE_DATA.rex (systemProfiles, connectorRegistryStubs).

3. One subsection per confirmed flow (3.2, 3.3, ...):
   Header: <h3>3.N — UCN Field Mapping: Source → Target</h3>
   Hint about data source.
   Table: Source Field | Target Field | Notes
   Pre-fill from STAGE_DATA using canonical model knowledge + stage data for system fields.
   After table: 1 CRITICAL question — confirm field names are correct or flag differences.

FIELD MAPPING RULES:
- Use system-specific field names from STAGE_DATA.rex.systemProfiles[].
- Apply known patterns: idempotent upsert via External ID, polling watermark field, standard SF fields (FirstName, LastName, Phone, Email, Street, City, State, PostalCode).
- IDP flows: table shows extracted field → validation rule → applies to → states.
- Label unknown fields: 'Confirm CE API field name post-provisioning.'

${SHARED_SUFFIX}`;

const S4_PROMPT = `\
You are quinn-s4. Write Section 4 — Volume and Performance for the DataSkate intake questionnaire.

STAGE_DATA:
{STAGE_JSON}

${HTML_FORMAT}

OUTPUT — call write_output with exactly:
{
  "section": { "id": "4", "title": "Volume and Performance", "bodyHtml": "...complete HTML..." }
}

SECTION 4 QUESTIONS (base questions 23-27 + conditional):
Q1: Expected transaction volume per flow — per day / per week?
Q2: Peak load times and seasonal patterns?
Q3: Maximum acceptable latency per flow type?
Q4: Required uptime SLA?
Q5: Payload size range per flow?
Q6: On sync failure — resume from checkpoint or restart?
Q7: Worst-case record count per batch run if integration is offline for a weekend?

AGGRESSIVE PRE-FILL RULES for Section 4:
- Volume: infer from ARR, company size, industry norms, flow patterns. Always provide numeric range. Label: 'Inferred from company size/ARR — confirm.'
- Peak times: use industry patterns (K-12: summer, construction: spring/summer, retail: Q4).
- Latency: UC scheduling triggers → 10-15 min polling acceptable. Real-time event triggers → <60s. IDP flows → IDP P50/P99 latency from playbook.
- SLA: DataSkate standard 99.5% unless financial/medical.
- Payload: small JSON <1KB per record. PDFs: estimate MB range, flag IDP hard limits (50 pages, 10MB).
- Checkpoint: always pre-fill 'Resume from checkpoint — prevents re-processing.' DataSkate standard (FK-007).

${SHARED_SUFFIX}`;

const S5_PROMPT = `\
You are quinn-s5. Write Section 5 — Security and Compliance for the DataSkate intake questionnaire.

STAGE_DATA:
{STAGE_JSON}

${HTML_FORMAT}

OUTPUT — call write_output with exactly:
{
  "section": { "id": "5", "title": "Security and Compliance", "bodyHtml": "...complete HTML..." }
}

SECTION 5 QUESTIONS (base questions 28-31 + conditional compliance block):
Q1: Authentication method per system? (Pre-fill from STAGE_DATA.rex.systemProfiles[].authMethod — DO NOT ask what auth method, pre-fill and mark confirm)
Q2: PII or sensitive data transmitted?
Q3: Regulatory compliance requirements?
Q4: Data residency requirements?

SYSTEM-SPECIFIC AUTH PRE-FILL (one paragraph per system):
- Use authMethod from rex.systemProfiles[]. Never ask the client what auth method is used.
- HD Portal: API key delivery path details.
- Salesforce: JWT Bearer — Connected App prerequisite.
- ComputerEase: CE Live Service relay auth — note it comes post-Deltek-ticket.
- MuleSoft IDP: OAuth 2.0 client credentials, scope MUST BE EMPTY (not 'urn:anypoint:idp').

PII PRE-FILL: scan confirmed flows — if customer names/addresses/emails/financial data flow through any UC → pre-fill Yes with specific fields named.

COMPLIANCE PRE-FILL: use industry patterns. Construction/residential → no HIPAA/PCI/GDPR unless explicitly present. Note: if financial data (deposit amounts, contract prices) → 'standard data protection applies'.

DATA RESIDENCY: US Midwest clients → 'US East-1 region for US-only clients. DataSkate standard.'

CONDITIONAL QUESTIONS (if 'compliance/PII/HIPAA/GDPR/PCI' signals in stage):
Add full security block: specific PII fields, data classification, field-level encryption, audit trail, mTLS.

${SHARED_SUFFIX}`;

const S6_PROMPT = `\
You are quinn-s6. Write Section 6 — Error Handling for the DataSkate intake questionnaire.

STAGE_DATA:
{STAGE_JSON}

${HTML_FORMAT}

OUTPUT — call write_output with exactly:
{
  "section": { "id": "6", "title": "Error Handling", "bodyHtml": "...complete HTML..." }
}

SECTION 6 QUESTIONS (base questions 32-37):
Q1: Target system unavailable — retry/queue/fail?
Q2: Message expiry in retry queue?
Q3: Failure notification recipients and channel?
Q4: Zero data-loss or best-effort?
Q5: Idempotency requirement?
Q6: Rollback required for financial/provisioning/compliance flows?

AGGRESSIVE PRE-FILL — DataSkate standards (always apply):
Q1: 'Retry-then-DLQ: 3 retries with exponential backoff (30s → 2 min → 5 min). After 3 failures → Dead Letter Queue. DataSkate standard.'
Q2: '24 hours for operational events. 7 days for job-creation/financial-adjacent events. DataSkate standard.'
Q3: Named contacts from STAGE_DATA.sage.namedContacts[] — pre-fill primary operational contact. Always include DataSkate on-call (architect email from project).
Q4: Differentiate by flow — financial flows (job creation) → zero data-loss. Lead sync → best-effort (re-polled). Pre-fill based on confirmed flows.
Q5: 'Yes — idempotent upsert via External ID fields for all flows. DataSkate standard.'
Q6: For multi-write flows (job header + customer + worksheet): 'Partial retry acceptable — two-phase write with idempotency checks.' Full rollback rarely needed.

${SHARED_SUFFIX}`;

const S7_PROMPT = `\
You are quinn-s7. Write Section 7 — Deployment and DevOps for the DataSkate intake questionnaire.

STAGE_DATA:
{STAGE_JSON}

${HTML_FORMAT}

OUTPUT — call write_output with exactly:
{
  "section": { "id": "7", "title": "Deployment and DevOps", "bodyHtml": "...complete HTML..." }
}

SECTION 7 QUESTIONS (base questions 38-42):
Q1: Deployment model preference? (Pre-fill: 'MuleSoft CloudHub 2.0 — DataSkate IaaS standard')
Q2: Environments needed? (Pre-fill: 'Dev + UAT + Production. DataSkate standard.' Note any system with no sandbox.)
Q3: Network/firewall restrictions? (Pre-fill from STAGE_DATA.rex.systemProfiles[].onPremise — flag on-premise systems, static IP requirements, VM firewall details from stage)
Q4: CI/CD tools? (Pre-fill from stage signals — first engagement typically → 'None. DataSkate configures Maven + GitHub Actions.')
Q5: Secrets management? (Pre-fill: 'Anypoint Secrets Manager — CloudHub 2.0 built-in. DataSkate standard.')

Then: Access Chain Table — Credential Delivery Plan:
<h3>Access Chain — Credential Delivery Plan</h3>
Table: System | Admin Owner | API User Creator | Backup Admin | Vendor Support Login | Env Available | Status
Pre-fill from STAGE_DATA.sage.namedContacts[] per system. Mark SPOF for single admins.
Note HD Portal clipboard-disabled delivery. Note CE Live Service NOT the VM IP.
Add P0 Blocked status for systems blocking development (CE Live Service pending, etc.).

${SHARED_SUFFIX}`;

const S8_PROMPT = `\
You are quinn-s8. Write Section 8 — Operations and Support for the DataSkate intake questionnaire.

STAGE_DATA:
{STAGE_JSON}

${HTML_FORMAT}

OUTPUT — call write_output with exactly:
{
  "section": { "id": "8", "title": "Operations and Support", "bodyHtml": "...complete HTML..." }
}

SECTION 8 QUESTIONS (base questions 43-45):
Q1: Logging and monitoring tools?
Q2: Who owns post-go-live support?
Q3: Client-facing dashboard or audit trail needed post-go-live?

AGGRESSIVE PRE-FILL:
Q1: Check stage for any monitoring tools mentioned (Splunk, Datadog, etc.). If none → 'Anypoint Monitoring (DataSkate standard for all MuleSoft IaaS engagements). No client-side APM mentioned in scoping.'
Q2: Check if client has in-house MuleSoft developer from stage. If none → 'DataSkate (IaaS model — recommended). Client has no in-house MuleSoft developer.' Quote any transcript evidence of client stating they don't operate MuleSoft.
Q3: 'DataSkate standard IaaS monthly report (integrations processed, pass/fail rates, exceptions). No real-time dashboard scoped.'

${SHARED_SUFFIX}`;

const S9_PROMPT = `\
You are quinn-s9. Write Section 9 — Testing and Go-Live for the DataSkate intake questionnaire.

STAGE_DATA:
{STAGE_JSON}

${HTML_FORMAT}

OUTPUT — call write_output with exactly:
{
  "section": { "id": "9", "title": "Testing and Go-Live", "bodyHtml": "...complete HTML..." }
}

SECTION 9 QUESTIONS (base questions 46-49 + go-live scope decisions) — MAX 10 TOTAL:
Q1: Test environments available per system? — PRE-FILL per system from rex.systemProfiles[].sandboxAvailable. 'No sandbox' for on-premise. If unknown: 'TBD — DataSkate will confirm during kickoff credential delivery. — ⚠️ Assumed — confirm: ☐ Correct'
Q2: Automated testing capability? — ALWAYS PRE-FILL: 'None required from client — DataSkate writes MUnit tests for all flows as part of IaaS delivery. Client participates in manual UAT sign-off only. — Confirm: ☐ Correct ☐ Correct it: ___'
Q3: UAT acceptance criteria? — ALWAYS PRE-FILL: 'DataSkate standard: 5 test scenarios per flow (happy path + 2 error cases + boundary + volume). All must pass before production promotion. — Confirm: ☐ Correct ☐ Correct it: ___'
Q4: Blackout periods? — PRE-FILL from industry pattern: 'Construction: avoid spring ramp-up (March–May peak). Recommend go-live in January–February window. — ⚠️ Assumed — confirm: ☐ Correct ☐ Correct it: ___'
Q5: Timeline and hard deadlines? — PRE-FILL from STAGE_DATA._project.targetGoLive if set, else: '12–16 weeks from signed SOW. No hard deadline stated in scoping — confirm. — ⚠️ Assumed — confirm: ☐ Correct ☐ Correct it: ___'
Q6: Who signs off on go-live? — PRE-FILL from sage.namedContacts[]. If decision-maker role identified, name them. Else: 'Ashley (operations lead) + DataSkate architect (Raghuram Potluri). — Confirm: ☐ Correct ☐ Correct it: ___'

SCOPE DECISION QUESTIONS: Add 1 combined scope-decision question for ALL potential flows together (not one per flow) — stays within the 10-question cap:
'Phase 1 scope confirmation: below are potential flows not priced in this proposal — mark each: ☐ Add to Phase 1 ☐ Phase 2 ☐ Not now' with a multi-select pill block.

${SHARED_SUFFIX}`;

const S10_PROMPT = `\
You are quinn-s10. Write Section 10 — System-Specific Details for the DataSkate intake questionnaire.

STAGE_DATA:
{STAGE_JSON}

${HTML_FORMAT}

OUTPUT — call write_output with exactly:
{
  "section": { "id": "10", "title": "System-Specific Details", "bodyHtml": "...complete HTML..." }
}

SECTION 10 STRUCTURE:
One sub-section per confirmed system (max 3 questions per system):
  <h3>10.N — System Name</h3>

QUESTION SELECTION per system — MAX 3 per system, ALL pre-filled with suggested answers:
1. P0 blockers unresolved → top question (marked ⚠️ P0:) — PRE-FILL with current known status + what to do
2. Known gotchas from STAGE_DATA.rex.systemProfiles[].knownQuirks → one question, PRE-FILL with DataSkate best-guess
3. Auth credential specifics (SPECIFIC VALUES not type) — PRE-FILL: 'DataSkate to receive at kickoff — [contact name] to provide. — Confirm: ☐ Correct'

SYSTEM-SPECIFIC KNOWN GOTCHAS — ALWAYS PRE-FILL these (never leave blank):
- Salesforce: 'Org flags default assumed: Multi-currency = No, State/Country Picklists = No, Shared Activities = No. — ⚠️ Confirm each affects DWL transforms: ☐ Correct ☐ Correct it: ___'
- ComputerEase: 'CE Live Service ticket: [status from rex if known, else "not yet submitted — DataSkate to initiate"]. Backup super-admin: [name if known, else "Ashley to confirm backup"]. — ⚠️ Assumed — confirm: ☐ Correct'
- MuleSoft IDP: 'Confidence threshold set to 0.85 (DataSkate recommended). Manual review queue: [destination if known, else "Salesforce queue — to be created in UAT"]. IDP actions: starting fresh. — ⚠️ Assumed — confirm: ☐ Correct ☐ Correct it: ___'
- HD Portal: 'Write endpoints: POST /comments + PATCH /deposit-status (confirmed endpoints — verify with HD Portal developer). Developer login: DataSkate to request. — ⚠️ Assumed — confirm: ☐ Correct ☐ Correct it: ___'
- NetSuite: 'PS256 JWT certificate: assumed not yet generated — client IT to generate 3072-bit RSA before kickoff. — ⚠️ Needs client action'
- ServiceNow: 'Auth type: confirm API Bearer token (OAuth2 breaks metadata resolution in Studio — critical). — ⚠️ CRITICAL: confirm before dev'
- Oracle DB: 'ojdbc11.jar classpath: client IT team to own — confirm owner name before kickoff. — ⚠️ Needs client confirmation'

Questions must be max 3 per system. Prioritize hard blockers. Do NOT ask what auth method a system uses if rex.systemProfiles already has it.
CRITICAL: Every question in Section 10 MUST have a pre-filled textarea with is-prefilled class. No blank textareas.

${SHARED_SUFFIX}`;

const FLAGS_PROMPT = `\
You are quinn-flags. Write the Internal Flags and Pricing Summary sections for the DataSkate intake questionnaire.

STAGE_DATA:
{STAGE_JSON}

${HTML_FORMAT}

OUTPUT — call write_output with exactly:
{
  "internalFlags": {
    "bodyHtml": "...HTML..."
  },
  "pricingSummary": {
    "bodyHtml": "...HTML..."
  }
}

INTERNAL FLAGS — NEVER SEND TO CLIENT:
<p><strong>INTERNAL TECHNICAL FLAGS — DO NOT SEND TO CLIENT</strong></p>
<ol>
  One <li> per technical risk for the architect.
  Sources: STAGE_DATA.rex.p0Blockers[], rex.systemProfiles[].p0Risk, rex.internalFlags[], flo.p0Blockers[]
  Each flag: short title (bold) + technical detail. Include: P0 blockers, single admin SPOFs, production-only API constraints, IDP scope rules, external ID requirements, unresolved ambiguities.
</ol>

PRICING SUMMARY — INTERNAL ONLY — DO NOT SEND TO CLIENT:
<p><strong>PRICING SUMMARY — INTERNAL ONLY — DO NOT SEND TO CLIENT</strong></p>
<p><em>Sourced from flo.json pricing object — do NOT recalculate. These figures are locked from Flo's output.</em></p>
Table: Item | Value | Notes
Pull ALL values verbatim from STAGE_DATA.flo.pricing:
- flowCount, recommendedModel, kickoffRetainer, implementationFee, timeline
- period1RatePerFlowPerMonth, period1Payment, period2Rate, period2Payment
- yearOneManagedTotal, twoYearManagedTotal, implementationOnlyAlternative
After table: IaaS vs Implementation-Only delta paragraph from stage.pricing.rationale (verbatim if present).
Edge case paragraph about flow count expansion if potentialFlows are promoted.

${SHARED_SUFFIX}`;

const QUINN_SUB_INSTRUCTION = `All data is injected in your system prompt — do NOT call read_stage or search_knowledge. Generate your complete HTML output and call write_output once. No other tool calls.`;

// ── Count HTML questions (for questionnaire stats) ────────────────────────────

function countQuestions(html) {
  if (typeof html !== 'string') return { total: 0, prefilled: 0, blank: 0 };
  const totalMatches = html.match(/<div class='q'[ >]/g) || [];
  const prefilledMatches = html.match(/class='answer is-prefilled'/g) || [];
  const blankTextareas = html.match(/<textarea class='answer'[^>]*>\s*<\/textarea>/g) || [];
  const total = totalMatches.length;
  const prefilled = prefilledMatches.length;
  return { total, prefilled, blank: total - prefilled, blankTextareas: blankTextareas.length };
}

// ── Sub-agent cache — persists successful results across re-runs ──────────────
// Stored at projects/{client}/scoping/run/quinn-subagent-cache.json
// Only successful (non-killed) outputs are cached.
// Cache is cleared when all 12 sub-agents succeed.

// ── Main runner ───────────────────────────────────────────────────────────────

export async function runQuinn({ agentDef, clientSlug, mcpClient }) {
  // Read stage data ONCE — inject into all sub-agents
  const stageData = await readStage(mcpClient, 'quinn');

  // Split confirmedFlows in half so each S1 sub-agent stays under 8K tokens
  // Stage is now flat canonical data from company_context.json + project.json.
  // No agent-keyed nesting — reference stageData.confirmedFlows, stageData.namedContacts, etc.
  const allFlows  = stageData.confirmedFlows || [];
  const half      = Math.ceil(allFlows.length / 2);
  const s1aFlows  = allFlows.slice(0, half);
  const s1bFlows  = allFlows.slice(half);

  const s1aStage = {
    confirmedFlows:      s1aFlows,
    potentialFlows:      [],
    systemPrerequisites: stageData.systemPrerequisites,
    psychologyProfile:   stageData.psychologyProfile,
    namedContacts:       stageData.namedContacts,
    architect:           stageData.architect,
    displayName:         stageData.displayName,
  };
  const s1bStage = {
    confirmedFlows:      s1bFlows,
    potentialFlows:      stageData.potentialFlows,
    systemPrerequisites: stageData.systemPrerequisites,
    architect:           stageData.architect,
    displayName:         stageData.displayName,
  };

  // Per-section stage slices — each sub-agent gets only what it needs.
  // All fields reference the flat canonical structure (company_context + project.json).
  const stageSlices = {
    'quinn-meta-biz': { ...stageData },
    'quinn-s1a':   s1aStage,
    'quinn-s1b':   s1bStage,
    'quinn-s2':    { confirmedFlows: stageData.confirmedFlows, p0Blockers: stageData.p0Blockers, namedContacts: stageData.namedContacts, systemPrerequisites: stageData.systemPrerequisites },
    'quinn-s3':    { confirmedFlows: stageData.confirmedFlows, systemPrerequisites: stageData.systemPrerequisites, architect: stageData.architect, displayName: stageData.displayName },
    'quinn-s4':    { confirmedFlows: stageData.confirmedFlows, snapshot: stageData.snapshot },
    'quinn-s5':    { systemPrerequisites: stageData.systemPrerequisites, systemFindings: stageData.systemFindings, confirmedFlows: stageData.confirmedFlows },
    'quinn-s6':    { confirmedFlows: stageData.confirmedFlows, namedContacts: stageData.namedContacts, architect: stageData.architect },
    'quinn-s7':    { systemPrerequisites: stageData.systemPrerequisites, p0Blockers: stageData.p0Blockers, namedContacts: stageData.namedContacts },
    'quinn-s8':    { namedContacts: stageData.namedContacts, snapshot: stageData.snapshot },
    'quinn-s9':    { confirmedFlows: stageData.confirmedFlows, potentialFlows: stageData.potentialFlows, systemPrerequisites: stageData.systemPrerequisites, namedContacts: stageData.namedContacts, architect: stageData.architect },
    'quinn-s10':   { systemPrerequisites: stageData.systemPrerequisites, systemFindings: stageData.systemFindings, confirmedFlows: stageData.confirmedFlows, p0Blockers: stageData.p0Blockers },
    'quinn-flags': { systemFindings: stageData.systemFindings, confirmedFlows: stageData.confirmedFlows, p0Blockers: stageData.p0Blockers, pricingComputed: stageData.pricingComputed },
  };

  const STEPS = [
    { name: 'quinn-meta-biz', tier: 'extractor', prompt: META_BIZ_PROMPT,  ceiling: 0.13 },
    { name: 'quinn-s1a', tier: 'writer', prompt: S1A_PROMPT, ceiling: 0.35, maxTokens: 16000 },
    { name: 'quinn-s1b', tier: 'writer', prompt: S1B_PROMPT, ceiling: 0.30, maxTokens: 16000 },
    { name: 'quinn-s2',  tier: 'extractor', prompt: S2_PROMPT,  ceiling: 0.22 },
    { name: 'quinn-s3',  tier: 'writer', prompt: S3_PROMPT,  ceiling: 0.50, maxTokens: 16000 },
    { name: 'quinn-s4',  tier: 'extractor', prompt: S4_PROMPT,  ceiling: 0.09 },
    { name: 'quinn-s5',  tier: 'extractor', prompt: S5_PROMPT,  ceiling: 0.12 },
    { name: 'quinn-s6',  tier: 'extractor', prompt: S6_PROMPT,  ceiling: 0.08 },
    { name: 'quinn-s7',  tier: 'extractor', prompt: S7_PROMPT,  ceiling: 0.12 },
    { name: 'quinn-s8',  tier: 'extractor', prompt: S8_PROMPT,  ceiling: 0.07 },
    { name: 'quinn-s9',  tier: 'extractor', prompt: S9_PROMPT,  ceiling: 0.14 },
    { name: 'quinn-s10', tier: 'extractor', prompt: S10_PROMPT, ceiling: 0.10 },
    { name: 'quinn-flags', tier: 'extractor', prompt: FLAGS_PROMPT, ceiling: 0.09 },
  ];

  const cache = subagentCache(clientSlug, 'quinn');
  const stepNames = STEPS.map(s => s.name);
  const nCached = cache.cachedCount(stepNames);
  if (nCached > 0) {
    console.log(`    [quinn] ${nCached} sub-agents from cache, ${STEPS.length - nCached} to run`);
  } else {
    console.log(`    [quinn] running all ${STEPS.length} sub-agents in PARALLEL`);
  }

  const results = await Promise.all(STEPS.map(step =>
    cache.runOrLoad(step.name, () => runSubStep({
      agentSlug: 'quinn', name: step.name, model: step.tier,
      prompt: step.prompt.replace('{STAGE_JSON}', JSON.stringify(stageSlices[step.name], null, 2)),
      ceiling: step.ceiling, agentDef, clientSlug, mcpClient,
      userInstruction: QUINN_SUB_INSTRUCTION,
      forceSingleTurn: true,
      maxTokens: step.maxTokens || 8192,
    }), `${step.name} (${step.tier}, $${step.ceiling})`)
  ));

  const totalCost = results.reduce((sum, r) => sum + r.cost, 0);
  cache.clearIfAllSucceeded(results);

  // Extract outputs — 13 steps: meta, s1a, s1b, s2, s3, s4, s5, s6, s7, s8, s9, s10, flags
  // If a split sub-agent (s1a/s1b) returns a raw HTML string instead of {bodyHtml}, wrap it.
  const normalizeS1 = (r) => {
    if (typeof r.output === 'string' && r.output.length > 0) return { bodyHtml: r.output };
    if (r.output && typeof r.output === 'object' && Object.keys(r.output).length > 0) return r.output;
    return {};
  };
  const normalizeSection = (r) =>
    (r.output && typeof r.output === 'object' && Object.keys(r.output).length > 0) ? r.output : {};

  const [metaBiz, _s1a, _s1b, s2, s3, s4, s5, s6, s7, s8, s9, s10, flags] = results.map(normalizeSection);
  const s1a = normalizeS1(results[1]);
  const s1b = normalizeS1(results[2]);

  // Merge s1a + s1b into a single section 1.
  // S1A/B output { bodyHtml: "..." } directly (no section wrapper) since they're split parts.
  const s1aHtml = s1a?.bodyHtml || s1a?.section?.bodyHtml || '';
  const s1bHtml = s1b?.bodyHtml || s1b?.section?.bodyHtml || '';
  const s1Combined = (s1aHtml || s1bHtml)
    ? { id: '1', title: 'Use Cases & Integration Flows', bodyHtml: s1aHtml + '\n' + s1bHtml }
    : null;

  // Merge sections — accept three formats Haiku may return:
  //   1. { section: { id, title, bodyHtml } }   (canonical)
  //   2. { sections: [{ id, title, bodyHtml }] } (haiku plural drift)
  //   3. { id, title, bodyHtml }                 (bare — haiku skips wrapper)
  const sectionOutputs = [s1Combined ? { id: '1', title: 'Use Cases & Integration Flows', bodyHtml: s1Combined.bodyHtml } : null, s2, s3, s4, s5, s6, s7, s8, s9, s10];
  const sections = sectionOutputs
    .map(s => {
      if (!s || typeof s !== 'object') return null;
      if (s.section && s.section.id) return s.section;
      if (Array.isArray(s.sections) && s.sections[0]?.id) return s.sections[0];
      if (s.id && s.bodyHtml) return s;  // bare format
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => Number(a.id) - Number(b.id));

  // Compute questionnaire stats
  let totalQ = 0, prefilledQ = 0, blankQ = 0;
  for (const section of sections) {
    const counts = countQuestions(section.bodyHtml || '');
    totalQ += counts.total;
    prefilledQ += counts.prefilled;
    blankQ += counts.blank;
  }

  // Derive systems array from confirmed flows for tab filtering
  const confirmedFlows = stageData.flo?.confirmedFlows || [];
  const systemNames = new Set();
  confirmedFlows.forEach(f => {
    if (f.source) systemNames.add(f.source);
    if (f.target) systemNames.add(f.target);
    (f.systems || []).forEach(s => systemNames.add(s));
  });
  const systems = [...systemNames]
    .filter(n => n && n.length > 1)
    .map(name => ({
      id:   name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, ''),
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, ''),
    }));

  // Assemble intakeContent
  const intakeContent = {
    meta:          metaBiz.meta      || {},
    bizContext:    metaBiz.bizContext || {},
    systems,
    sections,
    internalFlags: flags.internalFlags  || { bodyHtml: '' },
    pricingSummary: flags.pricingSummary || { bodyHtml: '' },
  };

  const hasContent = sections.length > 0 && (intakeContent.meta.clientName || intakeContent.bizContext.snapshot);

  const quinn = {
    status:      'complete',
    client:      clientSlug,
    generatedAt: new Date().toISOString(),
    questionnaire: {
      sections:         sections.length,
      totalQuestions:   totalQ,
      preFilled:        prefilledQ,
      blankForClient:   blankQ,
      fieldMappingFlows: sections.filter(s => s.id === '3').length,
      openItems:        [],
    },
    intakeContent,
    knowledgeWritebacks: [],
    contextUpdates: {
      p0Blockers:     null,
      systemFindings: [],
      aiJourney:      null,
    },
  };

  return { cost: totalCost, killed: !hasContent, output: hasContent ? quinn : null };
}
