# DataSkate Portal — Firebase Setup (one-time)

## Prerequisites
- Node.js 18+
- Firebase CLI: `npm install -g firebase-tools`

---

## Step 1 — Create Firebase project

1. Go to https://console.firebase.google.com
2. Click **Add project** → name it `dataskate-portal` (or similar)
3. Disable Google Analytics (not needed)
4. Note your **Project ID** (e.g. `dataskate-portal-abc12`)

---

## Step 2 — Enable Firebase services

In Firebase Console for your new project:

1. **Authentication** → Get started → Sign-in method → **Google** → Enable
2. **Firestore Database** → Create database → **Production mode** → choose a region (e.g. `us-east1`)
3. **Hosting** → Get started (just click through the wizard)
4. **Functions** → Upgrade to **Blaze plan** (pay-as-you-go — required for outbound HTTP calls to GitHub)

---

## Step 3 — Fill in your config

1. Firebase Console → Project Settings → Your apps → **Add app** → Web
2. Register the app, copy the `firebaseConfig` object
3. Paste the values into `firebase/public/firebase-config.js`
4. Update `firebase/.firebaserc` with your project ID

---

## Step 4 — Authorize your domain (Google Sign-In)

Firebase Console → Authentication → Settings → **Authorized domains** → add your Hosting domain:
```
YOUR_PROJECT_ID.web.app
YOUR_PROJECT_ID.firebaseapp.com
```

---

## Step 5 — Set GitHub PAT for write-back

1. Go to https://github.com/settings/tokens → Generate new token (classic)
2. Scopes: `repo` (full repo access)
3. Run:
```bash
cd firebase
firebase functions:config:set github.token="YOUR_PAT_HERE"
```

---

## Step 6 — Login and deploy

```bash
firebase login
cd firebase
bash deploy.sh
```

The deploy script:
- Copies intake + proposal HTML into `firebase/public/`
- Installs function dependencies
- Deploys hosting, Firestore rules, and Functions

---

## Step 7 — Seed existing projects

```bash
# Download service account key: Firebase Console → Project Settings → Service accounts → Generate new private key
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json
export FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
node firebase/scripts/seed.js
```

---

## Ongoing workflow

### New client engagement
1. Run Scout → generates intake questionnaire in `projects/{client}/intake/`
2. Run `bash firebase/deploy.sh` to publish the new intake form to the portal
3. Share the intake URL with the client: `https://YOUR_PROJECT.web.app/intake/{client}.html`
4. Client fills the form and clicks "Submit" — responses auto-save to Firestore
5. Firebase Function commits `projects/{client}/intake/responses.json` to this repo
6. Architect sees completion status live in the portal
7. You run the Analyst agent — it reads `responses.json` directly from the repo

### Re-deploying after HTML changes
```bash
bash firebase/deploy.sh
```

---

## Portal URL
`https://YOUR_PROJECT_ID.web.app`
— restricted to @dataskate.ai Google accounts
