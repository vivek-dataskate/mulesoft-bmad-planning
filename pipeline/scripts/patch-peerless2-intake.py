#!/usr/bin/env python3
"""Patch peerless2 intake-content.json: fill all blank textareas with suggested answers."""
import json, re, sys

INTAKE = '/workspaces/mulesoft-bmad-planning/projects/peerless2/intake/intake-content.json'
CONFIRM = ' — Confirm: ☐ Correct ☐ Correct it: ___'
ASSUMED = ' — ⚠️ Assumed — confirm: ☐ Correct ☐ Correct it: ___'
CRITICAL = '⚠️ NEEDS CLIENT CONFIRMATION: '

# Each entry: (unique_snippet_from_q_text, answer_text)
# Snippet must be long enough to be unique but short enough to match despite HTML entities
FILLS = [
    # ── Section 1 ──────────────────────────────────────────────────────────────
    ('Which specific contract document types (299A, 299B, 118) are required',
     'All three contract types (299A, 299B, 118) must be present before job creation in ComputerEase. DocHub captures each digital signature upon contract completion and triggers UC4/UC7.' + ASSUMED),

    ('Does ComputerEase support document attachment via API',
     'DataSkate to verify post CE API provisioning. If CE API does not support binary file attachment (common in older CE versions), contract PDFs will be stored in Salesforce Files with a URL reference to DocHub storage.' + ASSUMED),

    ('What specific task types are created in Salesforce for material purchases',
     'Task types: Material Purchase and Labor Assignment. Required fields per task: assignee, due date, cost code, estimated quantity.' + ASSUMED),

    ('Is there a one-to-one relationship between a Salesforce project task and a ComputerEase cost code',
     'One-to-one mapping assumed: each Salesforce task maps to one ComputerEase cost code entry.' + ASSUMED),

    ('Who currently creates tasks in Salesforce',
     'Ashley Salerno (operations lead) currently creates tasks manually in Salesforce. After go-live, UC8 will auto-create tasks triggered by job creation in ComputerEase.' + CONFIRM),

    ('Does HD Portal provide a webhook or push notification when an appointment',
     'HD Portal does not support webhooks. Appointment sync (UC9) relies on scheduled polling every 10 minutes — same cadence as UC1 lead sync. DataSkate standard for HD Portal integrations.' + ASSUMED),

    ('GCP firewall rules currently allow SSH and RDP access from any source',
     CRITICAL + 'GCP firewall hardening not yet complete per scoping. Kirk (GCP administrator) to restrict SSH and RDP access to DataSkate static IP range only before dev kickoff. — Confirm: ☐ Complete ☐ Not yet started — provide Kirk\'s contact to coordinate'),

    ('What is the current network path from the MuleSoft integration layer to the ComputerEase VM',
     'CloudHub 2.0 → HTTPS → CE Live Service relay endpoint on GCP VM (URL provided by Deltek post-ticket). No API gateway exists. DataSkate CloudHub static IP must be whitelisted on GCP firewall.' + ASSUMED),

    ('Who owns the GCP project and has administrative access to modify firewall rules',
     'Kirk (referenced in scoping calls) is the GCP project administrator. DataSkate architect Raghuram Potluri to coordinate firewall changes with Kirk directly.' + CONFIRM),

    ('Has a support ticket been submitted to Deltek to enable API access',
     CRITICAL + 'No Deltek support ticket submitted yet per scoping calls. Ashley Salerno to initiate with Deltek support before development kickoff. Ticket #: ___ Expected resolution date: ___ — ☐ Submitted (provide ticket #) ☐ Not yet started — action needed immediately'),

    ('What version of the ComputerEase API is currently licensed',
     'CE Live Service relay version 2.x assumed (Deltek standard). DataSkate to confirm exact version post-provisioning. If alternate version, Deltek support to advise on compatibility.' + ASSUMED),

    ('How does Ashley currently identify that a deposit has been received in HD Portal',
     'Ashley identifies deposits via a status field or reporting view in HD Portal. Exact field name to be confirmed during live API probe session post-credentials delivery.' + ASSUMED),

    ('In ComputerEase, are deposit and payment terms stored at the job record level',
     'Deposit and payment terms stored at the job record level in ComputerEase (not a separate billing module).' + ASSUMED),

    # ── Section 2 ──────────────────────────────────────────────────────────────
    ('List all systems that will participate in this integration project',
     'Salesforce: https://developer.salesforce.com/docs | ComputerEase: CE Live Service API (Deltek, post-provisioning) | HD Portal: HD Portal developer API (contact Marius) | DocHub: https://developer.dochub.com | GCP: https://cloud.google.com/apis' + CONFIRM),

    ('Do you currently have an Enterprise Service Bus (ESB) or iPaaS platform',
     'No existing ESB or iPaaS platform. All 12 confirmed flows are net-new automation. MuleSoft CloudHub 2.0 is being provisioned by DataSkate under the IaaS model.' + CONFIRM),

    ('If you have MuleSoft, do you have an active Anypoint Platform subscription',
     'No existing Anypoint subscription. DataSkate manages the CloudHub 2.0 subscription and infrastructure under the IaaS model — Peerless Fence does not need to procure separately.' + CONFIRM),

    ('Are there any pre-built integration assets or connectors in your Anypoint Exchange',
     'No pre-built assets in Anypoint Exchange for Peerless Fence. DataSkate will build all connectors and integration flows from scratch for this engagement.' + CONFIRM),

    ('After DataSkate receives all credentials, we will run a live GET call',
     'Test record IDs to be provided by Ashley Salerno or Jean Jacobs (JeanJ@peerlessfence.com) at kickoff. Needed: one safe HD Portal test lead ID, one ComputerEase test job number, one Salesforce sandbox lead record. — ⚠️ Action needed before API probe — contact Ashley at ashleyaskatpeerlessfence.com'),

    # ── Section 3 ──────────────────────────────────────────────────────────────
    ('Confirm that the HD Portal lead API payload includes all fields listed',
     CRITICAL + 'HD Portal lead API field names to be confirmed via live GET call post-credentials. DataSkate assumes standard fields: lead_id, customer_name, address, phone, email, appointment_date, assigned_rep, job_type. Correct any mismatched names here.'),

    ('Confirm the exact Salesforce API names for the budget worksheet custom fields',
     CRITICAL + 'Budget field API names assumed: Budget_Amount__c, Estimated_Labor__c, Material_Cost__c. DataSkate to confirm via Salesforce API introspection post-credentials. Flag any differences here.'),

    ('Confirm whether ComputerEase stores customer name as a single field',
     CRITICAL + 'CE assumed to store customer name as separate First Name + Last Name fields (standard CE schema). — Confirm: ☐ Single Customer Name field ☐ Split First + Last (assumed)'),

    ('Confirm the exact DocHub merge field names used in your 299A, 299B',
     CRITICAL + 'DocHub merge fields assumed: customer_name, customer_address, contract_amount, contract_date, job_type. Confirm field names in your 299A, 299B, and 118 templates match. Flag any that differ.'),

    ('Confirm whether the HD Portal quote API returns structured line items',
     CRITICAL + 'HD Portal quote API assumed to return structured line items with: material_type, quantity, unit_price, product_code. — Confirm: ☐ Returns structured line items (assumed) ☐ Returns single total only — no line items (DataSkate must redesign UC5)'),

    ('Confirm which Salesforce object the ComputerEase job status and work order',
     CRITICAL + 'CE job status and work order data to be attached to the Salesforce Opportunity object. CE job number stored as External ID on Opportunity. — Confirm target object: ☐ Opportunity (assumed) ☐ Custom object — name: ___ ☐ Other: ___'),

    ('Confirm whether the ComputerEase API supports binary file',
     CRITICAL + 'CE API assumed to NOT support binary file/document attachment (common limitation of older CE versions). Contract PDFs will be stored in Salesforce Files with a URL reference to DocHub. — Confirm: ☐ CE API supports binary file upload ☐ URL reference only (assumed)'),

    ('Confirm whether ComputerEase has a distinct Task or Work Order Line',
     CRITICAL + 'CE assumed to have a Cost Code line item entity for material and labor task tracking. DataSkate to verify exact entity name post-CE API provisioning. — Confirm: ☐ Cost Code line item exists (assumed) ☐ Different entity — name: ___'),

    ('Confirm the timezone used by the HD Portal for appointment timestamps',
     'HD Portal assumed to use Eastern Time (ET) for all appointment timestamps. MuleSoft will normalize to UTC for Salesforce storage.' + ASSUMED),

    ('Confirm whether ComputerEase stores deposit amount and payment terms',
     CRITICAL + 'Deposit amount and payment terms assumed stored as fields on the CE Job record (not a separate billing module). — Confirm: ☐ Job record level (assumed) ☐ Separate billing module — contact Jean Jacobs to confirm'),

    # ── Section 4 ──────────────────────────────────────────────────────────────
    ('What is the expected transaction volume per flow',
     'Estimated volumes (from scoping context and company size): UC1 leads ~20–30/day, UC2/UC3 jobs ~5–10/day, UC4/UC7 contracts ~3–5/day, UC9 appointments ~10–15/day, UC12 deposits ~3–5/day. Peak: spring/summer construction season (March–June).' + ASSUMED),

    # ── Section 5 ──────────────────────────────────────────────────────────────
    ('Confirm authentication methods for each system',
     'HD Portal: API key (clipboard-disabled — must hand-transcribe in 10–15 min session with Marius). Salesforce: OAuth 2.0 JWT Bearer + Connected App. ComputerEase: CE Live Service relay auth (Deltek-provisioned). DocHub: OAuth 2.0 / API key. GCP: Service account key.' + CONFIRM),

    ('Confirm applicable regulatory compliance frameworks',
     'Standard data protection applies. No HIPAA, PCI-DSS, or GDPR requirements identified in scoping. Financial data (deposit amounts, contract values) covered under standard TLS 1.2+ encryption-in-transit.' + CONFIRM),

    ('Confirm data residency and regional requirements',
     'US East-1 region (CloudHub 2.0 US). All systems US-based. No cross-border data transfer required. DataSkate standard for US-only clients.' + CONFIRM),

    ('Confirm mTLS (mutual TLS) requirement',
     'mTLS not required. Standard TLS 1.2+ for all API-to-API communication. DataSkate IaaS standard. — Confirm: ☐ Correct ☐ mTLS required — specify which endpoints'),

    ('Specify audit trail and logging requirements',
     CRITICAL + 'All integration API calls logged with: timestamp, payload size, status code, correlation ID. Stored in Anypoint Monitoring (90-day retention, DataSkate standard). No PII in logs.' + ASSUMED),

    ('Who has access to audit logs and how are they reviewed',
     'DataSkate architect (Raghuram Potluri, raghuram@dataskate.ai) + designated Peerless Fence admin (Ashley Salerno). Monthly log summary included in IaaS operational report.' + CONFIRM),

    ('How are API keys, tokens, and credentials stored and rotated',
     CRITICAL + 'All credentials stored in Anypoint Secrets Manager (CloudHub 2.0 built-in vault). Rotation schedule: 90 days for API keys, immediate on personnel change. DataSkate manages rotation for all IaaS clients.' + ASSUMED),

    ('Who has access to credentials and how is access provisioned',
     'DataSkate architect (Raghuram Potluri) manages credential provisioning and revocation. Revocation: immediate on email request to raghuram@dataskate.ai. No client-side credential access except named system admins (Ashley, Jean Jacobs).' + CONFIRM),

    ('Describe incident response and data breach notification procedures',
     'DataSkate IaaS standard: alert via Slack + email within 15 min of detection, triage within 1 hour, client notification within 4 hours. Data breach: notify client and relevant authorities within 72 hours per applicable regulations.' + CONFIRM),

    ('Is there a Data Processing Agreement (DPA) or Security Addendum required',
     'No DPA or Security Addendum required for this engagement (standard data protection applies, no regulated data). — Confirm: ☐ Correct ☐ DPA required — DataSkate to provide template'),

    # ── Section 6 ──────────────────────────────────────────────────────────────
    ('When a target system is unavailable or rejects a message',
     'Retry-then-DLQ: 3 retries with exponential backoff (30s → 2 min → 5 min). After 3 failures → Dead Letter Queue. Alert sent to Ashley Salerno (ashleyaskatpeerlessfence.com) + raghuram@dataskate.ai within 15 min. DataSkate IaaS standard.' + CONFIRM),

    ('For each flow, is zero data loss required, or is best-effort acceptable',
     'UC2/UC3 (job + customer creation), UC4/UC7 (contracts + documents), UC12 (deposit/payment): zero data loss required. UC1/UC5/UC9 (lead sync, quote, appointments): best-effort acceptable — re-polled on next 10-min cycle.' + CONFIRM),

    # ── Section 7 ──────────────────────────────────────────────────────────────
    ('What is your preferred deployment model for the DataSkate integration platform',
     'MuleSoft CloudHub 2.0 — DataSkate IaaS standard. ComputerEase VM is on-premise on GCP — CE Live Service relay endpoint required. Static IP whitelist on GCP firewall for CloudHub 2.0 egress IPs.' + CONFIRM),

    ('What CI/CD tools and build automation do you currently use',
     'None required from Peerless Fence. DataSkate configures Maven + GitHub Actions for automated build and deploy to CloudHub 2.0 as part of IaaS delivery.' + CONFIRM),

    # ── Section 9 ──────────────────────────────────────────────────────────────
    ('Home Depot Service Center (HD Portal) — Is a sandbox or test environment',
     'No sandbox available for HD Portal per scoping. Testing will use production GET-only API calls on test leads labeled [TEST] per HD Portal test lead labeling procedure (to be confirmed with Marius).' + ASSUMED),

    ('Salesforce — Is a sandbox or test environment available',
     'Salesforce Developer or Full Sandbox recommended. Jean Jacobs (JeanJ@peerlessfence.com) to provision sandbox access for DataSkate. Sandbox name and login to be provided at kickoff.' + CONFIRM),

    ('DocHub — Is a sandbox or test environment available',
     'DocHub test workspace available (standard DocHub account feature). DataSkate to set up test contract templates (299A, 299B, 118) in DocHub dev workspace.' + ASSUMED),

    ('Google Cloud Platform (GCP) — Is a sandbox or test environment available',
     'GCP test project or test VPC for firewall and networking testing. Kirk (GCP admin) to provision test project or test subnet for DataSkate integration testing.' + CONFIRM),

    ('Automated Testing Strategy',
     'DataSkate delivers MUnit test coverage for all 12 confirmed flows as part of IaaS scope. Client (Ashley/Jean) participates in manual UAT sign-off only — no automated testing tooling required from Peerless Fence.' + CONFIRM),

    ('Who is the primary decision maker and sign-off authority for go-live approval',
     'Ashley Salerno — Operations Lead — ashleyaskatpeerlessfence.com — primary go-live sign-off authority.' + CONFIRM),

    ('Who else must sign off on go-live',
     'Jean Jacobs (JeanJ@peerlessfence.com) — Salesforce admin sign-off. Raghuram Potluri (raghuram@dataskate.ai) — DataSkate architect technical sign-off.' + CONFIRM),

    ('Should PF1 (Automated Deposit Verification) be added to Phase 1',
     '⚠️ Phase scoping decision: PF1 (Automated Deposit Verification) — DataSkate recommends Phase 2 (adds HD Portal dependency complexity to Phase 1 scope). — Confirm: ☐ Add to Phase 1 ☐ Phase 2 (recommended) ☐ Not pursuing'),

    ('If PF1 is added to Phase 1: What is the acceptable latency between deposit receipt',
     'If PF1 added to Phase 1: latency of 15 minutes acceptable (matches UC1 polling cadence). — ⚠️ Assumed — confirm if added: ☐ Correct ☐ Correct it: ___'),

    ('Should PF2 (Quote Line Item Validation) be added to Phase 1',
     '⚠️ Phase scoping decision: PF2 (Quote Line Item Validation) — DataSkate recommends Phase 2 (requires HD Portal quote API to support structured line-item responses). — Confirm: ☐ Add to Phase 1 ☐ Phase 2 (recommended) ☐ Not pursuing'),

    ('If PF2 is added to Phase 1: What product attributes must be validated',
     'If PF2 added: validate material type (vinyl/wood/aluminum), picket style, post caps, gate type, and linear footage per quote line.' + ASSUMED),

    ('Should PF3 (Intelligent Document Processing for Contracts) be added to Phase 1',
     '⚠️ Phase scoping decision: PF3 (IDP for Contract Processing) — DataSkate recommends Phase 2 as a standalone MuleSoft IDP engagement after Phase 1 integration foundation is live. — Confirm: ☐ Add to Phase 1 ☐ Phase 2 (recommended) ☐ Not pursuing'),

    ('If PF3 is added to Phase 1: What are the critical validation rules for contract',
     'If PF3 added: critical rules = permit date within 90 days of contract signing, digital signature required on all pages, contract amount matches Salesforce opportunity amount.' + ASSUMED),

    ('What is your expected support model after go-live',
     'DataSkate IaaS: async alerting 24/7 via Anypoint Monitoring, business hours response (8am–6pm ET). Monthly operational report to Ashley Salerno. SLA: 99.5% uptime.' + CONFIRM),

    ('Who is the primary operational contact for integration issues post-go-live',
     'Ashley Salerno — Operations Lead — ashleyaskatpeerlessfence.com. Backup: Jean Jacobs — JeanJ@peerlessfence.com.' + CONFIRM),

    # ── Section 10 ─────────────────────────────────────────────────────────────
    ('What is the ticket number and expected resolution date from Deltek',
     CRITICAL + 'Deltek support ticket not yet submitted per scoping calls. Ashley Salerno to initiate before dev kickoff. Ticket #: ___ Expected resolution date: ___ — ☐ Submitted (provide ticket #) ☐ Not yet started — action needed immediately'),

    ('Confirm the backup super-admin user account name and verify that this account has full API',
     'Backup super-admin account name TBD — Ashley Salerno to confirm. Must have full CE API configuration permissions identical to primary admin. — ⚠️ Action needed: provide backup admin account name before kickoff'),

    ('Is the CE next-job-number endpoint available and accessible',
     'CE next-job-number endpoint availability to be confirmed post-Deltek provisioning. DataSkate standard: auto-generate job ID via CE API if available, else use Salesforce opportunity sequence as fallback.' + ASSUMED),

    ('Confirm the Salesforce API user account name and verify that this user has the necessary',
     CRITICAL + 'Salesforce API user account name TBD. Jean Jacobs (JeanJ@peerlessfence.com) to create API user with: API Enabled, Modify All Data on Lead/Opportunity/Account/Contact, Connected App access. — Confirm: ☐ Created — username: ___ ☐ Not yet created'),

    ('Confirm the following Salesforce org configuration flags',
     CRITICAL + 'Org flag defaults assumed: Multi-currency = No, State/Country Picklists = No, Shared Activities = No. Each setting affects DWL transform logic. — Confirm each: ☐ Multi-currency ON ☐ State/Country Picklists ON ☐ Shared Activities ON ☐ All Off (assumed)'),

    ('Provide the API credentials (API Key and/or OAuth token) from the Home Depot Portal team',
     CRITICAL + 'HD Portal API credentials (API Key) to be obtained from HD Portal team via Marius. IMPORTANT: HD Portal disables clipboard copy — credentials must be hand-transcribed in a 10–15 min session. DataSkate to schedule credential handoff with Marius. — Confirm: ☐ Credentials obtained ☐ Meeting with Marius not yet scheduled'),

    ('Confirm the write endpoint availability for the HD Portal API',
     'HD Portal write endpoints assumed: POST /comments for comment write-back, PATCH /deposit-status for deposit confirmation. DataSkate to verify during live API probe with Marius.' + ASSUMED),

    ('Has a developer login account been created for the HD Portal API',
     'Developer login not yet created per scoping. DataSkate (Raghuram) to request developer login from HD Portal team (Marius) during kickoff. Test lead labeling procedure TBD. — Confirm: ☐ Login created ☐ Request to Marius pending'),

    ('Confirm that DocHub has been configured to capture digital signatures for contract types',
     CRITICAL + 'DocHub configuration for digital signature capture on contract types 299A, 299B, and 118 not yet confirmed. Action required before dev kickoff. — Confirm each: ☐ 299A configured ☐ 299B configured ☐ 118 configured'),

    ('Provide the DocHub API credentials (API Key and/or OAuth token) and confirm the document storage',
     CRITICAL + 'DocHub API credentials (API Key or OAuth token) to be provided at kickoff. Document storage and retrieval endpoints TBD — DataSkate to confirm during API probe. — Action needed: provide DocHub API credentials at kickoff (contact Ashley to coordinate)'),

    ('Confirm the document retention policy and archive location for signed contracts',
     '7-year retention assumed (standard for contractor/construction industry). Archive: DocHub cloud storage + Salesforce Files mirror for searchability.' + ASSUMED),

    ('Confirm that GCP firewall rules for the ComputerEase VM have been hardened',
     CRITICAL + 'GCP firewall hardening for ComputerEase VM not yet complete. Kirk (GCP admin) to restrict SSH/RDP to DataSkate static IP range only before dev kickoff. — Confirm: ☐ Complete — approved IPs: ___ ☐ Not yet started — Kirk to action immediately'),

    ('Confirm the GCP service account name and API key used for ComputerEase VM API access',
     'GCP service account name and API key TBD — Kirk (GCP admin) to create and provide at kickoff. Minimum permissions: compute.instances.get, compute.instances.list, VPC network viewer. — ⚠️ Action needed: Kirk to provision service account before kickoff'),

    ('Has network isolation been configured for the ComputerEase VM',
     'VPC name and subnet CIDR TBD — Kirk to confirm. CE Live Service relay endpoint to be whitelisted on DataSkate CloudHub 2.0 static IP. — ⚠️ Action needed: Kirk to provide VPC and subnet details at kickoff'),
]

