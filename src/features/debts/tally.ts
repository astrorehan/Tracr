import type { Debt } from '@/types/db'

/** What a contact row shows: money still moving, and how much history exists. */
export interface ContactTally {
  /** Open receivable remaining — they owe us. */
  owesMe: number
  /** Open payable remaining — we owe them. */
  iOwe: number
  /** Every debt record ever written against this person, settled included. */
  records: number
  openRecords: number
  /** Days past the furthest-gone due date, 0 when nothing is late. */
  overdueDays: number
  currency: string | null
}

const MS_DAY = 86_400_000

/** Roll the already-loaded debt list up per contact — no extra round trip.
 *  Debts whose contact was deleted (contact_id null) belong to nobody and are
 *  skipped; the kasbon page still shows them under a nameless group. */
export function tallyByContact(
  debts: Pick<Debt, 'contact_id' | 'direction' | 'status' | 'amount' | 'paid' | 'due_date' | 'currency'>[],
  now: Date = new Date(),
): Map<string, ContactTally> {
  const today = now.toISOString().slice(0, 10)
  const map = new Map<string, ContactTally>()
  for (const d of debts) {
    if (!d.contact_id) continue
    const tally =
      map.get(d.contact_id) ??
      { owesMe: 0, iOwe: 0, records: 0, openRecords: 0, overdueDays: 0, currency: null }
    tally.records += 1
    tally.currency ??= d.currency
    if (d.status === 'open') {
      const remaining = Math.max(0, d.amount - d.paid)
      tally.openRecords += 1
      if (d.direction === 'receivable') tally.owesMe += remaining
      else tally.iOwe += remaining
      if (d.due_date && d.due_date < today) {
        const late = Math.floor((now.getTime() - new Date(d.due_date).getTime()) / MS_DAY)
        tally.overdueDays = Math.max(tally.overdueDays, late)
      }
    }
    map.set(d.contact_id, tally)
  }
  return map
}
