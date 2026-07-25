import { useState } from 'react'
import { WifiOff, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { FailedSyncModal } from './FailedSyncModal'

export function OfflineBanner() {
  const {
    isOnline,
    pendingCount,
    failedCount,
    failedItems,
    isSyncing,
    lastSyncResult,
    syncNow,
    retryItem,
    removeItem,
    clearAllFailed,
  } = useOnlineStatus()

  const [modalOpen, setModalOpen] = useState(false)

  if (isOnline && pendingCount === 0 && failedCount === 0 && !lastSyncResult) {
    return null
  }

  return (
    <>
      <div className="w-full bg-surface-muted/90 border-b border-border px-4 py-2 text-xs font-semibold sm:text-sm transition-all duration-300">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2">
          {!isOnline ? (
            <div className="flex items-center gap-2 text-amber-500 dark:text-amber-400">
              <WifiOff className="h-4 w-4 shrink-0" />
              <span>
                Mode Offline — Data disimpan lokal.{' '}
                {pendingCount > 0 ? `${pendingCount} perubahan siap disinkronkan.` : ''}
              </span>
            </div>
          ) : pendingCount > 0 ? (
            <div className="flex items-center gap-2 text-sky-500 dark:text-sky-400">
              <RefreshCw className={`h-4 w-4 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>
                {isSyncing
                  ? 'Menyinkronkan data ke server...'
                  : `${pendingCount} perubahan lokal belum disinkronkan.`}
              </span>
            </div>
          ) : failedCount > 0 ? (
            <div className="flex items-center gap-2 text-rose-500 dark:text-rose-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{failedCount} perubahan gagal disinkronkan ke server.</span>
            </div>
          ) : lastSyncResult && (lastSyncResult.processed > 0 || lastSyncResult.failed > 0) ? (
            <div className="flex items-center gap-2 text-emerald-500 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                {lastSyncResult.processed > 0 && `${lastSyncResult.processed} perubahan berhasil disinkronkan. `}
                {lastSyncResult.failed > 0 && `${lastSyncResult.failed} gagal.`}
              </span>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            {failedCount > 0 && (
              <button
                onClick={() => setModalOpen(true)}
                className="pressable rounded-lg bg-rose-500 px-2.5 py-1 text-xs font-bold text-white shadow-xs hover:opacity-90 flex items-center gap-1"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Lihat Detail ({failedCount} Gagal)
              </button>
            )}

            {isOnline && pendingCount > 0 && !isSyncing && (
              <button
                onClick={() => syncNow()}
                className="pressable rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-white shadow-xs hover:opacity-90"
              >
                Sinkronkan Sekarang
              </button>
            )}
          </div>
        </div>
      </div>

      <FailedSyncModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        failedItems={failedItems}
        onRetryItem={(id) => retryItem(id)}
        onRemoveItem={(id) => removeItem(id)}
        onClearAll={() => {
          clearAllFailed()
          setModalOpen(false)
        }}
      />
    </>
  )
}
