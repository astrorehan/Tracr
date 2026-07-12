# GoPay-Style UI/UX Transformation — Phased Plan

> Working note / handoff brief. Supersedes the direction in `UI_UX_THEME.md` v2.0
> ("The Well-Kept Ledger", monochrome). When a phase ships, update that spec to v3.

## Vision

Transform Tracr from an editorial, monochrome "ledger" into a **friendly e-wallet
experience in the GoPay mold**: a warm home screen with a balance card, tappable
icon tiles, plain everyday words, and zero intimidation. The target user is not a
finance person — it's the *orang awam* / unbanked user on a cheap Android phone
with patchy internet.

Five product requirements drive every decision:

1. **GoPay-familiar UI** — balance card up top, quick-action icon grid, simple
   bottom navigation, colorful-but-disciplined icon chips, big rounded cards.
2. **UX for laypeople** — plain language (existing rule: no finance jargon),
   one obvious action per screen, no dashboards that look like homework.
3. **User-friendly** — 48px touch targets, readable type at arm's length,
   forgiving flows (undo, confirmations in plain words).
4. **Feels secure** — hide-balance toggle (the e-wallet trust signal), privacy
   copy in human words, later an optional PIN lock.
5. **Light on low-end devices & bad networks** — no GPU-heavy effects, fewer
   font downloads (self-hosted), small initial bundle, PWA offline-first.

### What already works in our favor (keep, don't rebuild)

- All colors flow through CSS variables in `src/index.css` → Tailwind v4
  `@theme inline`. Retheming the token layer restyles ~90% of the app for free.
- Light/dark mode already exists (`src/features/settings/theme.tsx`, `.dark`
  class, toggle in `AppLayout`). This plan restyles both modes, it doesn't build them.
- Route-level code splitting (`src/App.tsx`), `prefers-reduced-motion` support,
  safe-area insets, text-size setting, PWA plumbing (`vite-plugin-pwa`).
- Mobile bottom nav + center "add" button already exist in `AppLayout` — they
  need restyling, not inventing.

### Deliberate reversals of the current spec

`UI_UX_THEME.md` §1 bans "icon-in-a-tinted-squircle" and "color everywhere".
The GoPay pattern **embraces** tinted icon chips and a colored brand. This is an
intentional pivot, not an accident — the monochrome/editorial voice reads
"premium tool for finance-literate people", which is the opposite of this
audience. Color discipline still applies (see palette), just with a friendlier
baseline.

---

## Decisions — CONFIRMED with Raihan, 12 Jul 2026 (do not re-ask)

1. **Brand color: e-wallet blue. CONFIRMED.** Deep blue for interactive
   text/buttons, bright cyan only in gradients. **Logo/favicon re-tint is
   DEFERRED** — Raihan will handle the logo later; do not touch logo assets or
   the `fix/favicon` branch as part of this redesign. (An amber logo next to a
   blue UI is accepted temporarily.)
2. **Language: Bahasa later. CONFIRMED.** Plain-English copy pass inside each
   phase now; full i18n (Bahasa default + English toggle) stays Phase 6, not
   blocking visual work.
3. **Home screen density: simple home. CONFIRMED (research-backed).** UX
   research on low-literacy/unbanked users shows text-heavy UIs score near-0%
   task completion with non-literate users, and effective designs minimize
   hierarchy, lead with icons/recognition over reading, and favor one scrollable
   page over segmented views. GoPay itself leads with a large balance area +
   quick-action menus + history. So: home = balance card, quick actions,
   this-month strip, recent activity — **zero charts** (Phase 4); all 5 charts
   move to Reports for the curious.
4. **Typeface: Plus Jakarta Sans, self-hosted. CONFIRMED** (explained to
   Raihan in plain terms: one friendly font bundled with the app replaces two
   fonts downloaded from external servers — loads faster on slow connections
   and works offline).

---

## Design tokens (starting values — validate AA contrast before shipping)

All in `src/index.css` `:root` / `.dark`, mapped via `@theme inline`. Keep every
existing token *name* (`--primary`, `--surface`, …) so no component breaks;
change only values and add the new ones marked ➕.

