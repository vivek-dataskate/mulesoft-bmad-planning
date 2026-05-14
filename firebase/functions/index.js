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
    const githubPath = `Krisp/${folderSlug}.json`;

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

    // 2. Commit to GitHub _inbox/{date}-{title}/krisp-meeting.json
    try {
      const token = githubToken.value().trim();
      await commitToGitHub(
        token,
        githubPath,
        JSON.stringify(payload, null, 2),
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
