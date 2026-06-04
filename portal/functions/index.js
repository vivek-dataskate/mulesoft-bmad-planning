const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const fetch = require('node-fetch');

admin.initializeApp();

const githubToken = defineSecret('GITHUB_TOKEN');
const krispWebhookSecret = defineSecret('KRISP_WEBHOOK_SECRET');

const GITHUB_REPO = 'vivek-dataskate/mulesoft-bmad-planning';
const GITHUB_BRANCH = 'main';

exports.syncResponseToGitHub = onDocumentWritten(
  { document: 'intake_responses/{clientId}', secrets: [githubToken] },
  async (event) => {
    if (!event.data.after.exists()) return;

    const clientId = event.params.clientId;
    const data = event.data.after.data();
    const token = githubToken.value();

    const filePath = `projects/${clientId}/intake/responses.json`;
    const encodedContent = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
    const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`;

    const headers = {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'dataskate-portal'
    };

    let sha;
    try {
      const getRes = await fetch(`${apiUrl}?ref=${GITHUB_BRANCH}`, { headers });
      if (getRes.ok) sha = (await getRes.json()).sha;
    } catch (e) {}

    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: `intake: ${clientId} responses updated [skip ci]`,
        content: encodedContent,
        branch: GITHUB_BRANCH,
        ...(sha ? { sha } : {})
      })
    });

    if (!putRes.ok) {
      console.error(`GitHub write failed for ${clientId}:`, await putRes.text());
    } else {
      console.log(`Committed ${filePath} to GitHub`);
    }
  }
);

// Helper — slugify a meeting title into a safe folder name
function toSlug(title) {
  return (title || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

// Helper — commit (create or update) a file in the GitHub repo
async function commitToGitHub(token, filePath, content, message) {
  const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`;
  const headers = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'dataskate-portal'
  };

  let sha;
  try {
    const getRes = await fetch(`${apiUrl}?ref=${GITHUB_BRANCH}`, { headers });
    if (getRes.ok) sha = (await getRes.json()).sha;
  } catch (e) {}

  const putRes = await fetch(apiUrl, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message,
      content: Buffer.from(content).toString('base64'),
      branch: GITHUB_BRANCH,
      ...(sha ? { sha } : {})
    })
  });

  if (!putRes.ok) throw new Error(await putRes.text());
}

// ── onProposalAccepted ────────────────────────────────────────────────────────
// Fires when a client clicks "Accept Proposal" and the browser writes to
// proposals/{clientId}. On first acceptance it:
//   1. Patches projects/{clientId}/project.json → status:"accepted" in GitHub
//   2. Dispatches the run-sol GitHub Actions workflow to generate the SOW
// ── onSowSigned ──────────────────────────────────────────────────────────────
// Fires when a client submits their e-signature on the SOW page.
// On first signature it:
//   1. Commits a notification file to GitHub so the architect gets a GH notification
//   2. Updates project.json → status:"sow_signed" in GitHub
// ── onClientCounterOffer ──────────────────────────────────────────────────────
// Fires when the negotiations/{clientId} document is written.
// When a client submits a counter-offer, notifies the architect via GitHub.
// DataSkate responds by adding a new entry to the thread[] in Firebase Console.
exports.onClientCounterOffer = onDocumentWritten(
  { document: 'negotiations/{clientId}', secrets: [githubToken] },
  async (event) => {
    if (!event.data.after.exists()) return;

    const before = event.data.before.exists() ? (event.data.before.data().thread || []) : [];
    const after  = event.data.after.data().thread || [];

    // Find newly added client entries
    const newClientEntries = after.slice(before.length).filter(e => e.by === 'client');
    if (!newClientEntries.length) return;

    const clientId = event.params.clientId;
    const token    = githubToken.value().trim();
    const latest   = newClientEntries[newClientEntries.length - 1];

    console.log(`Counter-offer for ${clientId}: ${latest.amount || 'no amount'} from ${latest.authorName}`);

    const notifContent = JSON.stringify({
      event:        'client_counter_offer',
      client:       clientId,
      from:         { name: latest.authorName, amount: latest.amount, note: latest.note },
      submittedAt:  latest.ts,
      fullThread:   after,
      nextAction:   `Respond by adding to negotiations/${clientId}.thread[] in Firebase Console with by:"dataskate".`,
      firebaseUrl:  `https://console.firebase.google.com/project/dataskateclients/firestore/data/negotiations/${clientId}`,
    }, null, 2);

    try {
      await commitToGitHub(token,
        `projects/${clientId}/delivery/negotiation-log.json`,
        notifContent,
        `negotiation: counter-offer ${ latest.amount ? latest.amount + ' ' : ''}from ${latest.authorName || 'client'} for ${clientId}`
      );
      console.log(`Negotiation notification committed for ${clientId}`);
    } catch (e) {
      console.error(`Negotiation notification commit failed:`, e.message);
    }
  }
);

