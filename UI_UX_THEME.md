# Tracr UI/UX Theme Specification
**Version**: 3.0 (in transition)
**Project**: Tracr (Personal Finance Tracker)
**Stack**: React, Vite, Tailwind CSS v4, Lucide Icons, Recharts
**Source of truth**: `src/index.css` (tokens & devices) — this document explains the system; the CSS defines it.

> ## ⚠️ SUPERSEDED — do NOT restyle toward monochrome / the "ledger" voice
> As of **12 Jul 2026**, Tracr is transitioning to a **friendly GoPay-style e-wallet
> theme** (e-wallet blue, tinted icon chips, plain words, big rounded cards). The
> authoritative direction is **`docs/GOPAY_UI_REDESIGN_PLAN.md`** — read that first.
>
> Phase 1 of that plan has shipped: the token layer in `src/index.css` is now
> **e-wallet blue** (deep blue `#0072BC` light / cyan `#3EC6F0` dark), the typeface is
> self-hosted **Plus Jakarta Sans** (no serif), and the ledger devices (dotted leaders,
> ambient grid, film grain) are softened/removed. The monochrome/ink/serif system
> described below is **retired** and kept only as historical reference for the
> page-by-page sweep (plan Phase 5). When guidance here conflicts with the plan, the
> plan wins.

---

## 1. The Angle

Tracr is designed as **a well-kept ledger** — the digital descendant of a paper account
book. Every visual decision borrows from real finance artifacts (statements, passbooks,
receipts) rather than from dashboard templates. Monochrome black-and-white surfaces
(Vercel/Geist-style), ink-colored numbers, ruled lines, dotted leaders, and a serif voice.

### What we refuse to ship (the "AI slop" list)
1. **Icon-in-a-tinted-squircle next to every number.** The single strongest AI tell.
   Direction is carried by amount color and slim ledger ticks, not 44px decorated boxes.
2. **Everything in identical cards.** Material has hierarchy: some content (ruled lists,
   group headings) sits directly on the page. Cards are for genuine panels.
3. **UPPERCASE TRACKING-WIDE labels on everything.** Two devices with distinct jobs:
   serif italic for section heads, tiny caps for data labels only (see §3).
4. **Template copy.** No "Here is your financial status today 👋". Copy names real things:
   the actual month ("vs May"), the actual day ("Day 11 of June"), the actual amount.
5. **Color everywhere.** In a ledger, figures sit in ink. Green/rose are reserved for
   money direction and verdicts ("Kept"), never decoration.
6. **The phone sandbox on desktop.** Full-width workspace grid (max 1500px), three-column
   dashboard on xl, sidebar + header chrome. Never `max-w-md` on a monitor.

---

## 2. Color Tokens

Monochrome — black-and-white, Vercel/Geist-style. Two modes defined as CSS variables in
`:root` / `.dark`, mapped to Tailwind utilities via `@theme inline` (`bg-surface`,
`text-muted-foreground`, etc.). The brand is *ink*: black in the light, flipping to white
in the dark. Borders carry elevation; color is reserved strictly for money direction.

| Token | Light | Dark | Role |
| :--- | :--- | :--- | :--- |
| `--background` | `#fafafa` | `#000000` | App canvas |
| `--surface` | `#ffffff` | `#0a0a0a` | Panels, cards |
| `--surface-muted` | `#f4f4f5` | `#1a1a1a` | Inset fields, hovers |
| `--border` | `#e6e6e6` | `#2a2a2a` | Hairlines, rules |
| `--foreground` | `#0a0a0a` | `#ededed` | Ink |
| `--muted-foreground` | `#6b6b6b` | `#a1a1a1` | Secondary ink |
| `--primary` | `#0a0a0a` ink | `#ffffff` ink | Brand, actions, focus, active nav |
| `--positive` | `#15915b` | `#3ecf8e` | Money in, good verdicts |
| `--negative` / `--danger` | `#d93636` | `#ff6166` | Money out, debts, destructive |

