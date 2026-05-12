// Run once after Firebase project is created to seed existing engagements.
// Usage: node firebase/scripts/seed.js
//
// Requires: npm install -g firebase-admin
// Set env var: GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json

const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: process.env.FIREBASE_PROJECT_ID || 'dataskateclients'
});

const db = admin.firestore();

const projects = [
  {
    id: 'zyris',
    name: 'Zyris Dental',
    industry: 'dental / healthcare',
    architect: 'Kailash Chanda',
    architectEmail: 'kailash@dataskate.ai',
    status: 'intake_sent',
    completionPercent: 0,
    intakeUrl: '/intake/zyris.html',
    proposalUrl: '/proposal/zyris.html',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastActivityAt: admin.firestore.FieldValue.serverTimestamp()
  },
  {
    id: 'peerless',
    name: 'Peerless Fence Group',
    industry: 'construction / distribution',
    architect: 'Raghuram Potluri',
    architectEmail: 'raghuram@dataskate.ai',
    status: 'intake_sent',
    completionPercent: 0,
    intakeUrl: '/intake/peerless.html',
    proposalUrl: '/proposal/peerless.html',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastActivityAt: admin.firestore.FieldValue.serverTimestamp()
  },
  {
    id: 'mrn-healthcare',
    name: 'MRN Healthcare',
    industry: 'healthcare',
    architect: 'Kailash Chanda',
    architectEmail: 'kailash@dataskate.ai',
    status: 'proposal_sent',
    completionPercent: 0,
    intakeUrl: null,
    proposalUrl: '/proposal/mrn-healthcare.html',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastActivityAt: admin.firestore.FieldValue.serverTimestamp()
  }
];

async function seed() {
  for (const p of projects) {
    const { id, ...data } = p;
    await db.collection('projects').doc(id).set(data, { merge: true });
    console.log(`Seeded: ${id}`);
  }
  console.log('Done.');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