exports.onSowSigned = onDocumentWritten(
  { document: 'sow_signatures/{clientId}', secrets: [githubToken] },
  async (event) => {
    if (!event.data.after.exists()) return;

    const before = event.data.before.exists() ? event.data.before.data() : {};
    const after  = event.data.after.data();

    // Only fire once — when clientSignedAt first appears
    if (before.clientSignedAt || !after.clientSignedAt) return;

    const clientId = event.params.clientId;
    const token    = githubToken.value().trim();
    const signedBy = after.clientName  || 'unknown';
    const title    = after.clientTitle || '';
    const email    = after.clientEmail || '';
    const date     = after.clientSignedDate || new Date().toISOString().slice(0, 10);

    console.log(`SOW signed for ${clientId} by ${signedBy} (${email})`);

    // 1. Commit a notification file — gives architect a GitHub notification
    const notifPath    = `projects/${clientId}/delivery/sow-signed.json`;
    const notifContent = JSON.stringify({
      event:       'sow_client_signed',
      client:      clientId,
      signedBy:    { name: signedBy, title, email },
      signedDate:  date,
      signedAt:    new Date().toISOString(),
      nextAction:  'Countersign the SOW and email the fully executed PDF to the client within 1 business day.',
      sowUrl:      `https://dataskateclients.web.app/delivery/sow-${clientId}.html`,
    }, null, 2);

    try {
      await commitToGitHub(token, notifPath, notifContent,
        `delivery: SOW signed by ${signedBy} for ${clientId} — countersign required`);
      console.log(`Committed ${notifPath} to GitHub`);
    } catch (e) {
      console.error(`GitHub notification commit failed for ${clientId}:`, e.message);
    }

    // 2. Patch project.json → status:"sow_signed"
    const projPath = `projects/${clientId}/project.json`;
    try {
      const apiUrl  = `https://api.github.com/repos/${GITHUB_REPO}/contents/${projPath}`;
      const headers = {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'dataskate-portal'
      };
      let existing = {}, sha;
      try {
        const getRes = await fetch(`${apiUrl}?ref=${GITHUB_BRANCH}`, { headers });
        if (getRes.ok) { const j = await getRes.json(); sha = j.sha; existing = JSON.parse(Buffer.from(j.content, 'base64').toString('utf8')); }
      } catch (e) {}

      const signedTs = after.clientSignedAt;
      const sowSignedAt = signedTs?.toMillis ? new Date(signedTs.toMillis()).toISOString()
                        : signedTs?.seconds   ? new Date(signedTs.seconds * 1000).toISOString()
                        : new Date().toISOString();
      const patched = { ...existing, status: 'sow_signed', sowSignedAt, sowSignedBy: { name: signedBy, title, email } };
      await fetch(apiUrl, {
        method: 'PUT', headers,
        body: JSON.stringify({
          message: `delivery: project.json status=sow_signed for ${clientId} [skip ci]`,
          content: Buffer.from(JSON.stringify(patched, null, 2)).toString('base64'),
          branch:  GITHUB_BRANCH,
          ...(sha ? { sha } : {})
        })
      });
      console.log(`project.json status=sow_signed for ${clientId}`);
    } catch (e) {
      console.error(`project.json patch failed for ${clientId}:`, e.message);
    }
  }
);

