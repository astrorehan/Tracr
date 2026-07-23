import type { MsgKey, TVars } from '@/i18n'
import { dueInfo } from '@/features/recurring/schedule'
import type { Budget, RecurrenceFreq } from '@/types/db'

type Translate = (key: MsgKey, vars?: TVars) => string

const PERIOD_KEY: Record<Budget['period'], MsgKey> = {
  weekly: 'planning.period.weekly',
  monthly: 'planning.period.monthly',
  yearly: 'planning.period.yearly',
}

const FREQ_KEY: Record<RecurrenceFreq, MsgKey> = {
  weekly: 'planning.freq.weekly',
  monthly: 'planning.freq.monthly',
  yearly: 'planning.freq.yearly',
}

const FREQ_EVERY_KEY: Record<RecurrenceFreq, MsgKey> = {
  weekly: 'planning.freq.everyWeeks',
  monthly: 'planning.freq.everyMonths',
  yearly: 'planning.freq.everyYears',
}

/** Localized budget-period label ("Monthly" / "Bulanan"). */
export function periodLabel(t: Translate, period: Budget['period']): string {
  return t(PERIOD_KEY[period])
}

/** Localized recurrence phrase ("monthly", "every 2 weeks" / "tiap 2 minggu"). */
export function freqText(t: Translate, freq: RecurrenceFreq, interval = 1): string {
  if (interval <= 1) return t(FREQ_KEY[freq])
  return t(FREQ_EVERY_KEY[freq], { n: interval })
}

/** Localized relative due phrasing ("Overdue 3d" / "Telat 3h", "Due today", …). */
export function dueLabel(t: Translate, dueISO: string, today: Date = new Date()): string {
  const { status, days } = dueInfo(dueISO, today)
  if (status === 'overdue') return t('planning.due.overdue', { n: Math.abs(days) })
  if (days === 0) return t('planning.due.today')
  if (days === 1) return t('planning.due.tomorrow')
  return t('planning.due.inDays', { n: days })
}
