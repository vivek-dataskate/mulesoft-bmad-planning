/**
 * Sage multi-step runner — 4 parallel haiku sub-agents for document analysis.
 *
 * Architecture:
 *   - Orchestrator reads scoping files via MCP tools (list + read)
 *   - Phase 1 (sequential): sage-systems — sage-flows needs its output for cross-reference
 *       sage-systems    (haiku, $0.10): systems, signals, system findings, P0 flags, business context
 *   - Phase 2 (parallel): remaining 3 sub-agents, sage-flows receives real systems output
 *       sage-flows      (haiku, $0.10): confirmed flows, potential flows, entity taxonomy
 *       sage-intel      (haiku, $0.08): named contacts (with access chain), quotes, sentiment phrases
 *       sage-knowledge  (haiku, $0.08): architect knowledge extraction, question gaps, decision log
 *   - Runner merges all 4 outputs into sage.json + sage-decisions.json
 *
 * Cost target: $0.36 (4 haiku calls at ~$0.09 each)
 * Sage is first agent — reads raw scoping files, transcripts, documents.
 * All other agents read sage.json downstream.
 *
 * Agent boundary: sub-agents write ONLY via write_output → sage.json
 *                 sage-decisions.json is merged/written by runner
 */
import { createRequire } from 'module';
import { fileURLToPath }  from 'url';
import path               from 'path';
import fs                 from 'fs';
import { runAgent, runSubStep } from '../agent-runner.mjs';
import { subagentCache }  from './subagent-cache.mjs';

const require = createRequire(import.meta.url);
const ROOT    = path.resolve(fileURLToPath(import.meta.url), '../../../..');

// ── Sub-agent prompts ─────────────────────────────────────────────────────────

const SYSTEMS_PROMPT = `\
You are sage-systems. Extract systems, signals, system findings (transcript-stated facts), P0 flags, and business context from scoping documents.

SCOPING_TEXT (all raw scoping files concatenated):
{SCOPING_TEXT}

CONNECTOR_NAMES (for key resolution):
{CONNECTOR_NAMES}

WORKFLOW:
1. SYSTEM EXTRACTION (Pass 1 & 2):
   - Explicit: every named system, tool, platform, vendor mentioned explicitly.
   - Inferred: every category reference ('our CRM', 'the accounting system', 'their legacy ERP').
   - For each: capture exact phrase and classify as explicit or inferred.
   - Cross-reference each system against CONNECTOR_NAMES to find connectorKey.
   - If no match: set connectorKey to null and flag for vera research.

2. SIGNAL SCAN:
   Scan for conditional pipeline triggers — capture exact phrase (not paraphrase):
   - migration / replace / legacy ESB
   - real-time / immediate / synchronous / user-facing
   - batch / nightly / scheduled / bulk / historical
   - file / SFTP / FTP / S3 / CSV / Excel
   - compliance / PII / HIPAA / GDPR / PCI / SOX
   - Kafka / streaming / event stream / data lake
   - AI / LLM / ChatGPT / OpenAI / Anthropic
   - EDI / AS2 / X12 / EDIFACT / trading partner
   - on-premise / on our server / on our VM / thick-client
   - sandbox / no sandbox / production-only

3. SYSTEM FINDINGS (transcript-stated facts only):
   For each system: scan transcripts for explicit statements about technical behavior.
   Capture: auth method if stated, API style if stated, version if stated, sandbox availability,
   known limitations mentioned. Each finding needs: system, finding, confidence (high|medium|low),
   sourceQuote (exact transcript text). Do NOT infer beyond explicit statements.

4. P0 FLAG IDENTIFICATION:
   Apply known gotcha rules to every system:
   - NetSuite → REST API requires PS256 JWT via Java helper — P0 if REST needed
   - SAP → Requires SAP JCo connector license — P0 if license not confirmed
   - ComputerEase/Deltek → CE Live Service relay; vendor ticket required; sandbox no API — P0
   - Oracle DB → ojdbc11.jar cannot be in pom.xml — P0 if Oracle DB detected
   - File/SFTP/S3 → CloudHub 2.0 filesystem ephemeral — P0 if local file assumed
   - EDI/AS2/X12 → Requires B2B EDI connector, ACK/NACK, partner registry — P0 if EDI detected
   - Salesforce → SOQL OFFSET limit >2000 rows; State/Country Picklists; multi-currency
   - ServiceNow → OAuth 2.0 breaks metadata resolution in Anypoint Studio
   - Kafka → Replay/rewind requires Kafka not Anypoint MQ — flag if replay mentioned
   - Any on-premise/VM → firewall rules, static vs ephemeral IP, DNS — P0 if not confirmed
   Write all triggered flags with: system, gotcha, severity (P0|flag), clientAction, architectNote.

5. BUSINESS CONTEXT:
   From documents: company description (2-3 sentences), industry (inferred), engagement type
   (new-integration|migration|enhancement|unknown), go-live urgency (hard deadline | soft target | TBD),
   go-live date (if stated), budget signals (any figures or envelope mentions).

OUTPUT — call write_output with exactly:
{
  "systems": [
    {
      "name": "{system name as stated}",
      "connectorKey": "{matched key or null}",
      "inferenceType": "explicit | inferred",
      "inferencePhrase": "{exact quote or null if explicit}",
      "role": "source | target | both | unknown",
      "instanceNote": "{e.g. 'Store 1' if multiple instances — null if single}"
    }
  ],
  "signals": [
    {
      "signal": "{signal keyword}",
      "triggerPhrase": "{exact quote}",
      "questionSet": "{which conditional Qs this unlocks}"
    }
  ],
  "systemFindings": [
    {
      "system": "{system name}",
      "connectorKey": "{key or null}",
      "finding": "{fact stated explicitly}",
      "confidence": "high | medium | low",
      "sourceQuote": "{exact transcript quote}"
    }
  ],
  "p0Flags": [
    {
      "system": "{system name}",
      "gotcha": "{gotcha rule that triggered}",
      "severity": "P0 | flag",
      "clientAction": "{plain English — no jargon}",
      "architectNote": "{technical detail}"
    }
  ],
  "businessContext": {
    "companyDescription": "2-3 sentences or null",
    "industry": "inferred vertical or null",
    "engagementType": "new-integration | migration | enhancement | unknown",
    "goLiveUrgency": "hard deadline stated | soft target | TBD | not mentioned",
    "goLiveDate": "{ISO date or null}",
    "budgetSignals": "any figures/envelope signals or null"
  }
}

Call write_output exactly once when all steps are complete.`;

