import { useEffect, useState } from 'react'

/**
 * Subscribes to a CSS media query.
 *
 * For anything a `sm:` class can express, use the class. This is for state a
 * component branches on in JS — the header's dark-over-hero mode, which drives
 * props on three child components rather than one element's classes.
 */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )

  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])

  return matches
}
