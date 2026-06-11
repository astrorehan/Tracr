# Tracr UI/UX Theme Specification — "The Well-Kept Ledger"
**Version**: 2.0
**Project**: Tracr (Personal Finance Tracker)
**Stack**: React, Vite, Tailwind CSS v4, Lucide Icons, Recharts
**Source of truth**: `src/index.css` (tokens & devices) — this document explains the system; the CSS defines it.

> v1.0 of this document described an emerald/neon-mint "trading terminal" theme that was
> never shipped. The committed brand is **warm amber** (see the logo/favicon). Do not
> restyle the app toward the old spec.

---

## 1. The Angle

Tracr is designed as **a well-kept ledger** — the digital descendant of a paper account
book. Every visual decision borrows from real finance artifacts (statements, passbooks,
receipts) rather than from dashboard templates. Warm paper surfaces, ink-colored numbers,
ruled lines, dotted leaders, and a serif voice.

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

Two themes, both warm. Defined as CSS variables in `:root` / `.dark`, mapped to Tailwind
utilities via `@theme inline` (`bg-surface`, `text-muted-foreground`, etc.).

| Token | Warm Paper (light) | Warm Charcoal (dark) | Role |
| :--- | :--- | :--- | :--- |
| `--background` | `#faf7f2` | `#120f09` | App canvas |
| `--surface` | `#ffffff` | `#221c14` | Panels, cards |
| `--surface-muted` | `#f4eee3` | `#2d2619` | Inset fields, hovers |
| `--border` | `#ece2d3` | `rgba(255,238,214,.13)` | Hairlines, rules |
| `--foreground` | `#1c160d` | `#f3ecdf` | Ink |
| `--muted-foreground` | `#8a7c66` | `#b1a48c` | Secondary ink |
| `--primary` | `#d97706` amber | `#f5a623` gold | Brand, actions, focus |
| `--positive` | `#15966a` | `#34d399` | Money in, good verdicts |
| `--negative` / `--danger` | `#d6492f` | `#f0796a` | Money out, debts, destructive |

**Color discipline**: amber = the product speaking (buttons, links, focus, active nav).
Green/rose = money speaking. Nothing else gets color.

Supporting tokens: layered `--shadow-sm/md/lg`, `--surface-highlight` (1px lit top edge
baked into cards), `--primary-glow` / `--grid-line` (ambient backdrop).

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
| Data label | utility classes | 9–11px caps, wide tracking, muted | Tiny labels *inside* data displays only ("Allocation", column heads, type badges) |

The caps/serif rule is strict: if it titles a section of the page → serif italic; if it
labels a datum inside a component → tiny caps. Never both, never swapped.

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
- Bars: amber gradient fill, **3px** top radius (crisp, not bubbly), `maxBarSize` ≤ 40.
- Emphasis: the current period at full opacity, history receded to ~45% (`<Cell />`).
- Grid: horizontal dashed hairlines only (`vertical={false}`), `stroke="var(--border)"`.
- Axes: no axis/tick lines, 11px muted labels.
- Tooltips: surface panel, hairline border, `--shadow-md`, 14px radius.
- Areas: 2px stroke, gradient fade to transparent.

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
