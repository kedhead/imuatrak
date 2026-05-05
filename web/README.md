# ImuaTrak web

Marketing site + public session viewer for ImuaTrak, deployed to Vercel
at <https://imuatrak.app>.

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

Vercel auto-detects Next.js — connect the GitHub repo to a Vercel
project, set the **Root Directory** to `web`, and add the
`NEXT_PUBLIC_FIREBASE_*` env vars in Project Settings → Environment
Variables. Pushes to `main` deploy to production; every PR gets a
preview URL.

## Keep types in sync

`web/lib/types.ts` is a copy of the relevant subset of
`src/models/index.ts`. When you change the session schema, update both.
A future cleanup is to convert this repo into npm workspaces and share
the model package.
