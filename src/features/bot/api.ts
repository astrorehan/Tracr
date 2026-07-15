import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'

/** Chat-bot linking.
 *
 *  A link binds one chat to one (user, book) pair and is what lets the bot see
 *  a ledger at all — see supabase/functions/_shared/bot-core.ts. It is created
 *  by the bot itself when the user sends `/start <token>`; the app's only job is
 *  to mint that token and show the result.
 *
 *  Reads and deletes here go through RLS (`own bot link`), so a user can only
 *  ever see or drop their own links. The token is minted by a SECURITY DEFINER
 *  RPC because users cannot write bot_link_tokens directly. */

export type BotChannel = 'whatsapp' | 'telegram'

export interface BotLinkRow {
  chat_id: string
  linked_at: string
  last_seen_at: string | null
  book_id: string
  book_name: string | null
}

/** Links for one channel. Pass `poll` while waiting for the user to finish in
 *  the chat app — the row appears without any signal to the browser. */
export function useBotLinks(channel: BotChannel, poll = false) {
  return useQuery({
    queryKey: [...qk.botLinks, channel],
    refetchInterval: poll ? 2500 : false,
    queryFn: async (): Promise<BotLinkRow[]> => {
      const { data, error } = await supabase
        .from('bot_links')
        .select('chat_id, linked_at, last_seen_at, book_id, books(name)')
        .eq('channel', channel)
        .order('linked_at')
      if (error) throw error
      type Raw = Omit<BotLinkRow, 'book_name'> & { books: { name: string } | { name: string }[] | null }
      return (data as unknown as Raw[]).map((r) => ({
        chat_id: r.chat_id,
        linked_at: r.linked_at,
        last_seen_at: r.last_seen_at,
        book_id: r.book_id,
        book_name: Array.isArray(r.books) ? r.books[0]?.name ?? null : r.books?.name ?? null,
      }))
    },
  })
}

/** Mint a one-time link token for the user's ACTIVE book. Valid 10 minutes. */
export function useMintLinkToken() {
  return useMutation({
    mutationFn: async (channel: BotChannel): Promise<string> => {
      const { data, error } = await supabase.rpc('bot_mint_link_token', { p_channel: channel })
      if (error) throw error
      return data as string
    },
  })
}

/** Disconnect a chat. Deleting the binding is a full revoke — the bot can no
 *  longer resolve that chat to a ledger, and its history cascades away. */
export function useUnlinkBot(channel: BotChannel) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (chatId: string): Promise<void> => {
      const { error } = await supabase
        .from('bot_links')
        .delete()
        .eq('channel', channel)
        .eq('chat_id', chatId)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.botLinks })
    },
  })
}
