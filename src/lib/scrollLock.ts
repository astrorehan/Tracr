/**
 * Ref-counted `body` scroll lock.
 *
 * Modal, the confirm dialog and the AI chat sheet can all be open at once — a
 * confirm raised from inside a form modal is the common case. Each setting
 * `body.style.overflow` directly meant the first one to unmount restored page
 * scrolling while another overlay was still up, so the background scrolled
 * behind it. Locks now nest: the style is only restored when the last holder
 * releases.
 */
let holders = 0
let previousOverflow: string | null = null

/** Locks page scrolling. Returns the matching release function; call it once. */
export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => {}

  if (holders === 0) {
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  holders++

  let released = false
  return () => {
    if (released) return
    released = true
    holders--
    if (holders === 0) {
      document.body.style.overflow = previousOverflow ?? ''
      previousOverflow = null
    }
  }
}
