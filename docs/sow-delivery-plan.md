# SOW & Delivery Pipeline — Fix Plan

**Branch:** `refactor/trim-tomls-and-extract-refs`  
**Created:** 2026-06-04  
**Status:** Session 1 complete — fixes pending

---

## What was built (Session 1)

Full SOW delivery pipeline from proposal acceptance to signed SOW:

| Component | File(s) | Status |
|---|---|---|
| Sol LangGraph agent (5 sub-agents) | `pipeline/langgraph/agents/sol-runner.mjs` | ✓ Done |
| Sol stage builder | `pipeline/langgraph/stage-assembler.mjs` | ✓ Done |
| Sol wired into graph | `pipeline/langgraph/graph.mjs` | ✓ Done |
| Sol unparked in pipeline | `pipeline/scout/pipeline.json` | ✓ Done |
| SOW Eleventy layout (8 sections) | `portal/_includes/layouts/sow.njk` | ✓ Done |
| SOW Eleventy page + data file | `portal/src/delivery/sow.njk`, `portal/_data/clientsWithSow.js` | ✓ Done |
| renderSow post-hook | `pipeline/langgraph/post-hooks.mjs` | ✓ Done |
| GitHub Actions workflow | `.github/workflows/run-sol.yml` | ✓ Done |
| Cloud Functions (3) | `portal/functions/index.js` | ✓ Done |
| Firestore rules (proposalViews, negotiations, sow_signatures, proposals) | `portal/firestore.rules` | ✓ Done |
| Proposal acceptance persistence (localStorage + Firestore) | `portal/_includes/layouts/proposal.njk` | ✓ Done |
| Negotiate modal (centered popup) | `portal/_includes/components/proposal-investment.njk` | ✓ Done |
| SOW e-sign (canvas draw + Firestore) | `portal/_includes/layouts/sow.njk` | ✓ Done |
| peerless2 demo (sol.json, signed) | `projects/peerless2/` | ✓ Done |

---

## Fixes Required (from code review)

### P1 — CRITICAL (blocks the flow)

#### C1: Race condition — project.json write vs Sol checkout
**File:** `.github/workflows/run-sol.yml` + `pipeline/langgraph/agents/sol-runner.mjs`  
**Problem:** `onProposalAccepted` patches `project.json` then immediately dispatches `run-sol.yml`. GitHub Actions checkout may run before the commit propagates → Sol guard fails.  
**Fix:** Pass `status=accepted` as a workflow input; bypass the file-read guard when triggered from CI.

```yaml
# run-sol.yml inputs — add:
  triggered_by:
    description: 'acceptance (skip guard) or manual (check project.json)'
    default: 'manual'

# sol-runner.mjs — bypass guard when triggered by CI:
const triggeredByCI = process.env.SOL_TRIGGERED_BY_ACCEPTANCE === 'true';
if (!triggeredByCI && projData.status !== 'accepted') { throw ... }
```

```js
// functions/index.js dispatch — add env var:
body: JSON.stringify({ ref: GITHUB_BRANCH, inputs: { client: clientId, triggered_by: 'acceptance' } })
```

```yaml
# run-sol.yml env — pass to node process:
env:
  SOL_TRIGGERED_BY_ACCEPTANCE: ${{ inputs.triggered_by == 'acceptance' && 'true' || 'false' }}
```

#### C2: SOW portal card stays "Not yet issued" after Sol runs
**File:** `.github/workflows/run-sol.yml`  
**Problem:** Workflow generates SOW HTML but never updates `portal-content.json` → client portal card never shows the SOW link.  
**Fix:** Add a Python patch step + rebuild portal HTML in the workflow.

```yaml
- name: Update portal-content.json SOW card
  run: |
    SLUG="${{ inputs.client }}"
    python3 -c "
    import json
    path = f'projects/{SLUG}/portal-content.json'
    d = json.load(open(path))
    for card in d.get('docCards', []):
        if card.get('title') == 'SOW':
            card['status'] = 'available'
            card['href'] = f'https://dataskateclients.web.app/delivery/sow-{SLUG}.html'
            card['sub'] = 'View & Sign SOW →'
            break
    open(path,'w').write(json.dumps(d, indent=2, ensure_ascii=False))
    print('portal-content.json updated')
    "

- name: Rebuild portal page
  run: |
    SLUG="${{ inputs.client }}"
    npm run build:html
    cp portal/_build/portal/${SLUG}.html portal/public/portal/${SLUG}.html
```

#### C3: Negotiate panel stays open after acceptance
**File:** `portal/_includes/layouts/proposal.njk` — `renderNegThread()` function  
**Problem:** "Make Another Counter-Offer" button visible even after client accepted → can send counter-offers after SOW is generated.  
**Fix:** Check localStorage acceptance state before rendering the button.

```js
function renderNegThread() {
  // ... existing code ...
  const alreadyAccepted = !!localStorage.getItem('proposal_accepted_' + CLIENT_SLUG);
  // Conditionally show counter-offer button:
  const counterBtn = alreadyAccepted ? '' : `
    <button class="btn btn-outline no-print" onclick="showNegotiatePanel()" style="font-size:12px;padding:6px 14px">
      Make Another Counter-Offer
    </button>`;
}
```

---

### P2 — HIGH (significant gaps)

