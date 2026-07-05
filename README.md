# Billing Operations App

A web app for managing daily billing operations: report ingestion, unbilled/defective
classification, field-staff ATR workflow, billing-clerk correction tracking, and a
consolidated dashboard.

See `Billing_Operations_App_Architecture.md` for the full design reasoning.

## What's inside

```
billing-app/
├── server/           <- Backend (Node.js + Express + built-in SQLite)
│   ├── server.js
│   ├── db.js         <- database schema
│   ├── seed.js        <- loads default clerk rules & substation groups
│   ├── lib/classify.js <- all business rules in one place
│   └── routes/        <- upload, dashboard, cases, export APIs
├── public/            <- Frontend (plain HTML/CSS/JS, no build step needed)
│   ├── index.html     <- role picker (Admin / Field Staff / Billing Clerk)
│   ├── admin.html
│   ├── field.html
│   └── clerk.html
└── local-helper/      <- Small Python script for your PC (auto FTP fetch + upload)
```

## Running it locally (to try it out)

You'll need [Node.js](https://nodejs.org) version 22 or later installed.

```bash
cd server
npm install
node seed.js        # one-time: loads default clerk rules & substation groups
node server.js
```

Then open **http://localhost:3000** in your browser.

## First-time setup inside the app

1. Go to **Admin > Upload Reports** and upload your first day's 4 CSV files to see
   real data flow through.
2. Go to **Admin > Configuration** and add your **12 field staff members**, mapping
   each to their substation(s). Use the exact names shown in the "Known Substations"
   list on that page (these come straight from your uploaded data, including the
   internal codes like `SHIPRI_20053` — the app matches names ignoring these codes,
   so typing just `SHIPRI` also works).
3. The 5 billing clerk rules and substation groups are pre-loaded from what you
   described — double check them under Admin > Configuration.

## Known data-matching note

Two points worth checking once you have full daily files flowing (noted in
Section 11 of the architecture doc):
- One substation, **GURSARAI**, appeared in the sample data but wasn't part of
  your original Group 1 / Group 2 list — it will fall into "Unassigned" for
  clerk-rule purposes until you confirm which group it belongs to.
- Substation names in the real data include hidden codes (e.g. `JAIL CHOWRAHA_20051`)
  and slightly different spellings than commonly spoken (e.g. "SHIPRI" not "SIPRI").
  The matching logic ignores the codes and was updated with the real spellings —
  but if you add new substations later, use the "Known Substations" list in
  Admin > Configuration as the source of truth for exact spelling.

## Deploying so everyone can access it (free-tier hosting)

Recommended: **Render.com** (has a free tier, straightforward for non-programmers).

1. Create a free account at https://render.com
2. Push this `server/` + `public/` code to a GitHub repository (I can help with
   this step when you're ready).
3. In Render: **New > Web Service** → connect your GitHub repo
   - Build command: `npm install`
   - Start command: `node server.js`
   - Root directory: repository root (so it can see both `server/` and `public/`)
4. Once deployed, Render gives you a URL like `https://billing-ops-xyz.onrender.com`
   — this is the link you'll share with field staff and billing clerks.
5. Put that same URL + `/api/upload` into `local-helper/config.json` as `app_upload_url`.

**Important note on data persistence:** Render's free tier does not guarantee the
filesystem (where the SQLite database file lives) survives every restart/redeploy.
For a serious production rollout, the database should move to a proper free-tier
hosted database (e.g. Render's free PostgreSQL, or Neon/Supabase) rather than the
local SQLite file. This is a manageable follow-up step — flag it and it can be
migrated without changing any of the business logic, only the `db.js` connection layer.

## No login (by design, as decided)

This app currently has **no authentication** — anyone with the link can access it.
This was an explicit decision (see architecture doc, Section 4/11). If you'd like to
add a lightweight PIN-based check later, it can be layered in without disrupting
anything already built.
