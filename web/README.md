# Paddleup web

Marketing site + public session viewer for Paddleup, deployed to
Firebase Hosting.

Routes:

- `/` — landing page
- `/s/[id]` — public session viewer, fetched server-side from Firestore
  `publicSessions/{id}`

## Local dev

```bash
cd web
cp .env.example .env.local   # fill in NEXT_PUBLIC_FIREBASE_* values
npm install
npm run dev
```

Open <http://localhost:3000>. To preview a real shared session locally,
use the URL of any session you've toggled "Share publicly" on in the
phone app, e.g. `/s/<sessionId>`.

## Deploy

This project deploys to Firebase Hosting via the Next.js framework
integration (configured in `firebase/firebase.json`):

```bash
firebase deploy --only hosting
```

The first deploy provisions a Cloud Function for SSR automatically.

## Keep types in sync

`web/lib/types.ts` is a copy of the relevant subset of
`src/models/index.ts`. When you change the session schema, update both.
A future cleanup is to convert this repo into npm workspaces and share
the model package.
