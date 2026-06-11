/**
 * Shared Recharts styling so every chart reads as one design system.
 * All values resolve from the theme CSS variables, so charts follow
 * light/dark mode automatically.
 */

/** Tooltip card: surface panel with hairline border and soft elevation. */
export const chartTooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  fontSize: 12,
  fontWeight: 600,
  boxShadow: 'var(--shadow-md)',
  padding: '8px 12px',
} as const

/** Hover cursor for bar charts — a soft rounded wash, not a hard gray block. */
export const chartCursor = {
  fill: 'var(--surface-muted)',
  opacity: 0.5,
  radius: 8,
} as const

/** Quiet axis text shared by X/Y axes. */
export const chartAxisProps = {
  tickLine: false,
  axisLine: false,
  fontSize: 11,
  stroke: 'var(--muted-foreground)',
} as const