#### H1: No real-time listener for DS counter-offers
**File:** `portal/_includes/layouts/proposal.njk` — `loadNegThread()` function  
**Problem:** One-time `.get()` → client can't see DS counter-offer until page reload.  
**Fix:** Replace `.get()` with `onSnapshot()`.

```js
function loadNegThread() {
  const db = getDb();
  if (!db) { setTimeout(() => loadNegThread(), 400); return; }
  db.collection('negotiations').doc(CLIENT_SLUG)
    .onSnapshot(snap => {
      if (!snap.exists) return;
      const thread = snap.data().thread || [];
      _negThread = thread;
      saveNegThreadLocally(thread);
      renderNegThread();
      // Badge on tab if DS added a new entry while client was on page
    }, () => {});
}
```

#### H4: Defensive `acceptedAt.toMillis()` in Cloud Function
**File:** `portal/functions/index.js` — `onProposalAccepted`  
**Problem:** If `acceptedAt` is a plain string (not Firestore Timestamp), `.toMillis()` throws and the entire function fails silently.  
**Fix:**
```js
const ts = after.acceptedAt;
const isoDate = ts?.toMillis ? new Date(ts.toMillis()).toISOString()
              : ts?.seconds   ? new Date(ts.seconds * 1000).toISOString()
              : new Date().toISOString();
```

#### L4: `discountLog` Firestore rule missing — writes rejected silently
**File:** `portal/firestore.rules`  
**Problem:** `discountLog` collection has no rule → silent rejection on every counter-offer.  
**Fix:**
```
match /discountLog/{clientId} {
  allow create, update: if true;
  allow read: if isArchitect();
}
```

---

### P3 — MEDIUM (process correctness)

#### M2: Negotiation thread read from wrong source
**File:** `portal/functions/index.js` — `onProposalAccepted`  
**Problem:** Thread snapshot in `proposals/{id}` may be stale (client-side snapshot). Should read authoritative thread from `negotiations/{id}`.  
**Fix:**
```js
// In onProposalAccepted, replace negotiationThread from proposal payload:
const negSnap = await admin.firestore().collection('negotiations').doc(clientId).get();
const fullThread = negSnap.exists ? (negSnap.data().thread || []) : (after.negotiationThread || []);
const patched = { ...existing, ..., negotiationThread: fullThread };
```

#### M3: Portal page not rebuilt in workflow
**File:** `.github/workflows/run-sol.yml`  
**Problem:** After updating `portal-content.json`, the portal `peerless2.html` page itself must be rebuilt and copied.  
**Fix:** Already covered in C2 fix above (rebuild + copy portal HTML).

#### M1: DataSkate has no UI to send counter-offers
**File:** New — `portal/src/internal/negotiate.njk`  
**Problem:** DS must use Firebase Console to respond — error-prone and requires Console access.  
**Fix:** Create a simple internal negotiate page at `/internal/negotiate-{slug}.html` with the thread + DS counter-offer form. Architect-only, authenticated via the `isArchitect()` rule.

---

### P4 — LOW (polish)

| ID | File | Fix |
|---|---|---|
| L1 | `functions/index.js` | Hardcoded `GITHUB_BRANCH = 'main'` — make configurable for staging |
| L2 | `functions/index.js` `onSowSigned` | Use `after.clientSignedAt` timestamp not `new Date()` for `sowSignedAt` |
| L3 | `functions/index.js` `onClientCounterOffer` | `negotiation-${Date.now()}.json` accumulates — use single `negotiation-log.json` with append |
| L5 | `sol-runner.mjs` header | Comment says "3 sub-agents" but there are 5 |

---

## Session 2 Execution Order

Run in this exact order — each item is a commit:

```
commit 1: C3 + L4          (2 files, 10 min)  — lock negotiate + discountLog rule
commit 2: H4 + M2          (1 file, 15 min)   — defensive TS + authoritative thread
commit 3: C1               (2 files, 20 min)  — race condition fix
commit 4: C2 + M3          (1 file, 30 min)   — portal card + portal HTML in workflow
commit 5: H1               (1 file, 20 min)   — real-time onSnapshot
commit 6: L2 + L3 + L5     (2 files, 10 min)  — low-priority cleanup
commit 7: M1               (2 files, 60 min)  — internal negotiate UI
```

After all commits: `firebase deploy --only hosting,firestore:rules,functions` to push everything live.

---

## Cloud Functions to redeploy

All three functions have pending changes by Session 2:
- `onProposalAccepted` — H4 + M2 fixes
- `onClientCounterOffer` — L2/L3 fixes
- `onSowSigned` — L2 fix

Deploy command:
```bash
GOOGLE_APPLICATION_CREDENTIALS=/tmp/firebase-sa.json \
  firebase --config portal/firebase.json deploy \
  --only hosting,firestore:rules,functions \
  --project dataskateclients --force
```

---

## Architecture state after Session 2

```
Negotiation:
  Client counter → negotiations/{id} (onSnapshot live)
  DS counter     → internal/negotiate-{slug}.html → negotiations/{id}
  Both sides see updates in real-time

Acceptance:
  proposals/{id} written with authoritative thread from negotiations/{id}
  localStorage for instant reload
  onProposalAccepted → project.json patched → Sol dispatched (no race)

SOW generation:
  run-sol.yml → Sol → sol.json → HTML → portal-content.json updated
  Portal card shows "View & Sign SOW →" immediately after deploy

SOW signing:
  sow_signatures/{id} → onSowSigned → sow-signed.json committed
  project.json status=sow_signed
```
