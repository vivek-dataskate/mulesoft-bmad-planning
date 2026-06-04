/**
 * Sol multi-step runner — 3 focused sub-agents + deterministic merge.
 *
 * Architecture:
 *   - Orchestrator reads sol-stage.json ONCE and injects it
 *   - sol-scope      (haiku,  $0.15): engagementSummary + scopeOfWork from confirmedFlows
 *   - sol-milestones (sonnet, $0.30): milestone schedule + deliverables from pricing
 *   - sol-obligations(haiku,  $0.15): client + DataSkate commits from p0Blockers + project
 *   - sol-legal      (sonnet, $0.25): IP ownership, warranty, indemnification, governing law, data security
 *   - sol-payment    (haiku,  $0.15): invoice schedule, late fees, disputes, expense policy
 *   - All 5 are independent → run in PARALLEL
 *   - Orchestrator merges all 5 + appends static general terms block
 *
 * Guard: throws if project.json.status !== 'accepted'. Sol only runs post-acceptance.
 * Output: projects/{client}/scoping/run/sol.json
 * Cost max: $1.00
 *
 * Trigger: node orchestrator.mjs --client <slug> --agent sol
 */
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runSubStep, readStage } from '../agent-runner.mjs';
import { subagentCache } from './subagent-cache.mjs';
import { BANNED_PHRASES_INLINE } from '../constants.mjs';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../../..');

// ─── Sub-agent prompts ────────────────────────────────────────────────────────

const SCOPE_PROMPT = `\
You are sol-scope. Generate the engagement summary and scope-of-work table for a DataSkate Statement of Work (SOW).
Every fact must trace to STAGE_DATA — no fabrication.

${BANNED_PHRASES_INLINE}

STAGE_DATA (sol-stage.json):
{STAGE_JSON}

OUTPUT — call write_output with exactly:
{
  "engagementSummary": {
    "description": "2 sentences: DataSkate will design, configure, and deliver a MuleSoft-powered integration connecting [list unique systems from confirmedFlows] — to sync [comma-list of entities from confirmedFlows]. Use the client's actual system names.",
    "systemsSynced": ["unique source + target system names across all confirmedFlows — deduplicated"],
    "timeline": "from STAGE_DATA._project.pricingComputed.timelineWeeks formatted as 'X Weeks' — or estimate 2 weeks per flow if not present",
    "fee": "USE STAGE_DATA._project.acceptedPrice if set (this is the negotiated agreed price) — else use STAGE_DATA._project.pricingComputed.implementationFee — else write '$TBD'",
    "paymentSchedule": [
      { "milestone": "On Signatures",   "amount": "50% of fee", "pct": 50 },
      { "milestone": "On UAT HandOff",  "amount": "50% of fee", "pct": 50 }
    ],
    "delivery": "Fully remote. Senior-only practitioners."
  },
  "scopeOfWork": {
    "basisDate": "month + year of the discovery call — from STAGE_DATA.sage.businessContext.discoveryDate if present, else today",
    "flows": [
      {
        "name": "flow name exactly from confirmedFlows[].name",
        "direction": "one of: Bidirectional | {source} → {target} | {target} → {source}",
        "pattern": "one of: Real-time | Scheduled | Real-time or Scheduled | REST Push + Platform Event | Nightly REST Upsert",
        "tool": "MuleSoft (via DataSkate)"
      }
    ],
    "includedItems": [
      "Field mapping data dictionary",
      "Error handling and alerting",
      "End-to-end UAT support",
      "Admin walkthrough (2 hrs)",
      "Integration runbook"
    ],
    "notInScope": ["array — derive from STAGE_DATA.petra.proposalContent.oos if present, always include 'Post-go-live managed support (separate SOW)'"]
  }
}

RULES:
- flows[]: one row per confirmedFlow. Do NOT invent flows not in confirmedFlows[].
- direction: confirmedFlows[].direction === 'bidirectional' → 'Bidirectional'; 'source-to-target' → '{source} → {target}'
- pattern: trigger=event → 'Real-time'; trigger=polling|scheduled → 'Scheduled'; trigger=mixed → 'Real-time or Scheduled'
- tool: always 'MuleSoft (via DataSkate)'
- systemsSynced: unique list — each system name appears once
- fee: use pricingComputed.implementationFee. If absent, do NOT invent — write "$TBD"
- paymentSchedule amounts: each is exactly 50% of fee; if fee is TBD write "$TBD"
Call write_output once when done.`;