const FLOWS_PROMPT = `\
You are sage-flows. Extract confirmed flows, potential flows, and entity taxonomy from scoping documents.

SCOPING_TEXT (all raw scoping files concatenated):
{SCOPING_TEXT}

SAGE_SYSTEMS (systems extracted by sage-systems):
{SAGE_SYSTEMS_JSON}

WORKFLOW:
1. CONFIRMED FLOWS:
   For each pair of systems mentioned: what data moves between them? What triggers it? What entity?
   Apply NO-COMBINE: each system instance = one separate flow. Two Shopify stores = two flows.
   Classify as confirmed (explicit statement) or potential (implied/partial).

2. ENTITY TAXONOMY:
   For each confirmed flow, enumerate which entity categories apply:
   - master data: Customers, Accounts, Products, Vendors, Members
   - transactional: Orders, Invoices, Payments, Contracts, Purchase Orders
   - operational: Work Orders, Cases, Tasks, Tickets, Inventory moves
   - analytical: Reports, Utilization, KPIs, Audit logs

3. POTENTIAL FLOWS:
   For each system pair NOT mentioned: if logically implied by systems + vertical, flag as potential.
   For each potential: capture entity category, rationale (why likely), and evidence (what would confirm it).
   Cap potentialFlows at 3 — pick most likely gaps only.

OUTPUT — call write_output with exactly:
{
  "confirmedFlows": [
    {
      "id": "UC{N}",
      "systems": ["{source}", "{target}"],
      "direction": "{source} → {target}",
      "entity": "{primary entity}",
      "trigger": "event-driven | scheduled | manual | webhook | unknown",
      "triggerDetail": "{exact trigger phrase or null}",
      "evidence": "{exact quote from transcript that established this flow}"
    }
  ],
  "potentialFlows": [
    {
      "id": "UC{N}-potential",
      "systems": ["{A}", "{B}"],
      "entity": "{entity}",
      "rationale": "{why this gap is likely}",
      "promotionEvidence": "{what would confirm it}"
    }
  ]
}

Call write_output exactly once when done.`;