| Token | Light | Dark | Role |
| :--- | :--- | :--- | :--- |
| `--background` | `#F2F6FA` cool mist | `#0C1219` deep navy | App canvas (never pure black — cheap AMOLED smearing) |
| `--surface` | `#FFFFFF` | `#151C25` | Cards, panels |
| `--surface-muted` | `#EAF0F6` | `#1D2733` | Inset fields, hovers |
| `--border` | `#DFE7EF` | `#28343F` | Hairlines |
| `--foreground` | `#17222E` | `#E8EEF4` | Text ink (soft navy, not black) |
| `--muted-foreground` | `#5B6B7C` | `#94A3B4` | Secondary text |
| `--primary` | `#0072BC` deep blue | `#3EC6F0` bright cyan | Buttons, links, active nav |
| `--primary-foreground` | `#FFFFFF` | `#062733` | Text on primary |
| ➕ `--primary-soft` | `#E3F3FC` | `#123243` | Tinted chip/nav-pill backgrounds |
| ➕ `--brand-bright` | `#00AED6` | `#00AED6` | Gradient companion only — never text |
| `--positive` | `#0E9F5B` | `#42D392` | Money in |
| `--negative` / `--danger` | `#E5484D` | `#FF7A7E` | Money out, destructive |
| ➕ `--warning` | `#D97706` | `#F5A524` | Due soon / near budget limit |
| ➕ chip accents ×4 | blue/green/orange/violet pastel pairs | darker tints | Quick-action tiles & category icon chips **only** |

**Gradient device:** the balance card (and only the balance card + login hero)
gets `linear-gradient(135deg, var(--primary), var(--brand-bright))` — the one
"wow" surface, like GoPay's saldo card. Everything else stays flat and cheap to
paint.

**Color discipline, new edition:** blue = interactive; green/red = money
direction only; chip accents live only inside icon chips/tiles; text is never
colored for decoration.

---

## Phase 1 — Foundation: tokens, type, brand *(S–M, ships alone, retheming ~90% of the app)*

- [ ] Rewrite palette values in `src/index.css` (`:root`, `.dark`) per table above;
      add ➕ tokens to `@theme inline` (`--color-primary-soft`, etc.).
- [ ] Fonts: remove Fraunces + Fontshare links from `index.html`; self-host
      Plus Jakarta Sans (400/500/600/700/800, latin subset, woff2 in
      `public/fonts/` + `@font-face` with `font-display: swap`). Update `body`,
      `h1/.font-display`, `.section-head` (serif-italic → bold sans), and
      `.font-numeric` stacks in `src/index.css`.
- [ ] Soften the "ledger devices" so old pages stay coherent pre-sweep:
      `.leaders` dotted lines → lighter or plain gap; `.grain`/ambient grid
      backdrop (`.app-atmosphere`) → remove or make near-invisible (paint cost).
- [ ] `index.html`: `theme-color` `#0072BC` (+ dark variant meta), title/description
      copy check. `vite.config.ts`: PWA manifest `theme_color`/`background_color`.
- [ ] ~~Logo/favicon re-tint~~ **DEFERRED — Raihan handles the logo later.**
      Do not modify logo/favicon assets in this redesign.
- [ ] Update `UI_UX_THEME.md` → v3 stub pointing at this plan.

**Done when:** app runs in both themes with the new palette everywhere, no page
looks broken (older pages just look "re-skinned", not redesigned yet).

## Phase 2 — Primitives: touch-friendly components *(S)*

Files: `src/components/ui/Button.tsx`, `Input.tsx`, `Card.tsx`, `Segmented.tsx`,
`Modal.tsx`, `Dropdown.tsx`, `States.tsx`, `confirm.tsx`.

- [ ] Button: primary becomes brand blue (was ink); min heights 44–48px on all
      sizes users tap on phones; keep `pressable` scale feedback.
- [ ] Inputs/selects: 48px height, 16px font on mobile (prevents iOS zoom),
      clear focus ring in `--primary`.
- [ ] Card: radius stays generous (16–20px); drop the inset "lit edge" +
      layered shadows for one soft cheap shadow (`--shadow-sm` only).
- [ ] Segmented, chips, badges: pill shapes, `--primary-soft` active state.
- [ ] EmptyState (`States.tsx`): friendlier voice + a big obvious action button.
- [ ] Modal: mobile bottom-sheet behavior verified (slide-up already exists).

## Phase 3 — App shell: navigation that feels like an app *(M)*

File: `src/components/AppLayout.tsx`.

- [ ] Mobile bottom nav: floating glass pill → **solid full-width bar** (GoPay
      style), 5 slots, labels always visible, active = `--primary` icon + label,
      center "Record" button as a raised brand-gradient circle.
      Remove `backdrop-blur` (expensive on low-end GPUs) → solid `--surface` +
      top hairline.
- [ ] Header: replace breadcrumb voice with greeting + avatar (home) / plain
      title + back affordance (subpages); keep bell + theme toggle; remove blur.
- [ ] Desktop sidebar: same nav, `--primary-soft` pill for the active item
      (replaces the `nav-rail` ink rail), quick-add button in brand blue.
- [ ] Nav labels sanity pass: "Activity" → "History"? (plain-words check —
      final wording during Phase 6 copy pass).

## Phase 4 — Home screen: the GoPay moment *(L — the centerpiece)*

File: `src/app/DashboardPage.tsx` (rename intent: home, not dashboard).

- [ ] **Balance card** (replaces the black "statement head"): brand gradient,
      total money ("Uang kamu / Your money" — not "Net worth"), **eye toggle to
      hide/show the amount** (persisted in `localStorage`, hidden = `Rp ••••••`),
      assets/debts in one plain line, other currencies as chips.
