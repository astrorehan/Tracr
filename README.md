# FinancialTracker

A lightweight, browser-first personal finance tracker. Track **multiple accounts** of any
type (cash, bank cards, e-wallets, crypto, stocks, custom), log income / expenses / transfers,
and see your balances and spending at a glance. Installs to your phone home screen as a PWA.

Built to grow: AI insights, WhatsApp logging, split bills, and Google Sheets export are
designed as additive phases (see [Roadmap](#roadmap)).

## Stack

- **Frontend:** Vite + React 19 + TypeScript, Tailwind CSS v4, TanStack Query
- **PWA:** `vite-plugin-pwa` (installable, offline shell, auto-generated icons)
- **Backend:** [Supabase](https://supabase.com) — Postgres + Row Level Security, Google OAuth,
  (later) Edge Functions for AI / WhatsApp / Sheets
- **Money:** stored as integer **minor units** — no floating-point drift

## Quick start

### 1. Install

```bash
npm install
```

### 2. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run the migration in [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
   This creates the tables, the `account_balances` view, RLS policies, and a trigger that
   seeds a profile + default categories on first sign-in.
3. **Authentication → Providers → Google:** enable it and paste a Google OAuth client
   (create one in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials);
   set the authorized redirect URI to `https://<your-project-ref>.supabase.co/auth/v1/callback`).
4. **Authentication → URL Configuration:** add your dev URL `http://localhost:5173` (and your
   production URL later) to the redirect allow-list.

### 3. Configure environment

```bash
cp .env.example .env.local
```

Fill in from **Project Settings → API** (only the public anon key belongs in the client):

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

### 4. Run

```bash
npm run dev      # http://localhost:5173
npm run build    # type-check + production build to dist/
npm run preview  # serve the production build
```

If env vars are missing the app shows a setup screen instead of crashing.

## Deploy

Any static host works. For **Vercel**: import the repo, framework preset **Vite**, add the two
`VITE_` env vars, deploy. Then add the production domain to Supabase's redirect allow-list.

## Install on your phone (the "shortcut")

Open the deployed URL on your phone → browser menu → **Add to Home Screen**. It launches
full-screen like a native app. (Real Android/iOS store apps can come later via Capacitor — the
SPA is wrapper-ready.)

## Project structure

```
src/
  app/         # route pages (Dashboard, Accounts, Transactions, Settings, Login)
  components/  # app shell + UI primitives (Button, Card, Input, Modal, States)
  features/    # feature-sliced: auth, accounts, categories, transactions, settings
  lib/         # supabase client, query client, money + currency utils
  types/       # DB row types mirroring the SQL schema
supabase/
  migrations/  # versioned SQL (schema, RLS, balances view, seed trigger)
```

## How money works

Amounts are stored as integer minor units (e.g. cents; IDR has 0 decimals, BTC has 8).
All conversion goes through [`src/lib/money.ts`](src/lib/money.ts). Account balances are computed
**server-side** by the `account_balances` SQL view (opening balance + signed movements, with
transfers debiting the source and crediting the destination), so the client never recomputes money.

> Multi-currency note: net worth is shown per currency. Cross-currency transfers are blocked in
> the UI for now; FX conversion + historical snapshots are a planned enhancement.

## Roadmap

Phase 0–2 (this codebase) ship the installable web MVP. Later phases are additive and isolated
as Supabase Edge Functions so secrets never reach the browser:

- **AI insights** — `ai-insights` edge function summarizes spending on demand
- **WhatsApp logging** — `whatsapp-webhook` parses messages into transactions
- **Split bills** — track shared bills; QRIS via a payment aggregator once registered (paid)
- **Google Sheets export** — `sheets-export` pushes transactions to a user-owned sheet
- **Native apps** — wrap the SPA with Capacitor for Play Store / App Store

See the full plan in `~/.claude/plans/` for details and trade-offs.