exports.onProposalAccepted = onDocumentWritten(
  { document: 'proposals/{clientId}', secrets: [githubToken] },
  async (event) => {
    if (!event.data.after.exists()) return; // deletion — ignore

    const before = event.data.before.exists() ? event.data.before.data() : {};
    const after  = event.data.after.data();

    // Only fire once — when acceptedAt first appears
    if (before.acceptedAt || !after.acceptedAt) return;

    const clientId = event.params.clientId;
    const token    = githubToken.value().trim();

    console.log(`Proposal accepted for ${clientId} by ${JSON.stringify(after.acceptedBy)}`);

    // 1. Patch project.json → status:"accepted"
    const projPath = `projects/${clientId}/project.json`;
    try {
      const apiUrl  = `https://api.github.com/repos/${GITHUB_REPO}/contents/${projPath}`;
      const headers = {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'dataskate-portal'
      };

      let existing = {}, sha;
      try {
        const getRes = await fetch(`${apiUrl}?ref=${GITHUB_BRANCH}`, { headers });
        if (getRes.ok) {
          const j = await getRes.json();
          sha      = j.sha;
          existing = JSON.parse(Buffer.from(j.content, 'base64').toString('utf8'));
        }
      } catch (e) {}

      const ts = after.acceptedAt;
      const isoDate = ts?.toMillis ? new Date(ts.toMillis()).toISOString()
                    : ts?.seconds   ? new Date(ts.seconds * 1000).toISOString()
                    : new Date().toISOString();

      const negSnap = await admin.firestore().collection('negotiations').doc(clientId).get();
      const fullThread = negSnap.exists ? (negSnap.data().thread || []) : (after.negotiationThread || []);

      const patched = {
        ...existing,
        status:        'accepted',
        acceptedAt:    isoDate,
        acceptedBy:    after.acceptedBy    || null,
        acceptedPrice: after.acceptedPrice || null,
        acceptedModel: after.acceptedModel || null,
        negotiationThread: fullThread.length ? fullThread : null,
      };

      const putRes = await fetch(apiUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message: `delivery: proposal accepted for ${clientId} — marking status=accepted [skip ci]`,
          content: Buffer.from(JSON.stringify(patched, null, 2)).toString('base64'),
          branch:  GITHUB_BRANCH,
          ...(sha ? { sha } : {})
        })
      });

      if (!putRes.ok) {
        console.error(`project.json patch failed for ${clientId}:`, await putRes.text());
      } else {
        console.log(`project.json status=accepted committed for ${clientId}`);
      }
    } catch (e) {
      console.error(`project.json patch threw for ${clientId}:`, e.message);
    }

    // 2. Dispatch run-sol GitHub Actions workflow
    try {
      const dispatchRes = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/run-sol.yml/dispatches`,
        {
          method: 'POST',
          headers: {
            Authorization: `token ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'dataskate-portal'
          },
          body: JSON.stringify({ ref: GITHUB_BRANCH, inputs: { client: clientId, triggered_by: 'acceptance' } })
        }
      );
      if (dispatchRes.status === 204) {
        console.log(`run-sol workflow dispatched for ${clientId}`);
      } else {
        console.error(`workflow dispatch failed for ${clientId}:`, await dispatchRes.text());
      }
    } catch (e) {
      console.error(`workflow dispatch threw for ${clientId}:`, e.message);
    }
  }
);

exports.krispWebhook = onRequest(
  { secrets: [githubToken, krispWebhookSecret] },
  async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).send('Method Not Allowed');
    }

    // Token auth — Krisp sends the secret as a query param or Authorization bearer
    const secret = krispWebhookSecret.value();
    if (secret) {
      const qToken = req.query.token;
      const bearerToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (qToken !== secret && bearerToken !== secret) {
        return res.status(401).send('Unauthorized');
      }
    }

    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).send('Expected JSON body');
    }

    // Derive a stable meeting ID and human-readable title from the payload
    const meetingId =
      payload.id ||
      payload.meeting_id ||
      payload.meetingId ||
      `krisp-${Date.now()}`;

    const title =
      payload.title ||
      payload.meeting_title ||
      payload.meetingTitle ||
      meetingId;

    const startTime =
      payload.start_time ||
      payload.startTime ||
      payload.created_at ||
      new Date().toISOString();

    const datePrefix = new Date(startTime).toISOString().slice(0, 10); // YYYY-MM-DD
    const folderSlug = `${datePrefix}-${toSlug(title)}`;
    const githubPath = `_inbox/Krisp/${folderSlug}/krisp-meeting.json`;

    // 1. Save to Firestore
    try {
      await admin
        .firestore()
        .collection('krisp_meetings')
        .doc(String(meetingId))
        .set({ ...payload, _receivedAt: FieldValue.serverTimestamp() }, { merge: true });
      console.log(`Saved Krisp meeting ${meetingId} to Firestore`);
    } catch (e) {
      console.error('Firestore write failed:', e.message);
      return res.status(500).json({ error: 'firestore', message: e.message });
    }

    // 2. Commit to GitHub — strip any presigned/signed URL fields that embed
    // temporary AWS credentials (Krisp embeds STS keys in recording_url).
    const REDACTED_URL_KEYS = new Set([
      'recording_url', 'recordingUrl', 'recording_link',
      'audio_url', 'audioUrl', 'video_url', 'videoUrl',
      'download_url', 'downloadUrl'
    ]);
    function sanitizeForGitHub(obj) {
      if (!obj || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(sanitizeForGitHub);
      return Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [
          k,
          REDACTED_URL_KEYS.has(k) ? '[redacted — presigned URL]' : sanitizeForGitHub(v)
        ])
      );
    }

    try {
      const token = githubToken.value().trim();
      await commitToGitHub(
        token,
        githubPath,
        JSON.stringify(sanitizeForGitHub(payload), null, 2),
        `inbox: Krisp meeting "${title}" [skip ci]`
      );
      console.log(`Committed ${githubPath} to GitHub`);
    } catch (e) {
      console.error('GitHub commit failed:', e.message);
      return res.status(200).json({ ok: true, folder: folderSlug, githubError: e.message });
    }

    return res.status(200).json({ ok: true, folder: folderSlug });
  }
);