**Color discipline**: the brand is monochrome — buttons, links, focus, and active nav all
sit in ink (black in the light, white in the dark). Green/red = money speaking, the *only*
color in the system. Nothing else gets color. (Functional status accents — amber "due
soon"/"near limit", an emerald "live rate" dot — are the deliberate exceptions.)

Supporting tokens: layered `--shadow-sm/md/lg`, `--surface-highlight` (1px lit top edge
baked into cards), `--primary-glow` / `--grid-line` (ambient backdrop, neutral grey).

---

## 3. Typography

Loaded in `index.html`: **Satoshi** (Fontshare; 400/500/700/900) and **Fraunces**
(Google; variable, **with the italic axis** — `.section-head` uses true italics, never a
synthesized slant).

| Device | Class | Spec | Used for |
| :--- | :--- | :--- | :--- |
| Display | `h1` global / `.font-display` | Fraunces, opsz 110, SOFT 28 | Page-level headlines, brand |
| **Section head** | `.section-head` | Fraunces *italic* 600, opsz 40 | Every section/group/card/modal title — the voice of the ledger |
| Body | (default) | Satoshi | Everything else |
| Numbers | `.font-numeric` | Satoshi + `tabular-nums` | **All money and counts** — digits never jitter |
| Data label | utility classes | 12px (`text-xs`) caps, wide tracking, muted | Labels *inside* data displays only ("Allocation", column heads, type badges) |

The caps/serif rule is strict: if it titles a section of the page → serif italic; if it
labels a datum inside a component → caps. Never both, never swapped.

**Minimum size**: nothing renders below 12px (`text-xs`). Sub-12px arbitrary sizes
(`text-[9px]`/`[10px]`/`[11px]`) are banned — labels and captions floor at `text-xs`,
so even the quietest data label stays legible.

---

## 4. Ledger Devices (the signature moves)

All defined in `src/index.css`.

### Dotted leaders — `.leaders`
The receipt/passbook line running from a label to its amount:
```tsx
<div className="flex items-baseline gap-2.5">
  <span>What you own</span>
  <span className="leaders" />            {/* …………………… */}
  <span className="font-numeric font-bold">Rp 84.200.000</span>
</div>
```
Used in the net-worth statement head and the accounts rail. The dot color inherits
`currentColor` at 26% — set text color on the container.

### Ledger ticks (transaction rows)
Rows carry a slim `3px × 32px` rounded tick, not an icon box: solid `bg-positive` for
income (money in is the event), `bg-negative/45` for expenses, `bg-border` for transfers.
Amount color + sign does the rest. See `TransactionRow.tsx`.

### The statement strip
Monthly cashflow is one ruled strip (`card-surface` + `divide-x`), not three icon cards:
**Money in · Money out · Kept**. In/out sit in ink; only **Kept** takes a verdict color.
Deltas name the month: `▲ 12% vs May`. On mobile each cell collapses to a ledger line
(label left, number right) via `flex … sm:block`.

### Card material — `.card-surface` / `.card-hover`
Hairline border + layered shadow + 1px lit top edge. Hover: 2px lift, amber-tinted
border. Radius hierarchy: feature panels `rounded-[20px]`, cards `rounded-2xl`,
modals `rounded-[22px]` (desktop), inputs/buttons `rounded-xl`, chips `rounded-lg`.

### Atmosphere
`.app-atmosphere` — fixed pseudo-layer: faint 44px grid + theme-tinted corner glows.
`.grain` — SVG noise overlay for the dark statement head.

---

## 5. Motion

Animations are registered in `@theme` (`--animate-*`) so **responsive variants work**
(`animate-slide-up sm:animate-pop`). Plain CSS classes don't get variants in Tailwind v4
— this was a real shipped bug in v1.

| Utility | Use |
| :--- | :--- |
| `animate-rise` + `.stagger-1…5` | Staggered section reveal on page load (`both` fill prevents pre-delay flash) |
| `animate-slide-up` / `sm:animate-pop` | Bottom sheet on mobile / scale-settle dialog on desktop |
| `animate-fade-in` | Route transitions, overlays |
| `.skeleton` | Shimmer placeholder blocks — loading states mirror the real layout (no spinners, no layout shift) |
| `.pressable` | Spring-eased tactile press on clickables |
| `<AnimatedNumber />` | Balances count up/down on change (`components/ui/AnimatedNumber.tsx`) |

**Accessibility**: a global `prefers-reduced-motion` block collapses all animation and
transitions; `AnimatedNumber` renders final values immediately.

---

## 6. Recharts

One shared theme — `src/lib/chartTheme.ts` (`chartTooltipStyle`, `chartCursor`,
`chartAxisProps`) — used by every chart so tooltips, cursors and axes match the system
in both modes.

Rules:
- Monochrome data-viz: series read in **ink vs grey**, not colour. Bars/areas use
  `var(--foreground)` (lead) and `var(--muted-foreground)` (recessive); the category
  donut is one tonal ink ramp via per-slice `fillOpacity` on `var(--foreground)` (see
  `shadeFor` in `DashboardPage.tsx`). Money in vs money out may use `--positive`/`--negative`
  where the in/out distinction must read at a glance (Reports). **3px** top radius, `maxBarSize` ≤ 40.
- Grid: horizontal dashed hairlines only (`vertical={false}`), `stroke="var(--border)"`.
- Axes: no axis/tick lines, 11px muted labels.
- Tooltips: surface panel, hairline border, `--shadow-md`, 14px radius.
- Areas: 2px stroke, gradient fade to transparent.

The dashboard *is* a dashboard: net-worth statement head (black card) → money-in/out strip
→ a chart deck (six-month **money in vs money out** bars, a **what you kept** net-trend
area, a **where it goes** category donut) → recent activity, with a sticky accounts rail.

---

## 7. Voice & Copy

- Plain language, no finance jargon: "Money in / Money out / Kept", "What you own /
  What you owe", "Write it down". (Audience includes non-finance people; Indonesian
  market roadmap.)
- Copy is computed from real data and names real things:
  *"Day 11 of June — you've kept Rp 2.400.000 of what came in."*
- Deltas compare against a named month, not "last period".
- No emoji in UI chrome. No filler reassurance ("keep your finances safe") — only
  honest, specific statements ("Private by default — your numbers belong to your
  account").
- Empty states invite the next action in the ledger's voice: "Start your ledger",
  "Nothing written down yet."

---

## 8. Layout & Responsiveness

| Breakpoint | Navigation | Content |
| :--- | :--- | :--- |
| `< 640px` | Floating glass tab bar + center `+` | Single column; statement strip collapses to ledger lines; bottom sheets |
| `640–1024px` | 84px icon sidebar | Single/dual column |
| `1024–1280px` | 260px full sidebar + header | Main column + cards |
| `> 1280px` | Same | Dashboard: 2/3 main + 1/3 sticky accounts rail; max-width 1500px |

Header: serif section title left; quiet "Saved" dot, theme toggle, avatar right.
Safe-area insets handled on `#root`; print styles strip chrome and keep chart colors.