- [ ] **Quick actions grid** under the card: 4–8 tiles with tinted icon chips —
      Record, Accounts, Budgets, Goals, Bills, Reports. (Tiles = the chip-accent
      tokens; this is where the color lives.)
- [ ] **This month strip:** "In / Out / Kept" as three friendly numbers with the
      existing ▲▼ vs-last-month chips. No chart.
- [ ] **Recent activity:** existing `TransactionRow` list + "See all"; rows gain
      a tinted category icon chip (see Phase 5).
- [ ] Move the 5 charts (in-vs-out bars, net area, donut, weekday) to
      `ReportsPage`; home keeps zero charts. Update `DashboardSkeleton` to
      mirror the new layout.
- [ ] Empty state for brand-new users: one big "Add where your money lives"
      action (exists — restyle + copy).

## Phase 5 — Money pages sweep *(M–L, mechanical)*

- [ ] `TransactionRow.tsx`: slim ledger tick → tinted category icon chip
      (deterministic accent from category), amounts keep green/red.
- [ ] `TransactionsPage` + `FilterPanel` + `TransactionForm`: big type toggle
      (Out / In / Move), friendly quick date chips ("Today", "Yesterday").
- [ ] `AccountsPage` / `AccountDetailPage`: account cards with icon chips.
- [ ] `BudgetsPage` / `GoalsPage` / `BillsPage`: progress bars in brand blue,
      `--warning` for near-limit/due-soon; celebratory state when a goal hits 100%.
- [ ] `ReportsPage`: receives the home charts; recolor all charts from ink to
      brand palette via `src/lib/chartTheme.ts` (single source). *(Load the
      `dataviz` skill when implementing — before picking chart colors.)*
- [ ] `LoginPage.tsx`: gradient hero, logo, one Google button, plain trust copy
      ("Only you can see your money notes"); no glass/blur.
- [ ] `SettingsPage`, `CategoriesPage`, `TagsPage`, `BooksPage`, modals sweep:
      hardcoded monochrome remnants — grep `#0a0a0a|bg-black|grain|section-head`.

## Phase 6 — Words: plain language & Bahasa Indonesia *(M)*

- [ ] Copy inventory pass, one plain-words rule: say what happens, never a
      finance term ("Net worth" → "Your money in total"; "Reconciled" → "Checked ✓").
- [ ] Minimal i18n scaffold (a typed `t()` over two JSON dictionaries is enough —
      avoid heavy i18n deps for bundle's sake), `id` + `en`, default by device
      language, switch in Settings.
- [ ] Numbers/dates already localize via `Intl` / `formatMoney` — verify `id-ID`
      formats (Rp 10.000) render correctly everywhere.

## Phase 7 — Trust & safety cues *(S now, M later)*

- [ ] Now: hide-balance toggle (Phase 4), sign-out visible in Settings, privacy
      sentence on Login + Settings in human words.
- [ ] Later (separate track): optional PIN/biometric app lock (WebAuthn),
      "privacy screen" blur when app is backgrounded, session list.

## Phase 8 — Light-on-cheap-phones hardening *(M)*

- [ ] Kill remaining `backdrop-filter`, big blur radii, `grain`, `mix-blend-mode`
      (compositing cost on Mali/Adreno-class GPUs).
- [ ] Fonts self-hosted + precached by the PWA service worker; verify offline
      cold start renders text instantly (`font-display: swap`).
- [ ] Bundle budget: initial route JS < ~200 KB gz; charts stay lazy
      (recharts only loads on Reports after Phase 4/5); check with
      `vite build` + analyzer.
- [ ] PWA: verify precache covers app shell; test airplane-mode boot; manifest
      icons match new brand.
- [ ] Test matrix: Chrome DevTools 4× CPU throttle + Slow 3G; small screens
      (360×640); Lighthouse perf ≥ 90 on the throttled profile.

## Phase 9 — Accessibility & QA gate *(S, blocks "done")*

- [ ] AA contrast audit both themes (automated + spot checks on primary-on-white,
      muted-on-background, chip text).
- [ ] Touch targets ≥ 44px; text-size setting still works at every step.
- [ ] Keyboard/focus-visible pass on nav, forms, modals.
- [ ] `npm run build`, `npm run lint`, `npm run test`; manual screenshot pass of
      every page in light + dark.

---

## Rollout

- Branch `feat/gopay-ui` off `main` (land or park `fix/favicon` first — Phase 1
  touches the same assets).
- One PR per phase, in order; every phase leaves the app coherent and shippable.
- Phases 1–4 are the visible transformation (do these back-to-back); 5–9 can
  interleave with other roadmap work.
- After Phase 1 lands, update the design-system memory + `UI_UX_THEME.md` so no
  future session restyles toward monochrome.
