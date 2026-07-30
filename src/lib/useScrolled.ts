import { useEffect, useState } from 'react'

/**
 * True once the window has scrolled past `threshold` px.
 *
 * The app header uses it to swap between the transparent bar that floats over
 * the home hero and the blurred sheet it becomes as soon as the page moves.
 */
export function useScrolled(threshold = 16) {
  const [scrolled, setScrolled] = useState(
    () => typeof window !== 'undefined' && window.scrollY > threshold,
  )

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold)
    // Route changes reset scroll position without firing an event we've heard,
    // so read once on mount as well.
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])

  return scrolled
}
