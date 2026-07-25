import { supabase } from './supabase'

const LAST_USER_ID_KEY = 'tracr.last_known_user_id'

/**
 * Safe helper to get current authenticated User ID.
 * Uses cached localStorage User ID when offline or when network request fails.
 */
export async function getAuthenticatedUserId(): Promise<string> {
  if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && !navigator.onLine) {
    const cached = localStorage.getItem(LAST_USER_ID_KEY)
    if (cached) return cached
  }

  try {
    const { data } = await supabase.auth.getUser()
    if (data?.user?.id) {
      if (typeof window !== 'undefined') {
        localStorage.setItem(LAST_USER_ID_KEY, data.user.id)
      }
      return data.user.id
    }
  } catch {
    // Network error or fetch fail
  }

  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem(LAST_USER_ID_KEY)
    if (cached) return cached
  }

  throw new Error('Not authenticated')
}
