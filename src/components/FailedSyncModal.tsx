import { AlertTriangle, RefreshCw, Trash2, X } from 'lucide-react'
import type { QueuedMutation } from '@/lib/offlineQueue'
import { useT } from '@/features/settings/language-context'

interface FailedSyncModalProps {
  open: boolean
  onClose: () => void
  failedItems: QueuedMutation[]
  onRetryItem: (id: string) => void
  onRemoveItem: (id: string) => void
  onClearAll: () => void
}

export function FailedSyncModal({
  open,
  onClose,
  failedItems,
  onRetryItem,
  onRemoveItem,
  onClearAll,
}: FailedSyncModalProps) {
  const { t } = useT()

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fade-in">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-surface-muted/50">
          <div className="flex items-center gap-2.5 text-warning font-bold text-base sm:text-lg">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>{t('offline.modal.title', { count: failedItems.length })}</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
          {failedItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {t('offline.modal.empty')}
            </div>
          ) : (
            failedItems.map((item) => {
              const payloadStr = JSON.stringify(item.payload, null, 2)
              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-border bg-surface-muted/30 p-4 space-y-2 text-xs sm:text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold px-2 py-0.5 rounded bg-warning/10 text-warning text-xs">
                      {item.type}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>

                  {item.lastError && (
                    <div className="text-xs text-danger bg-danger/10 px-2.5 py-1.5 rounded-md font-medium">
                      {t('offline.modal.error', { error: item.lastError })}
                    </div>
                  )}

                  <details className="text-xs text-muted-foreground cursor-pointer">
                    <summary className="hover:text-foreground font-medium py-0.5">
                      {t('offline.modal.viewPayload')}
                    </summary>
                    <pre className="mt-1 p-2 rounded bg-surface border border-border font-mono text-[11px] overflow-x-auto whitespace-pre-wrap">
                      {payloadStr}
                    </pre>
                  </details>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => onRemoveItem(item.id)}
                      className="pressable flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border text-danger hover:bg-danger/10 text-xs font-semibold"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t('offline.modal.delete')}
                    </button>
                    <button
                      onClick={() => onRetryItem(item.id)}
                      className="pressable flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 shadow-xs"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      {t('offline.modal.retry')}
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-3.5 bg-surface-muted/50 flex items-center justify-between gap-3">
          {failedItems.length > 0 ? (
            <button
              onClick={onClearAll}
              className="text-xs font-semibold text-danger hover:underline"
            >
              {t('offline.modal.clearAll')}
            </button>
          ) : (
            <div />
          )}
          <button
            onClick={onClose}
            className="pressable rounded-xl bg-surface border border-border px-4 py-1.5 text-xs font-bold text-foreground hover:bg-surface-muted"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