const INTEL_PROMPT = `\
You are sage-intel. Extract named contacts (with access chain), business quotes, and sentiment phrases from scoping documents.

SCOPING_TEXT (all raw scoping files concatenated):
{SCOPING_TEXT}

WORKFLOW:
1. NAMED CONTACTS:
   Extract every named person mentioned in transcripts.
   For each: full name, job title/role as stated, email (if given), systems they own/administer,
   responsibilities (e.g. 'Salesforce admin', 'UAT sign-off', 'OAuth consent owner', 'firewall contact',
   'budget approver', 'go-live decision maker').
   ACCESS CHAIN: for each system they administer, capture:
   - isSystemAdmin (boolean or null if not stated)
   - createsApiUsers (boolean or null if not stated)
   - ownsVendorSupportLogin (boolean or null if not stated)
   - isBackupAdmin (boolean or null if not stated)

2. PAIN POINTS + QUOTES:
   Extract verbatim quotes describing pain, friction, manual work, failed attempts, deadlines.
   Identify: primaryPainQuote (single most vivid quote), aspirationQuote (single most forward-looking quote — null if not stated).

3. SENTIMENT PHRASES:
   Capture skepticismSignals (phrases expressing doubt, past failure, caution).
   Capture excitementPhrases (phrases expressing enthusiasm or forward-looking energy).

OUTPUT — call write_output with exactly:
{
  "namedContacts": [
    {
      "name": "{Full Name}",
      "title": "{role as stated}",
      "email": "{email or null}",
      "systems": ["{system they own}"],
      "responsibilities": ["{e.g. 'Salesforce admin', 'UAT sign-off'}"],
      "accessChain": {
        "isSystemAdmin": "true | false | null",
        "createsApiUsers": "true | false | null",
        "ownsVendorSupportLogin": "true | false | null",
        "isBackupAdmin": "true | false | null"
      }
    }
  ],
  "quotes": {
    "primaryPainQuote": "{verbatim — null if not found}",
    "aspirationQuote": "{verbatim — null if not found}",
    "skepticismSignals": ["{phrase1}", "{phrase2}"],
    "excitementPhrases": ["{phrase1}"]
  }
}

Call write_output exactly once when done.`;

const KNOWLEDGE_PROMPT = `\
You are sage-knowledge. Extract architect knowledge contributions and question gaps from DataSkate team members' statements.

SCOPING_TEXT (all raw scoping files concatenated):
{SCOPING_TEXT}

WORKFLOW:
1. ARCHITECT KNOWLEDGE EXTRACTION:
   Scan transcripts for contributions from DataSkate team members: Raghuram Potluri, Kailash Chanda.
   Trigger phrases: 'I was researching', 'I found out', 'this is a little bit different', 'this is a poor practice',
   'there is one service called', 'I was thinking', 'one thing I noticed'.

   For each finding, classify as:
   (a) System-specific quirk → write to mulesoft/playbooks/{system}/{system}_playbook.json under Known Quirks
   (b) Verified cross-project fact → write to pipeline/FIELD_KNOWLEDGE.md as FK-NNN observation (status=observation)
   (c) Critical cross-engagement note → write to pipeline/PLANNING_CONTEXT.md Critical Notes

   Always cite: 'Source: {client} transcript, {date} — {architect name}'.

2. QUESTION GAP ANALYSIS:
   Extract every question asked by DataSkate speakers across all transcripts.
   For each: identify priority order (what they ask first), framing style, gap type (base|conditional-signal|system-gotcha|protocol).
   These are proposals for human review only — never auto-edit agent toml.

3. DECISION LOGGING:
   Log every classification decision. A decision is any point where Sage chose one path:
   confirmed vs potential flow, explicit vs inferred system, P0 vs flag severity, FK entry written vs skipped.
   Structure: { id, step, type, decision (one sentence), rationale (1-2 sentences), evidence (exact quote) }

OUTPUT — call write_output with exactly:
{
  "architectKnowledge": [
    {
      "speaker": "{Raghuram Potluri | Kailash Chanda}",
      "finding": "{what they said}",
      "system": "{system this applies to or null}",
      "classification": "system-quirk | cross-project-fact | critical-note",
      "destinationPath": "{system}_playbook.json | FIELD_KNOWLEDGE.md | PLANNING_CONTEXT.md"
    }
  ],
  "questionGaps": [
    {
      "question": "{exact question asked by DataSkate speaker}",
      "type": "base | conditional-signal | system-gotcha | protocol",
      "priority": "first-asked | follow-up | late-stage"
    }
  ],
  "decisions": [
    {
      "id": "SD-{N}",
      "type": "flow-classification | system-inference | p0-flag | knowledge-write",
      "decision": "{one sentence}",
      "rationale": "{1-2 sentences — what evidence drove it}",
      "evidence": "{exact quote or rule that triggered}"
    }
  ]
}

Call write_output exactly once when done.`;

