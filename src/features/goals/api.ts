import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type {
  GoalContribution,
  NewGoalContribution,
  NewSavingsGoal,
  SavingsGoal,
} from '@/types/db'

export function useGoals() {
  return useQuery({
    queryKey: qk.savingsGoals,
    queryFn: async (): Promise<SavingsGoal[]> => {
      const { data, error } = await supabase
        .from('savings_goals')
        .select('*')
        .order('created_at')
      if (error) throw error
      return data as SavingsGoal[]
    },
  })
}

/** All of the user's contributions, grouped by goal_id. */
export function useGoalContributions() {
  return useQuery({
    queryKey: qk.goalContributions,
    queryFn: async (): Promise<Record<string, GoalContribution[]>> => {
      const { data, error } = await supabase
        .from('goal_contributions')
        .select('*')
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
  return useMutation({
    mutationFn: async (input: NewSavingsGoal): Promise<SavingsGoal> => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('savings_goals')
        .insert({ ...input, user_id: userId })
        .select()
        .single()
      if (error) throw error
      return data as SavingsGoal
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.savingsGoals }),
  })
}

export function useUpdateGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<SavingsGoal> }) => {
      const { error } = await supabase.from('savings_goals').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.savingsGoals }),
  })
}

export function useDeleteGoal() {
  const qc = useQueryClient()
  return useMutation({
    // goal_contributions cascade on delete.
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('savings_goals').delete().eq('id', id)
      if (error) throw error
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
  return useMutation({
    mutationFn: async (input: NewGoalContribution) => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('goal_contributions')
        .insert({ ...input, user_id: userId })
      if (error) throw error
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
