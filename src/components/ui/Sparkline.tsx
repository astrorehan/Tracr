import { useId, useMemo } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  /** Series to draw, oldest → newest. Fewer than 2 points renders a flat line. */
  values: number[]
  /** Line/fill color — any CSS color, defaults to the inherited text color. */
  color?: string
  /** Drawing height in px (the width always stretches to the container). */
  height?: number
  /** Draw a dot on the last point — reads as "you are here". */
  endDot?: boolean
  className?: string
}

/**
 * A tiny trend line: hand-rolled SVG instead of a chart library, because these
 * sit four-up inside summary tiles and each recharts instance costs a resize
 * observer plus a full render tree. The viewBox is stretched horizontally
 * (`preserveAspectRatio="none"`), so the stroke uses `non-scaling-stroke` to
 * stay an even weight, and the end dot is a DOM element rather than a <circle>
 * (which would come out as an ellipse).
 */
export function Sparkline({ values, color = 'currentColor', height = 34, endDot = false, className }: Props) {
  const gradientId = useId()
  const pad = 3 // keeps the stroke off the top/bottom edges

  const { line, area, lastY, flat } = useMemo(() => {
    const pts = values.length ? values : [0]
    const max = Math.max(...pts)
    const min = Math.min(...pts)
    const span = max - min
    const usable = height - pad * 2
    const step = pts.length > 1 ? 100 / (pts.length - 1) : 0
    // A dead-flat series (all zero, or a single point) sits on the baseline.
    const y = (v: number) => (span === 0 ? height - pad : height - pad - ((v - min) / span) * usable)
    const coords = pts.map((v, i) => ({ x: pts.length > 1 ? i * step : 50, y: y(v) }))

    if (coords.length < 2) {
      const only = coords[0]
      return { line: `M 0 ${only.y} L 100 ${only.y}`, area: '', lastY: only.y, flat: true }
    }

    // Cubic segments with horizontal control handles — a soft curve without the
    // overshoot a Catmull-Rom spline gives on spiky money data.
    let d = `M ${coords[0].x} ${coords[0].y}`
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1]
      const cur = coords[i]
      const c = (cur.x - prev.x) * 0.4
      d += ` C ${prev.x + c} ${prev.y}, ${cur.x - c} ${cur.y}, ${cur.x} ${cur.y}`
    }
    return {
      line: d,
      area: `${d} L 100 ${height} L 0 ${height} Z`,
      lastY: coords[coords.length - 1].y,
      flat: span === 0,
    }
  }, [values, height])

  return (
    // Width is left to `auto` (not `w-full`) so a caller can bleed the chart past
    // its container's padding with negative margins.
    <div className={cn('relative', className)} style={{ height }} aria-hidden>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="block overflow-visible"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {area && !flat && <path d={area} fill={`url(#${gradientId})`} />}
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          opacity={flat ? 0.35 : 1}
        />
      </svg>
      {endDot && !flat && (
        <span
          className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
          style={{ left: '100%', top: lastY, backgroundColor: color, marginLeft: -4 }}
        />
      )}
    </div>
  )
}