// ─────────────────────────────────────────────────────────────────────────────

const MILESTONES_PROMPT = `\
You are sol-milestones. Generate the milestones and deliverables section for a DataSkate Statement of Work (SOW).
Every fact must trace to STAGE_DATA — no fabrication.

STAGE_DATA (sol-stage.json):
{STAGE_JSON}

OUTPUT — call write_output with exactly:
{
  "milestones": [
    {
      "name": "milestone label — e.g. 'On Signatures' | 'Milestone 1 — Discovery & Design' | 'On UAT HandOff'",
      "timing": "e.g. 'Week 0' | 'End of Week 2' | 'Week 8-12'",
      "payment": "$X,XXX USD or null if no payment at this milestone",
      "deliverables": ["specific deliverable strings — name the actual system/flow/document"]
    }
  ]
}

RULES:
- Milestone 1 'On Signatures' (Week 0, 50% of fee): kickoff, env access confirmed, architecture review.
- Milestone 2 (optional mid-engagement): 'Discovery & Design Complete' — written discovery report, field mapping data dictionary, integration architecture.
- Final milestone 'On UAT HandOff' (50% of fee): all in-scope flows tested, runbook delivered, admin walkthrough complete.
- milestone.timing: derive from STAGE_DATA._project.pricingComputed.timelineWeeks if available.
- Only include a mid-engagement milestone if flowCount > 4 (warrants a design gate).
- Name the actual systems in deliverables (e.g. 'Salesforce OAuth credentials confirmed' not 'system credentials').
- deliverables must be concrete and specific — no generic bullet text.
Call write_output once when done.`;

// ─────────────────────────────────────────────────────────────────────────────

const OBLIGATIONS_PROMPT = `\
You are sol-obligations. Generate the assumptions and client responsibilities section for a DataSkate Statement of Work (SOW).
Every fact must trace to STAGE_DATA — no fabrication. Make commitments system-specific.

STAGE_DATA (sol-stage.json):
{STAGE_JSON}

OUTPUT — call write_output with exactly:
{
  "assumptions": {
    "changeControlThresholdHours": 3,
    "dataskateCommits": [
      "Named engagement lead for the full engagement",
      "Written discovery report by end of Week 2",
      "Written milestone package + acceptance checklist at each milestone",
      "Prompt written notice of any risk to the delivery timeline",
      "Change Request response within 3 business days",
      "30-day defect support for issues surfaced post-UAT go-live"
    ],
    "clientCommits": [
      "list of client obligations — MUST name the actual systems from confirmedFlows",
      "example: 'Salesforce OAuth credentials delivered by Week 1 Day 1' — not 'System A credentials'",
      "include one line per p0Blocker from STAGE_DATA.flo.p0Blockers[] that is a client action",
      "always include: 'Sandbox access with sample data by Week 1'",
      "always include: 'Written UAT acceptance or feedback within 5 business days of each milestone'",
      "always include: 'No mid-engagement changes to scope'"
    ]
  }
}

RULES:
- clientCommits: extract from flo.p0Blockers[].clientAction where severity=p0. Name the actual system.
- clientCommits: add one line per in-scope system for API credentials (use rex.systemProfiles[].name).
- dataskateCommits: use the 6 standard items above verbatim — do not add or remove.
- changeControlThresholdHours: always 3.
Call write_output once when done.`;

// ─── Legal sub-agent ─────────────────────────────────────────────────────────

