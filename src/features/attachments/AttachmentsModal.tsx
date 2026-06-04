import { useEffect, useRef, useState } from 'react'
import { FileText, Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import {
  signedUrls,
  useDeleteAttachment,
  useTransactionAttachments,
  useUploadAttachments,
} from './api'
import type { Attachment } from '@/types/db'

interface Props {
  transactionId: string | null
  onClose: () => void
}

export function AttachmentsModal({ transactionId, onClose }: Props) {
  return (
    <Modal open={Boolean(transactionId)} onClose={onClose} title="Receipts & attachments">
      {transactionId && <Body transactionId={transactionId} />}
    </Modal>
  )
}

function Body({ transactionId }: { transactionId: string }) {
  const { data: byTx = {} } = useTransactionAttachments()
  const upload = useUploadAttachments()
  const del = useDeleteAttachment()
  const fileRef = useRef<HTMLInputElement>(null)

  const rows = byTx[transactionId] ?? []
  const pathKey = rows.map((r) => r.path).join('|')
  const [urls, setUrls] = useState<Record<string, string>>({})

  // Resolve short-lived signed URLs whenever the set of files changes.
  // signedUrls([]) resolves to {}, so empty state is handled without a sync setState.
  useEffect(() => {
    let active = true
    signedUrls(rows.map((r) => r.path))
      .then((map) => {
        if (active) setUrls(map)
      })
      .catch(() => {})
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey])

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length) await upload.mutateAsync({ transactionId, files })
  }

  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No receipts attached yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {rows.map((att) => (
            <AttachmentTile key={att.id} att={att} url={urls[att.path]} onDelete={() => del.mutate(att)} />
          ))}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/*,application/pdf"
        className="hidden"
        onChange={onPick}
      />
      <Button
        variant="secondary"
        className="w-full"
        loading={upload.isPending}
        onClick={() => fileRef.current?.click()}
      >
        <Plus className="h-4 w-4" /> Add files
      </Button>
      <p className="text-center text-[11px] text-muted-foreground">Images or PDF, stored privately.</p>
    </div>
  )
}

function AttachmentTile({
  att,
  url,
  onDelete,
}: {
  att: Attachment
  url?: string
  onDelete: () => void
}) {
  const isImage = (att.mime ?? '').startsWith('image/')
  return (
    <div className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-surface-muted">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex h-full w-full items-center justify-center"
        title={att.name}
      >
        {isImage && url ? (
          <img src={url} alt={att.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 p-2 text-center">
            <FileText className="h-6 w-6 text-muted-foreground" />
            <span className="line-clamp-2 text-[10px] font-medium text-muted-foreground">
              {att.name}
            </span>
          </div>
        )}
      </a>
      <button
        onClick={onDelete}
        className="absolute right-1 top-1 rounded-lg bg-black/50 p-1 text-white opacity-0 transition group-hover:opacity-100"
        aria-label={`Delete ${att.name}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
