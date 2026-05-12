const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

admin.initializeApp();

const githubToken = defineSecret('GITHUB_TOKEN');

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