const LEGAL_PROMPT = `\
You are sol-legal. Generate the legal clauses section for a DataSkate Statement of Work (SOW).
Write in plain, professional legal language. No jargon. Every clause must be self-contained.

STAGE_DATA (sol-stage.json):
{STAGE_JSON}

OUTPUT — call write_output with exactly:
{
  "legalClauses": {
    "ipOwnership": {
      "headline": "Intellectual Property",
      "body": "Upon receipt of final payment, DataSkate assigns to Client all custom integration code, field mapping data dictionaries, and runbooks created specifically for this engagement. DataSkate retains ownership of its pre-existing IP, frameworks, reusable components, and general methodologies. Client grants DataSkate a limited license to access Client systems solely to perform services under this SOW."
    },
    "warranty": {
      "headline": "Warranty",
      "defectPeriodDays": 30,
      "body": "DataSkate warrants that deliverables will conform to the specifications in Section 2 for 30 days following written UAT acceptance. DataSkate's sole obligation under this warranty is to correct non-conforming deliverables at no additional charge. This warranty does not cover defects caused by Client-side changes, credential revocations, or third-party API modifications made after UAT acceptance."
    },
    "indemnification": {
      "headline": "Indemnification",
      "body": "Each party indemnifies, defends, and holds harmless the other from third-party claims arising from its own gross negligence or willful misconduct. DataSkate is not liable for integration failures caused by third-party API changes, Client-side data quality issues, or credential access delays attributable to Client."
    },
    "governingLaw": {
      "headline": "Governing Law & Dispute Resolution",
      "jurisdiction": "New Jersey",
      "body": "This SOW is governed by the laws of the State of New Jersey, without regard to conflict-of-law principles. Any dispute shall first be escalated to senior management of both parties. If unresolved within 14 calendar days, both parties agree to non-binding mediation before initiating litigation. The prevailing party in any litigation is entitled to recover reasonable attorneys' fees."
    },
    "dataSecurity": {
      "headline": "Data Access & Security",
      "body": "DataSkate will access Client systems only to the extent necessary to deliver the services in Section 2. DataSkate will not retain Client data beyond the engagement. API credentials and secrets will be stored in a SOC 2-audited secrets manager and permanently revoked upon project close or earlier termination. DataSkate will notify Client within 48 hours of any suspected unauthorized access to Client systems."
    },
    "forceMajeure": {
      "headline": "Force Majeure",
      "body": "Neither party is liable for delays or failure to perform caused by events outside its reasonable control, including natural disasters, government actions, or third-party platform outages (e.g. Salesforce, MuleSoft infrastructure incidents). The affected party will provide written notice within 5 business days and use commercially reasonable efforts to resume performance."
    },
    "entireAgreement": {
      "headline": "Entire Agreement",
      "body": "This SOW, together with any signed Change Orders, constitutes the entire agreement between the parties regarding the subject matter herein and supersedes all prior discussions, proposals, and agreements. Amendments require written agreement signed by both parties."
    }
  }
}

RULES:
- governingLaw.jurisdiction: always 'New Jersey' — DataSkate is NJ-based.
- warranty.defectPeriodDays: always 30.
- dataSecurity.body: reference the actual systems from STAGE_DATA.flo.confirmedFlows[] source/target names where relevant.
- Every clause body must be a single paragraph, 2-4 sentences. No sub-bullets.
- Do NOT fabricate specific legal citations, statutes, or case law.
Call write_output once when done.`;

// ─── Payment clauses sub-agent ────────────────────────────────────────────────

