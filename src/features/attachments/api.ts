import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { Attachment } from '@/types/db'

const BUCKET = 'attachments'

/** Map of transaction_id → its attachment rows. */
export function useTransactionAttachments() {
  return useQuery({
    queryKey: qk.attachments,
    queryFn: async (): Promise<Record<string, Attachment[]>> => {
      const { data, error } = await supabase
        .from('attachments')
        .select('*')
        .order('created_at')
      if (error) throw error
      const map: Record<string, Attachment[]> = {}
      for (const row of data as Attachment[]) {
        ;(map[row.transaction_id] ??= []).push(row)
      }
      return map
    },
  })
}

/** Sanitize a filename for use in a storage object path. */
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
}

/** Upload files to Storage under <user>/<tx>/ and record them in `attachments`. */
export function useUploadAttachments() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ transactionId, files }: { transactionId: string; files: File[] }) => {
      if (files.length === 0) return 0
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) throw new Error('Not authenticated')

      const rows: Omit<Attachment, 'id' | 'created_at'>[] = []
      for (const file of files) {
        const path = `${userId}/${transactionId}/${crypto.randomUUID()}-${safeName(file.name)}`
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type || undefined,
          upsert: false,
        })
        if (upErr) throw upErr
        rows.push({
          user_id: userId,
          transaction_id: transactionId,
          path,
          name: file.name,
          mime: file.type || null,
          size: file.size,
        })
      }
      const { error } = await supabase.from('attachments').insert(rows)
      if (error) throw error
      return rows.length
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.attachments }),
  })
}

/** Delete an attachment row and its underlying Storage object. */
export function useDeleteAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (att: Attachment) => {
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove([att.path])
      if (rmErr) throw rmErr
      const { error } = await supabase.from('attachments').delete().eq('id', att.id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.attachments }),
  })
}

/** Create short-lived signed URLs for viewing/downloading private objects. */
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
  if (error) throw error
  const map: Record<string, string> = {}
  for (const item of data ?? []) {
    if (item.signedUrl && item.path) map[item.path] = item.signedUrl
  }
  return map
}