const SAGE_SUB_INSTRUCTION = `All required data is already in the system prompt above. Do NOT call search_knowledge, read_stage, lookup_connectors, or any other tool. Process the text in the system prompt directly. In your FIRST response, call write_output once with your complete analysis — every field populated. If you cannot finish all steps, include partial results rather than calling any intermediate tools.`;

// ── Read scoping files via MCP ────────────────────────────────────────────────

async function readScopingText(mcpClient) {
  try {
    const response = await mcpClient.callTool('list_scoping_files', {});
    // MCP returns plain text list like "Text files in projects/peerless/scoping/:\n  file1.txt\n  file2.txt"
    const lines = response.split('\n').slice(1); // skip header line
    const filenames = lines
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('ERROR'));

    const textChunks = [];
    for (const filename of filenames) {
      try {
        const content = await mcpClient.callTool('read_scoping_file', { filename });
        textChunks.push(`=== ${filename} ===\n${content}`);
      } catch (e) {
        console.log(`    [sage] WARNING: could not read ${filename} — ${e.message}`);
      }
    }

    return textChunks.join('\n\n');
  } catch (e) {
    console.log(`    [sage] WARNING: could not list scoping files — ${e.message}`);
    return '';
  }
}

// ── Main runner ───────────────────────────────────────────────────────────────

