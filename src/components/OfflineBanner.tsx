import { useState } from 'react'
import { WifiOff, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { useT } from '@/features/settings/language-context'
import { FailedSyncModal } from './FailedSyncModal'

export function OfflineBanner() {
  const { t } = useT()
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
            <div className="flex items-center gap-2 text-warning">
              <WifiOff className="h-4 w-4 shrink-0" />
              <span>
                {t('offline.banner.offlineMode')}{' '}
                {pendingCount > 0 ? t('offline.banner.pendingCount', { count: pendingCount }) : ''}
              </span>
            </div>
          ) : pendingCount > 0 ? (
            <div className="flex items-center gap-2 text-primary">
              <RefreshCw className={`h-4 w-4 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>
                {isSyncing
                  ? t('offline.banner.syncing')
                  : t('offline.banner.pendingUnsynced', { count: pendingCount })}
              </span>
            </div>
          ) : failedCount > 0 ? (
            <div className="flex items-center gap-2 text-danger">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{t('offline.banner.failedCount', { count: failedCount })}</span>
            </div>
          ) : lastSyncResult && (lastSyncResult.processed > 0 || lastSyncResult.failed > 0) ? (
            <div className="flex items-center gap-2 text-positive">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                {lastSyncResult.processed > 0 &&
                  `${t('offline.banner.processedSuccess', { count: lastSyncResult.processed })} `}
                {lastSyncResult.failed > 0 && t('offline.banner.failedPartial', { count: lastSyncResult.failed })}
              </span>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            {failedCount > 0 && (
              <button
                onClick={() => setModalOpen(true)}
                className="pressable rounded-lg bg-danger px-2.5 py-1 text-xs font-bold text-white shadow-xs hover:opacity-90 flex items-center gap-1"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                {t('offline.banner.viewDetails', { count: failedCount })}
              </button>
            )}

            {isOnline && pendingCount > 0 && !isSyncing && (
              <button
                onClick={() => syncNow()}
                className="pressable rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground shadow-xs hover:opacity-90"
              >
                {t('offline.banner.syncNow')}
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
