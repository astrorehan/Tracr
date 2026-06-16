import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Permanently delete the signed-in user and everything they own. Calls the
 * `delete_current_user` RPC (migration 0020), which removes the caller's
 * auth.users row — cascading to all per-user tables. Irreversible.
 *
 * After the row is gone the local session is stale, so we sign out to clear it;
 * the auth listener then routes the app back to /login.
 */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('delete_current_user')
      if (error) throw error
      await supabase.auth.signOut().catch(() => {})
    },
  })
}
