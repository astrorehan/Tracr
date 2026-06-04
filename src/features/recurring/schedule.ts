import { addMonths, addWeeks, addYears, differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { RecurrenceFreq } from '@/types/db'

export const FREQ_LABEL: Record<RecurrenceFreq, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

/** Advance a yyyy-MM-dd due date by one recurrence (interval periods). */
export function advanceDue(dueISO: string, freq: RecurrenceFreq, interval = 1): string {
  const d = parseISO(dueISO)
  const next =
    freq === 'weekly' ? addWeeks(d, interval) : freq === 'yearly' ? addYears(d, interval) : addMonths(d, interval)
  return format(next, 'yyyy-MM-dd')
}

export type DueStatus = 'overdue' | 'due_soon' | 'upcoming'

/** Days until due (negative = overdue) and a bucket relative to today. */
export function dueInfo(dueISO: string, today: Date = new Date()): { status: DueStatus; days: number } {
  const days = differenceInCalendarDays(parseISO(dueISO), today)
  if (days < 0) return { status: 'overdue', days }
  if (days <= 7) return { status: 'due_soon', days }
  return { status: 'upcoming', days }
}

/** Human phrasing for how often it repeats, e.g. "monthly" or "every 2 weeks". */
export function frequencyText(freq: RecurrenceFreq, interval = 1): string {
  if (interval <= 1) return FREQ_LABEL[freq].toLowerCase()
  const unit = freq === 'weekly' ? 'weeks' : freq === 'yearly' ? 'years' : 'months'
  return `every ${interval} ${unit}`
}

/** Short relative phrasing for a due date, e.g. "Overdue 3d", "Due today", "in 5d". */
export function dueText(dueISO: string, today: Date = new Date()): string {
  const { status, days } = dueInfo(dueISO, today)
  if (status === 'overdue') return `Overdue ${Math.abs(days)}d`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `in ${days}d`
}