const PAYMENT_PROMPT = `\
You are sol-payment. Generate the detailed payment terms section for a DataSkate Statement of Work (SOW).
Every amount must trace to STAGE_DATA._project.pricingComputed — no fabrication.

STAGE_DATA (sol-stage.json):
{STAGE_JSON}

OUTPUT — call write_output with exactly:
{
  "paymentClauses": {
    "currency": "USD",
    "preferredMethod": "ACH or Wire Transfer",
    "wiringInstructions": "Provided on invoice",
    "invoiceSchedule": [
      {
        "milestone": "On Signatures",
        "trigger": "Invoice issued on the date this SOW is countersigned by Client",
        "amount": "50% of total fee (from STAGE_DATA._project.pricingComputed.implementationFee)",
        "dueDays": 10,
        "description": "Kickoff retainer — required before Week 1 begins"
      },
      {
        "milestone": "On UAT HandOff",
        "trigger": "Invoice issued on the date of written UAT acceptance (or deemed acceptance)",
        "amount": "remaining 50% of total fee",
        "dueDays": 10,
        "description": "Final payment — released upon UAT acceptance or deemed acceptance per Section 5"
      }
    ],
    "latePayment": {
      "gracePeriodDays": 5,
      "interestRatePctPerMonth": 1.5,
      "annualPct": 18,
      "body": "Invoices unpaid after a 5-business-day grace period accrue interest at 1.5% per month (18% per annum) from the original due date until paid in full. DataSkate reserves the right to suspend services if any invoice remains unpaid for more than 15 business days past the due date."
    },
    "disputedInvoices": "Client must notify DataSkate in writing of any disputed line item within 5 business days of invoice receipt. Undisputed portions must be paid in full by the original due date. Both parties will work in good faith to resolve disputes within 10 business days.",
    "expenseReimbursement": "No travel expenses are expected for this engagement. If on-site visits are mutually agreed in writing, pre-approved travel expenses will be billed at cost with receipts, net-30 from submission.",
    "taxResponsibility": "Each party is responsible for its own income taxes. Client is responsible for any applicable sales, use, or withholding taxes imposed by its jurisdiction. DataSkate will cooperate in good faith to provide any documentation required for tax compliance.",
    "workSuspension": "DataSkate may suspend work with 5 business days written notice if any undisputed invoice remains unpaid more than 15 business days past its due date. The engagement timeline extends by the duration of any suspension."
  }
}

RULES:
- invoiceSchedule[0].amount: exactly 50% of pricingComputed.implementationFee formatted as '$X,XXX USD'. If absent, write '$TBD'.
- invoiceSchedule[1].amount: exactly 50% of pricingComputed.implementationFee formatted as '$X,XXX USD'. If absent, write '$TBD'.
- latePayment.interestRatePctPerMonth: always 1.5 (18% annual).
- latePayment.gracePeriodDays: always 5.
- dueDays: always 10 (net-10 from invoice date).
- Do NOT invent bank account numbers or routing numbers — wiringInstructions is always 'Provided on invoice'.
Call write_output once when done.`;

// ─── Static general terms (change control, acceptance, delivery) ──────────────

const STATIC_TERMS = {
  changeControlThresholdHours: 3,
  acceptancePeriodDays:         5,
  deemedAcceptedDays:           10,
  terminationNoticeDays:        30,
  workingHours:                 'Monday–Friday 6:00am–2:30pm ET',
  liabilityCap:                 '3 months of fees paid by client preceding the claim',
  subcontractors:               'DataSkate may use subcontractors with prior written notice to Client. DataSkate remains fully responsible for all subcontractor performance and delivery quality.',
  confidentiality:              'Each party will treat the other\'s confidential information (including this SOW, pricing, and data accessed during delivery) as strictly confidential and will not disclose it to third parties without prior written consent.',
};

// ─── Runner ───────────────────────────────────────────────────────────────────