# ── Load JSON ──────────────────────────────────────────────────────────────────
with open(INTAKE) as f:
    d = json.load(f)

total_filled = 0
not_found = []

def fill_blank_textarea(html, q_snippet, answer):
    """Find a blank textarea whose preceding q-text contains q_snippet, fill it."""
    # Find the question block containing the snippet
    snippet_re = re.compile(re.escape(q_snippet[:40]), re.IGNORECASE)
    match = snippet_re.search(html)
    if not match:
        return html, False

    # From the match position, find the next blank textarea
    after = html[match.start():]
    ta_re = re.compile(r"(<textarea class='answer')([^>]*>)\s*</textarea>")
    ta_match = ta_re.search(after)
    if not ta_match:
        return html, False

    # Replace just that textarea with a prefilled version
    old_ta = ta_match.group(0)
    new_ta = "<textarea class='answer is-prefilled' rows='3'>" + answer.replace('<', '&lt;').replace('>', '&gt;').replace('&lt;br&gt;', '<br>').replace('&lt;em&gt;', '<em>').replace('&lt;/em&gt;', '</em>').replace('&lt;strong&gt;', '<strong>').replace('&lt;/strong&gt;', '</strong>') + "</textarea>"
    new_html = html[:match.start()] + after.replace(old_ta, new_ta, 1)
    return new_html, True

# ── Apply fills to all sections ───────────────────────────────────────────────
for section in d['sections']:
    html = section['bodyHtml']
    for snippet, answer in FILLS:
        html, found = fill_blank_textarea(html, snippet, answer)
        if found:
            total_filled += 1
    section['bodyHtml'] = html

# ── Check for remaining blanks ────────────────────────────────────────────────
for section in d['sections']:
    html = section['bodyHtml']
    remaining = re.findall(r"<textarea class='answer'[^>]*>\s*</textarea>", html)
    if remaining:
        not_found.append((section['id'], section['title'], len(remaining)))

# ── Write back ────────────────────────────────────────────────────────────────
with open(INTAKE, 'w') as f:
    json.dump(d, f, indent=2, ensure_ascii=False)
    f.write('\n')

print(f'Filled {total_filled} blank textareas')
if not_found:
    print(f'WARNING: {sum(n for _,_,n in not_found)} blanks still remain:')
    for sid, title, n in not_found:
        print(f'  Section {sid} ({title}): {n} remaining')
else:
    print('All blanks filled successfully')
