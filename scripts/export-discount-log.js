#!/usr/bin/env node
// Export discount log from Firestore → CSV.
// Usage:
//   node scripts/export-discount-log.js
//   node scripts/export-discount-log.js --project agilemind
//   node scripts/export-discount-log.js --out /tmp/discounts.csv

'use strict';
const fs   = require('fs');
const path = require('path');

const args       = process.argv.slice(2);
const outIdx     = args.indexOf('--out');
const outFile    = outIdx !== -1 ? args[outIdx + 1] : path.join(process.cwd(), 'discount-log.csv');
const projIdx    = args.indexOf('--project');
const filterSlug = projIdx !== -1 ? args[projIdx + 1] : null;

// Firebase Admin SDK — try installed locations
let admin;
const candidatePaths = [
  path.join(__dirname, '../node_modules/firebase-admin'),
  path.join(__dirname, '../firebase/functions/node_modules/firebase-admin'),
];
for (const p of candidatePaths) {
  if (fs.existsSync(p)) { admin = require(p); break; }
}
if (!admin) {
  console.error('ERROR: firebase-admin not found. Run: npm install firebase-admin');
  process.exit(1);
}

const saKey = process.env.FIREBASE_SA_KEY;
if (!saKey && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('ERROR: Set FIREBASE_SA_KEY or GOOGLE_APPLICATION_CREDENTIALS env var.');
  process.exit(1);
}

const tmpKey = '/tmp/firebase-sa-discount-export.json';
if (saKey) {
  fs.writeFileSync(tmpKey, saKey);
  process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpKey;
}

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
}
const db = admin.firestore();

(async () => {
  try {
    const col  = db.collection('discountLog');
    const snap = filterSlug
      ? await col.where('project', '==', filterSlug).get()
      : await col.get();

    const CSV_COLS = ['Date', 'Project', 'Client', 'Architect', 'Model', 'Listed Rate', 'Proposed Rate', 'Has Discount', 'Contact Name', 'Notes'];
    const rows = [CSV_COLS];

    snap.forEach(doc => {
      const data    = doc.data();
      const entries = data.entries || [];
      for (const e of entries) {
        rows.push([
          e.ts ? new Date(e.ts).toLocaleDateString('en-US') : '',
          e.project  || data.project || doc.id,
          e.client   || data.client  || '',
          e.architect || '',
          e.model || '',
          e.listedRate   || '',
          e.proposedRate || '',
          e.hasDiscount  ? 'Yes' : 'No',
          e.contactName  || '',
          (e.notes || '').replace(/[\r\n]+/g, ' '),
        ]);
      }
    });

    const csv = rows
      .map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','))
      .join('\n');

    fs.writeFileSync(outFile, csv, 'utf8');
    console.log(`✓ Exported ${rows.length - 1} discount entries → ${outFile}`);
    if (filterSlug) console.log(`  (filtered to project: ${filterSlug})`);
  } finally {
    if (saKey && fs.existsSync(tmpKey)) fs.unlinkSync(tmpKey);
    process.exit(0);
  }
})();
