import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/queryClient'
import { useAuth } from '@/features/auth/useAuth'
import { syncLiveRates } from './liveRates'

/**
 * Refresh exchange rates once per session from the free live sources, filling in
 * any currency missing a rate for today. Side-effect only — no UI; failures are
 * swallowed so the app works offline and manual rates are unaffected.
 */
export function useLiveRatesSync() {
  const { profile } = useAuth()
  const base = profile?.base_currency
  const qc = useQueryClient()
  const syncedFor = useRef<string | null>(null)

  useEffect(() => {
    if (!base || syncedFor.current === base) return
    syncedFor.current = base
    syncLiveRates(base)
      .then((added) => {
        if (added > 0) void qc.invalidateQueries({ queryKey: qk.fxRates })
      })
      .catch(() => {
        // Offline or rate-limited — keep manual rates, retry next session.
      })
  }, [base, qc])
}
