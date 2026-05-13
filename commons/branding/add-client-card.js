#!/usr/bin/env node
// commons/branding/add-client-card.js
// Registers a new client in the architect portal (Firestore `projects` collection).
// Called by Scout after generating intake + proposal for a new client.
//
// Usage:
//   node commons/branding/add-client-card.js --client acme
//   node commons/branding/add-client-card.js --client acme --status intake_sent
//
// The script reads projects/{client}/project.json for metadata, then writes
// a document to Firestore so the client appears in the architect portal.
//
// Requires firebase-admin and a service account key:
//   npm install firebase-admin
//   export GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
// OR set the env var FIREBASE_SA_KEY to the service-account JSON string.

'use strict';
const fs   = require('fs');
const path = require('path');

const args       = process.argv.slice(2);
const clientIdx  = args.indexOf('--client');
const client     = clientIdx !== -1 ? args[clientIdx + 1] : null;
const statusIdx  = args.indexOf('--status');
const statusArg  = statusIdx !== -1 ? args[statusIdx + 1] : 'intake_sent';

const VALID_STATUSES = [
  'intake_sent', 'intake_in_progress', 'intake_complete',
  'proposal_sent', 'in_progress', 'complete'
];

if (!client) {
  console.error('Usage: node add-client-card.js --client <slug> [--status <status>]');
  console.error('  Status options:', VALID_STATUSES.join(', '));
  process.exit(1);
}

if (!VALID_STATUSES.includes(statusArg)) {
  console.error(`❌ Invalid status "${statusArg}". Valid options: ${VALID_STATUSES.join(', ')}`);
  process.exit(1);
}

const root        = path.resolve(__dirname, '../..');
const projectFile = path.join(root, 'projects', client, 'project.json');

if (!fs.existsSync(projectFile)) {
  console.error(`❌ project.json not found: ${projectFile}`);
  console.error(`   Run Scout for the client first to create the project directory.`);
  process.exit(1);
}

const project = JSON.parse(fs.readFileSync(projectFile, 'utf8'));

const FIREBASE_HOST = 'dataskateclients';
const FIREBASE_CONFIG = {
  projectId: FIREBASE_HOST,
};

// Build portal URLs from Firebase hosting paths
const intakeUrl   = `https://${FIREBASE_HOST}.web.app/portal/${client}.html`;
const proposalUrl = project.proposalUrl || null;

// Detect SA credentials
let admin;
try {
  admin = require('firebase-admin');
} catch {
  console.error('❌ firebase-admin not installed. Run: npm install firebase-admin');
  process.exit(1);
}

let credential;
if (process.env.FIREBASE_SA_KEY) {
  const sa = JSON.parse(process.env.FIREBASE_SA_KEY);
  credential = admin.credential.cert(sa);
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  credential = admin.credential.applicationDefault();
} else {
  console.error('❌ No Firebase credentials found.');
  console.error('   Set GOOGLE_APPLICATION_CREDENTIALS to a service-account key file path, or');
  console.error('   set FIREBASE_SA_KEY to the service-account JSON string.');
  process.exit(1);
}

admin.initializeApp({ credential, projectId: FIREBASE_CONFIG.projectId });
const db = admin.firestore();

const record = {
  name:              project.clientName || client,
  slug:              client,
  industry:          project.industry   || project.vertical || '',
  architect:         project.architect  || '',
  architectEmail:    project.architectEmail || '',
  status:            statusArg,
  completionPercent: 0,
  intakeUrl,
  proposalUrl,
  createdAt:         admin.firestore.FieldValue.serverTimestamp(),
  lastActivityAt:    admin.firestore.FieldValue.serverTimestamp(),
};

db.collection('projects').doc(client).set(record, { merge: true })
  .then(() => {
    console.log(`✓ Client "${record.name}" registered in architect portal`);
    console.log(`  Firestore ID: ${client}`);
    console.log(`  Status:       ${statusArg}`);
    console.log(`  Intake URL:   ${intakeUrl}`);
    if (proposalUrl) console.log(`  Proposal URL: ${proposalUrl}`);
    console.log(`\n  View at: https://${FIREBASE_HOST}.web.app`);
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Firestore write failed:', err.message);
    process.exit(1);
  });
