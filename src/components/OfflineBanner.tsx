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
      <div className="fixed left-1/2 top-[calc(1rem+env(safe-area-inset-top))] z-[100] w-[90%] max-w-md -translate-x-1/2 animate-fade-in pointer-events-none">
        <div className="pointer-events-auto flex items-center justify-between gap-3 rounded-[24px] border border-border bg-surface/85 px-2.5 py-2 text-[13px] font-semibold shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-xl ring-1 ring-black/5 transition-all duration-300">
          
          <div className="flex items-center flex-1 min-w-0">
          {!isOnline ? (
            <div className="flex items-center gap-2.5 text-warning">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-warning/15">
                <WifiOff className="h-4 w-4 shrink-0" />
              </span>
              <span className="truncate">
                {t('offline.banner.offlineMode')}{' '}
                {pendingCount > 0 && (
                  <span className="ml-1 rounded-full bg-warning/20 px-2 py-0.5 text-[11px] font-bold">
                    {t('offline.banner.pendingCount', { count: pendingCount })}
                  </span>
                )}
              </span>
            </div>
          ) : pendingCount > 0 ? (
            <div className="flex items-center gap-2.5 text-primary">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <RefreshCw className={`h-4 w-4 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
              </span>
              <span className="truncate">
                {isSyncing
                  ? t('offline.banner.syncing')
                  : t('offline.banner.pendingUnsynced', { count: pendingCount })}
              </span>
            </div>
          ) : failedCount > 0 ? (
            <div className="flex items-center gap-2.5 text-danger">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-danger/10">
                <AlertTriangle className="h-4 w-4 shrink-0" />
              </span>
              <span className="truncate">{t('offline.banner.failedCount', { count: failedCount })}</span>
            </div>
          ) : lastSyncResult && (lastSyncResult.processed > 0 || lastSyncResult.failed > 0) ? (
            <div className="flex items-center gap-2.5 text-positive">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-positive/10">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              </span>
              <span className="truncate">
                {lastSyncResult.processed > 0 &&
                  `${t('offline.banner.processedSuccess', { count: lastSyncResult.processed })} `}
                {lastSyncResult.failed > 0 && t('offline.banner.failedPartial', { count: lastSyncResult.failed })}
              </span>
            </div>
          ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2 pr-1">
            {failedCount > 0 && (
              <button
                onClick={() => setModalOpen(true)}
                className="pressable rounded-full bg-danger px-3 py-1.5 text-[11px] font-bold tracking-wide text-white shadow-sm hover:opacity-90 flex items-center gap-1.5"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                {t('offline.banner.viewDetails', { count: failedCount })}
              </button>
            )}

            {isOnline && pendingCount > 0 && !isSyncing && (
              <button
                onClick={() => syncNow()}
                className="pressable rounded-full bg-primary px-3 py-1.5 text-[11px] font-bold tracking-wide text-primary-foreground shadow-sm hover:opacity-90"
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
