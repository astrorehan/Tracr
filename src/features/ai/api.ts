import { supabase } from '@/lib/supabase'
import type { MsgKey } from '@/i18n'

/** Starter questions shared by the empty state and the home launcher chips. */
export const STARTERS: MsgKey[] = ['ai.q1', 'ai.q2', 'ai.q3', 'ai.q4']

export type ScanDocumentType = 'receipt' | 'transaction_history' | 'unknown'

export interface ScannedTransaction {
  date: string | null
  description: string | null
  direction: 'debit' | 'credit' | null
  amount: number | null
  currency: string | null
  reference: string | null
  note: string | null
  confidence: number | null
}

export interface ScanDocument {
  document_type: ScanDocumentType
  confidence: number | null
  currency: string | null
  account_name: string | null
  transactions: ScannedTransaction[]
  warnings: string[]
}
/** A file the assistant produced (PDF report). `data` is the base64 payload;
 *  it is dropped when the chat is persisted (see saveChat), leaving a chip that
 *  says the download expired. */
export interface AiFile {
  name: string
  mime: string
  data?: string
}

export interface AiResponse {
  text?: string
  limited?: boolean
  error?: string
  /** Structured receipt or transaction-history extraction. */
  scan?: ScanDocument
  /** True when the assistant wrote a transaction — caches must refresh. */
  recorded?: boolean
  /** Files generated this turn (PDF reports). */
  files?: AiFile[]
  /** mode 'report': the period held no transactions, so nothing was built. */
  empty?: boolean
  /** Combined remaining balance (subscription + top-up) after this call.
   *  Absent for the deterministic 'report' mode, which spends no credit. */
  credits_remaining?: number
  /** Which pool this call drew from — absent when the call was blocked. */
  credits_source?: 'subscription' | 'topup'
}

/** Build a PDF report for an explicit period. Deterministic server path — no
 *  LLM, not metered — so it never touches the monthly assistant cap. */
export async function requestReport(input: {
  book_id: string
  start: string
  end: string
  lang: string
}): Promise<AiResponse> {
  return callAi({ mode: 'report', ...input })
}

export type ChatMsg = {
  role: 'user' | 'model'
  content: string
  /** Marks quota / failure notices so they can render differently. */
  kind?: 'limit' | 'error'
  /** Receipt photo (data URL) shown in the bubble. Not persisted — see saveChat. */
  image?: string
  /** Files attached to this reply (PDF reports). Payload not persisted. */
  files?: AiFile[]
}

// Keep the sent history short — the model only needs recent context, and every
// token costs money on a free tier.
export const HISTORY_LIMIT = 8

export async function callAi(body: Record<string, unknown>): Promise<AiResponse> {
  const { data, error } = await supabase.functions.invoke<AiResponse>('ai-analysis', { body })
  if (error) throw error
  return data ?? {}
}

// ── Session persistence ─────────────────────────────────────────────────────
// Chat and the monthly insight survive in-app navigation (sessionStorage, per
// book) so hopping between tabs doesn't wipe the conversation or re-spend the
// user's monthly AI quota.

const CHAT_CAP = 40

const chatKey = (bookId: string) => `tracr:ai-chat:${bookId}`

export function loadChat(bookId: string | null): ChatMsg[] {
  if (!bookId) return []
  try {
    const raw = sessionStorage.getItem(chatKey(bookId))
    const parsed = raw ? (JSON.parse(raw) as ChatMsg[]) : []
    return Array.isArray(parsed) ? parsed.slice(-CHAT_CAP) : []
  } catch {
    return []
  }
}

export function saveChat(bookId: string | null, messages: ChatMsg[]) {
  if (!bookId) return
  try {
    if (messages.length === 0) {
      sessionStorage.removeItem(chatKey(bookId))
      return
    }
    // Photos and file payloads are hundreds of KB of base64 — persisting them
    // would blow the ~5MB sessionStorage budget after a few uses. Keep the text
    // (and file names, so a chip can still render as expired); a restored
    // conversation shows placeholders instead.
    const slim = messages.slice(-CHAT_CAP).map((m) => ({
      ...m,
      ...(m.image ? { image: undefined } : {}),
      ...(m.files ? { files: m.files.map((f) => ({ name: f.name, mime: f.mime })) } : {}),
    }))
    sessionStorage.setItem(chatKey(bookId), JSON.stringify(slim))
  } catch {
    /* private mode — ignore */
  }
}

const insightKey = (bookId: string, month: string) => `tracr:ai-insight:${bookId}:${month}`

export function loadInsight(bookId: string | null, month: string): string | null {
  if (!bookId) return null
  try {
    return sessionStorage.getItem(insightKey(bookId, month))
  } catch {
    return null
  }
}

export function saveInsight(bookId: string | null, month: string, text: string) {
  if (!bookId) return
  try {
    sessionStorage.setItem(insightKey(bookId, month), text)
  } catch {
    /* private mode — ignore */
  }
}
