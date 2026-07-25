import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type {
  GoalContribution,
  NewGoalContribution,
  NewSavingsGoal,
  SavingsGoal,
} from '@/types/db'
import { useActiveBook } from '@/features/books/useActiveBook'

import { enqueueOfflineMutation } from '@/lib/offlineQueue'

async function getUserId(): Promise<string | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    if (sessionData.session?.user?.id) return sessionData.session.user.id
    const { data: userData } = await supabase.auth.getUser()
    return userData.user?.id ?? null
  } catch {
    const { data: sessionData } = await supabase.auth.getSession()
    return sessionData.session?.user?.id ?? null
  }
}

export function useGoals() {
  const { activeBookId } = useActiveBook()
  return useQuery({
    queryKey: [...qk.savingsGoals, activeBookId],
    queryFn: async (): Promise<SavingsGoal[]> => {
      const { data, error } = await supabase
        .from('savings_goals')
        .select('*')
        .eq('book_id', activeBookId!)
        .order('created_at')
      if (error) throw error
      return data as SavingsGoal[]
    },
  })
}

/** All of the user's contributions, grouped by goal_id. */
export function useGoalContributions() {
  const { activeBookId } = useActiveBook()
  return useQuery({
    queryKey: [...qk.goalContributions, activeBookId],
    queryFn: async (): Promise<Record<string, GoalContribution[]>> => {
      const { data, error } = await supabase
        .from('goal_contributions')
        .select('*')
        .eq('book_id', activeBookId!)
        .order('occurred_at', { ascending: false })
      if (error) throw error
      const map: Record<string, GoalContribution[]> = {}
      for (const row of data as GoalContribution[]) {
        ;(map[row.goal_id] ??= []).push(row)
      }
      return map
    },
  })
}

export function useCreateGoal() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()
  return useMutation({
    mutationFn: async (input: NewSavingsGoal): Promise<SavingsGoal> => {
      const userId = await getUserId()
      if (!userId) throw new Error('Not authenticated')
      const payload = { ...input, user_id: userId, book_id: activeBookId }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const tempId = `temp-goal-${Date.now()}`
        const dummyGoal: SavingsGoal = {
          id: tempId,
          user_id: userId,
          book_id: activeBookId || '',
          name: payload.name,
          target_amount: payload.target_amount,
          currency: payload.currency,
          target_date: payload.target_date ?? null,
          account_id: payload.account_id ?? null,
          color: payload.color ?? null,
          icon: payload.icon ?? null,
          is_archived: false,
          created_at: new Date().toISOString(),
        }
        enqueueOfflineMutation('CREATE_GOAL', { ...payload, tempId })
        qc.setQueriesData({ queryKey: qk.savingsGoals }, (old: SavingsGoal[] | undefined) =>
          old ? [...old, dummyGoal] : [dummyGoal],
        )
        return dummyGoal
      }

      try {
        const { data, error } = await supabase
          .from('savings_goals')
          .insert(payload)
          .select()
          .single()
        if (error) throw error
        return data as SavingsGoal
      } catch (err) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueueOfflineMutation('CREATE_GOAL', payload)
        }
        throw err
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.savingsGoals }),
  })
}

export function useUpdateGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<SavingsGoal> }) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueueOfflineMutation('UPDATE_GOAL', { id, ...patch })
        qc.setQueriesData({ queryKey: qk.savingsGoals }, (old: SavingsGoal[] | undefined) =>
          old ? old.map((g) => (g.id === id ? { ...g, ...patch } : g)) : [],
        )
        return
      }

      try {
        const { error } = await supabase.from('savings_goals').update(patch).eq('id', id)
        if (error) throw error
      } catch (err) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueueOfflineMutation('UPDATE_GOAL', { id, ...patch })
        }
        throw err
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.savingsGoals }),
  })
}

export function useDeleteGoal() {
  const qc = useQueryClient()
  return useMutation({
    // goal_contributions cascade on delete.
    mutationFn: async (id: string) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueueOfflineMutation('DELETE_GOAL', { id })
        qc.setQueriesData({ queryKey: qk.savingsGoals }, (old: SavingsGoal[] | undefined) =>
          old ? old.filter((g) => g.id !== id) : [],
        )
        return
      }

      try {
        const { error } = await supabase.from('savings_goals').delete().eq('id', id)
        if (error) throw error
      } catch (err) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueueOfflineMutation('DELETE_GOAL', { id })
        }
        throw err
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.savingsGoals })
      void qc.invalidateQueries({ queryKey: qk.goalContributions })
    },
  })
}

/** Add (positive) or withdraw (negative) money toward a goal. */
export function useAddContribution() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()
  return useMutation({
    mutationFn: async (input: NewGoalContribution) => {
      const userId = await getUserId()
      if (!userId) throw new Error('Not authenticated')
      const payload = { ...input, user_id: userId, book_id: activeBookId }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueueOfflineMutation('CREATE_GOAL_CONTRIBUTION', payload)
        return
      }

      try {
        const { error } = await supabase.from('goal_contributions').insert(payload)
        if (error) throw error
      } catch (err) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueueOfflineMutation('CREATE_GOAL_CONTRIBUTION', payload)
        }
        throw err
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.goalContributions }),
  })
}

export function useDeleteContribution() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('goal_contributions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.goalContributions }),
  })
}
