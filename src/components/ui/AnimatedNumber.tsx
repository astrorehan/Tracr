import { useEffect, useRef, useState } from 'react'

interface Props {
  /** Target value in minor units (or any number — formatting is yours). */
  value: number
  format: (value: number) => string
  /** Animation length in ms. */
  duration?: number
  className?: string
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

/**
 * Counts a number up/down to its new value when it changes. Pairs with
 * `font-numeric` (tabular figures) so digits don't jitter while rolling.
 * Jumps straight to the final value when the OS asks for reduced motion.
 */
export function AnimatedNumber({ value, format, duration = 700, className }: Props) {
  const [display, setDisplay] = useState(value)
  // Where the rolling number currently sits — lets a new target take over
  // mid-flight without snapping back to the old starting point.
  const shownRef = useRef(value)

  useEffect(() => {
    const from = shownRef.current
    if (from === value) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const start = performance.now()
    let frame = requestAnimationFrame(function tick(now: number) {
      const t = reduced ? 1 : Math.min(1, (now - start) / duration)
      const current = t >= 1 ? value : Math.round(from + (value - from) * easeOutCubic(t))
      shownRef.current = current
      setDisplay(current)
      if (t < 1) frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [value, duration])

  return <span className={className}>{format(display)}</span>
}
