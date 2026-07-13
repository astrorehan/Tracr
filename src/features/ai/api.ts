import { supabase } from '@/lib/supabase'
import type { MsgKey } from '@/i18n'

/** Starter questions shared by the empty state and the home launcher chips. */
export const STARTERS: MsgKey[] = ['ai.q1', 'ai.q2', 'ai.q3', 'ai.q4']

export interface AiResponse {
  text?: string
  limited?: boolean
  error?: string
  /** True when the assistant wrote a transaction — caches must refresh. */
  recorded?: boolean
}

export type ChatMsg = {
  role: 'user' | 'model'
  content: string
  /** Marks quota / failure notices so they can render differently. */
  kind?: 'limit' | 'error'
  /** Receipt photo (data URL) shown in the bubble. Not persisted — see saveChat. */
  image?: string
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
    // Photos are hundreds of KB of base64 — persisting them would blow the
    // ~5MB sessionStorage budget after a few scans. Keep the text only; a
    // restored conversation shows a "photo" placeholder instead.
    const slim = messages.slice(-CHAT_CAP).map((m) => (m.image ? { ...m, image: undefined } : m))
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