export async function runSage({ agentDef, clientSlug, mcpClient }) {
  const projectDir = path.join(ROOT, 'projects', clientSlug);

  // Read scoping files ONCE
  console.log(`    [sage] reading scoping files...`);
  const scopingText = await readScopingText(mcpClient);
  if (!scopingText || scopingText.length < 100) {
    return {
      cost: 0,
      killed: true,
      output: {
        status: 'invalid',
        reason: 'No scoping files found or files too small. Drop content and re-run.',
      },
    };
  }

  // Read connector-names for sage-systems
  let connectorNames = {};
  try {
    const raw = fs.readFileSync(path.join(ROOT, 'mulesoft', 'connector-names.json'), 'utf8');
    connectorNames = JSON.parse(raw);
  } catch {
    console.log(`    [sage] WARNING: connector-names.json not found`);
  }

  const connectorJson = JSON.stringify(connectorNames, null, 2);

  const cache = subagentCache(clientSlug, 'sage');

  // Phase 1: sage-systems runs first — sage-flows needs its output for cross-reference
  console.log(`    [sage] sage-systems (haiku, $0.10) — sequential, blocks sage-flows injection`);
  const systemsResult = await cache.runOrLoad(
    'sage-systems',
    () => runSubStep({
      agentSlug: 'sage', name: 'sage-systems', model: 'extractor',
      prompt: SYSTEMS_PROMPT
        .replace('{SCOPING_TEXT}', scopingText)
        .replace('{CONNECTOR_NAMES}', connectorJson),
      ceiling: 0.10,
      agentDef, clientSlug, mcpClient,
      userInstruction: SAGE_SUB_INSTRUCTION,
      forceSingleTurn: true,
    }),
    'sage-systems',
  );

  // Hard stop — sage-systems is the foundation. If it fails, continuing produces garbage output.
  if (systemsResult.killed || !systemsResult.output || Object.keys(systemsResult.output).length === 0) {
    throw new Error(
      `PIPELINE_ABORT: sage-systems failed to produce output (cost $${systemsResult.cost.toFixed(4)}). ` +
      `Check scoping files exist and are readable. Re-run after fixing inputs.`
    );
  }

  const systemsOut = systemsResult.output;

  // Phase 2: sage-flows (receives real systems output) + sage-intel + sage-knowledge in parallel
  console.log(`    [sage] 3 sub-agents in PARALLEL (sage-flows, sage-intel, sage-knowledge)`);
  const [flowsResult, intelResult, knowledgeResult] = await Promise.all([
    cache.runOrLoad(
      'sage-flows',
      () => runSubStep({
        agentSlug: 'sage', name: 'sage-flows', model: 'extractor',
        prompt: FLOWS_PROMPT
          .replace('{SCOPING_TEXT}', scopingText)
          .replace('{SAGE_SYSTEMS_JSON}', JSON.stringify(systemsOut, null, 2)),
        ceiling: 0.10,
        agentDef, clientSlug, mcpClient,
        userInstruction: SAGE_SUB_INSTRUCTION,
        forceSingleTurn: true,
      }),
      'sage-flows',
    ),
    cache.runOrLoad(
      'sage-intel',
      () => runSubStep({
        agentSlug: 'sage', name: 'sage-intel', model: 'extractor',
        prompt: INTEL_PROMPT.replace('{SCOPING_TEXT}', scopingText),
        ceiling: 0.08,
        agentDef, clientSlug, mcpClient,
        userInstruction: SAGE_SUB_INSTRUCTION,
        forceSingleTurn: true,
      }),
      'sage-intel',
    ),
    cache.runOrLoad(
      'sage-knowledge',
      () => runSubStep({
        agentSlug: 'sage', name: 'sage-knowledge', model: 'extractor',
        prompt: KNOWLEDGE_PROMPT.replace('{SCOPING_TEXT}', scopingText),
        ceiling: 0.08,
        agentDef, clientSlug, mcpClient,
        userInstruction: SAGE_SUB_INSTRUCTION,
        forceSingleTurn: true,
      }),
      'sage-knowledge',
    ),
  ]);

  cache.clearIfAllSucceeded([systemsResult, flowsResult, intelResult, knowledgeResult].filter(Boolean));

  const totalCost = [systemsResult, flowsResult, intelResult, knowledgeResult]
    .reduce((sum, r) => sum + r.cost, 0);

  const flowsOut     = (flowsResult.output     && Object.keys(flowsResult.output).length     > 0) ? flowsResult.output     : {};
  const intelOut     = (intelResult.output     && Object.keys(intelResult.output).length     > 0) ? intelResult.output     : {};
  const knowledgeOut = (knowledgeResult.output && Object.keys(knowledgeResult.output).length > 0) ? knowledgeResult.output : {};

  const outputCount = [systemsOut, flowsOut, intelOut, knowledgeOut]
    .filter(o => Object.keys(o).length > 0).length;

  if (outputCount === 0) {
    return { cost: totalCost, killed: true, output: null };
  }

  // Extract and merge decisions from knowledge sub-agent
  const allDecisions = knowledgeOut.decisions || [];

  const sourceFiles = [];
  const sage = {
    status: 'complete',
    client: clientSlug,
    generatedAt: new Date().toISOString(),
    sourceFiles,
    businessContext: systemsOut.businessContext || {},
    systems: systemsOut.systems || [],
    confirmedFlows: flowsOut.confirmedFlows || [],
    potentialFlows: flowsOut.potentialFlows || [],
    signals: systemsOut.signals || [],
    namedContacts: intelOut.namedContacts || [],
    systemFindings: systemsOut.systemFindings || [],
    quotes: intelOut.quotes || {},
    architectKnowledge: knowledgeOut.architectKnowledge || [],
    questionGaps: knowledgeOut.questionGaps || [],
    p0Flags: systemsOut.p0Flags || [],
  };

  return {
    cost: totalCost,
    killed: false,
    output: sage,
  };
}