export async function runSol({ agentDef, clientSlug, mcpClient }) {
  // Guard: Sol only runs after the proposal is accepted.
  // When triggered by CI (onProposalAccepted Cloud Function dispatch), the commit that
  // sets status="accepted" may not yet be visible to the runner — bypass the file check.
  const triggeredByCI = process.env.SOL_TRIGGERED_BY_ACCEPTANCE === 'true';

  const projPath = path.join(ROOT, 'projects', clientSlug, 'project.json');
  let projData = {};
  try {
    if (fs.existsSync(projPath)) projData = JSON.parse(fs.readFileSync(projPath, 'utf8'));
  } catch (_) {}

  if (!triggeredByCI && projData.status !== 'accepted') {
    throw new Error(
      `Sol (SOW agent) requires project.json.status === 'accepted'. ` +
      `Current status: '${projData.status || 'not set'}'. ` +
      `Set "status": "accepted" in projects/${clientSlug}/project.json once the proposal is approved.`
    );
  }

  const stageData = await readStage(mcpClient, 'sol');
  const stageJson = JSON.stringify(stageData, null, 2);

  const cache = subagentCache(clientSlug, 'sol');

  console.log(`    [sol] sol-scope ‖ sol-milestones ‖ sol-obligations ‖ sol-legal ‖ sol-payment (parallel)`);
  const [r1, r2, r3, r4, r5] = await Promise.all([
    cache.runOrLoad('sol-scope', () => runSubStep({
      agentSlug: 'sol', name: 'sol-scope', model: 'fast',
      prompt: SCOPE_PROMPT.replace('{STAGE_JSON}', stageJson),
      ceiling: 0.15, agentDef, clientSlug, mcpClient,
    }), 'sol-scope (haiku, $0.15)'),
    cache.runOrLoad('sol-milestones', () => runSubStep({
      agentSlug: 'sol', name: 'sol-milestones', model: 'writer',
      prompt: MILESTONES_PROMPT.replace('{STAGE_JSON}', stageJson),
      ceiling: 0.30, agentDef, clientSlug, mcpClient,
    }), 'sol-milestones (sonnet, $0.30)'),
    cache.runOrLoad('sol-obligations', () => runSubStep({
      agentSlug: 'sol', name: 'sol-obligations', model: 'fast',
      prompt: OBLIGATIONS_PROMPT.replace('{STAGE_JSON}', stageJson),
      ceiling: 0.15, agentDef, clientSlug, mcpClient,
    }), 'sol-obligations (haiku, $0.15)'),
    cache.runOrLoad('sol-legal', () => runSubStep({
      agentSlug: 'sol', name: 'sol-legal', model: 'writer',
      prompt: LEGAL_PROMPT.replace('{STAGE_JSON}', stageJson),
      ceiling: 0.25, agentDef, clientSlug, mcpClient,
    }), 'sol-legal (sonnet, $0.25)'),
    cache.runOrLoad('sol-payment', () => runSubStep({
      agentSlug: 'sol', name: 'sol-payment', model: 'fast',
      prompt: PAYMENT_PROMPT.replace('{STAGE_JSON}', stageJson),
      ceiling: 0.15, agentDef, clientSlug, mcpClient,
    }), 'sol-payment (haiku, $0.15)'),
  ]);

  const scope       = (r1.output && Object.keys(r1.output).length > 0) ? r1.output : {};
  const milestones  = (r2.output && Object.keys(r2.output).length > 0) ? r2.output : {};
  const obligations = (r3.output && Object.keys(r3.output).length > 0) ? r3.output : {};
  const legal       = (r4.output && Object.keys(r4.output).length > 0) ? r4.output : {};
  const payment     = (r5.output && Object.keys(r5.output).length > 0) ? r5.output : {};
  const totalCost   = r1.cost + r2.cost + r3.cost + r4.cost + r5.cost;

  // ── Deterministic meta from project.json ────────────────────────────────────
  const meta = {
    clientSlug,
    clientDisplayName: projData.displayName || projData.name || clientSlug,
    clientLegalName:   projData.legalName   || projData.displayName || clientSlug,
    effectiveDate:     new Date().toISOString().slice(0, 10),
    status:            'draft',
    version:           '1.0',
    architect:         projData.architect      || stageData._project?.architect      || 'Kailash Kumar Chanda',
    architectEmail:    projData.architectEmail || stageData._project?.architectEmail || 'kailash@dataskate.ai',
    primaryContact:    projData.primaryContact || null,
  };

  const sol = {
    status:      'complete',
    client:      clientSlug,
    generatedAt: new Date().toISOString(),
    meta,
    engagementSummary: scope.engagementSummary   || {},
    scopeOfWork:       scope.scopeOfWork          || {},
    milestones:        milestones.milestones       || [],
    assumptions:       obligations.assumptions     || {},
    terms:             STATIC_TERMS,
    legalClauses:      legal.legalClauses          || {},
    paymentClauses:    payment.paymentClauses       || {},
  };

  return { output: sol, cost: totalCost, killed: false };
}
