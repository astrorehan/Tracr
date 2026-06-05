import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Database, Download, Upload, FileSpreadsheet, HardDriveDownload } from 'lucide-react'
import { format } from 'date-fns'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { supabase } from '@/lib/supabase'
import { downloadTextFile } from '@/lib/csv'
import { indexById } from '@/lib/collections'
import { useAuth } from '@/features/auth/useAuth'
import { useAccounts } from '@/features/accounts/api'
import { useCategories } from '@/features/categories/api'
import {
  buildTransactionsCsv,
  parseTransactionsCsv,
  sampleCsv,
  type ImportResult,
} from './transactionsCsv'
import {
  backupCounts,
  buildBackup,
  parseBackup,
  restoreBackup,
  type Backup,
} from './backup'
import { useImportTransactions } from './api'
import type { Transaction } from '@/types/db'

export function DataCard() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const { data: accounts = [] } = useAccounts(true)
  const { data: categories = [] } = useCategories()
  const importMut = useImportTransactions()
  const fileRef = useRef<HTMLInputElement>(null)
  const backupRef = useRef<HTMLInputElement>(null)

  const [busy, setBusy] = useState<'export' | 'backup' | 'restore' | null>(null)
  const [preview, setPreview] = useState<ImportResult | null>(null)
  const [imported, setImported] = useState<number | null>(null)
  const [restorePreview, setRestorePreview] = useState<Backup | null>(null)
  const [restored, setRestored] = useState<number | null>(null)

  async function handleExport() {
    setBusy('export')
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('occurred_at', { ascending: false })
      if (error) throw error
      const csv = buildTransactionsCsv(
        data as Transaction[],
        indexById(accounts),
        indexById(categories),
      )
      downloadTextFile(`tracr-transactions-${format(new Date(), 'yyyy-MM-dd')}.csv`, csv)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setBusy(null)
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    const text = await file.text()
    setImported(null)
    setPreview(parseTransactionsCsv(text, accounts, categories))
  }

  async function confirmImport() {
    if (!preview) return
    try {
      const n = await importMut.mutateAsync(preview.valid)
      setImported(n)
      setPreview(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Import failed.')
    }
  }

  function downloadTemplate() {
    downloadTextFile('tracr-import-template.csv', sampleCsv(accounts[0]?.name ?? 'Cash', 'IDR'))
  }

  async function handleBackup() {
    setBusy('backup')
    try {
      const backup = await buildBackup(profile?.base_currency ?? null)
      downloadTextFile(
        `tracr-backup-${format(new Date(), 'yyyy-MM-dd')}.json`,
        JSON.stringify(backup, null, 2),
        'application/json',
      )
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Backup failed.')
    } finally {
      setBusy(null)
    }
  }

  async function handleBackupFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setRestored(null)
    try {
      setRestorePreview(parseBackup(await file.text()))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not read that file.')
    }
  }

  async function confirmRestore() {
    if (!restorePreview) return
    setBusy('restore')
    try {
      const n = await restoreBackup(restorePreview)
      await qc.invalidateQueries()
      setRestored(n)
      setRestorePreview(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Restore failed.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <Card className="space-y-3">
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" loading={busy === 'export'} onClick={handleExport}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button variant="secondary" className="flex-1" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> Import CSV
          </Button>
        </div>
        <button
          onClick={downloadTemplate}
          className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" /> Download import template
        </button>
        {imported !== null && (
          <p className="px-1 text-xs text-primary">Imported {imported} transaction(s).</p>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFile}
        />

        {/* Full JSON backup / restore */}
        <div className="border-t border-border pt-3">
          <p className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold text-muted-foreground">
            <Database className="h-3.5 w-3.5" /> Full backup
          </p>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              loading={busy === 'backup'}
              onClick={handleBackup}
            >
              <HardDriveDownload className="h-4 w-4" /> Backup JSON
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => backupRef.current?.click()}
            >
              <Upload className="h-4 w-4" /> Restore JSON
            </Button>
          </div>
          <p className="mt-2 px-1 text-xs text-muted-foreground">
            Everything — accounts, transactions, budgets, bills, goals & more — in one portable file.
          </p>
          {restored !== null && (
            <p className="mt-1 px-1 text-xs text-primary">Restored {restored} record(s).</p>
          )}
        </div>
        <input
          ref={backupRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleBackupFile}
        />
      </Card>

      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title="Import preview">
        {preview && (
          <div className="space-y-4">
            <div className="rounded-xl bg-surface-muted p-3 text-sm">
              <p>
                <span className="font-semibold text-primary">{preview.valid.length}</span> valid row(s)
                ready to import.
              </p>
              {preview.errors.length > 0 && (
                <p className="text-muted-foreground">
                  <span className="font-semibold text-danger">{preview.errors.length}</span> row(s)
                  skipped.
                </p>
              )}
            </div>

            {preview.errors.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-xl border border-border p-3 text-xs">
                {preview.errors.slice(0, 50).map((err, i) => (
                  <p key={i} className="text-muted-foreground">
                    Line {err.line}: {err.message}
                  </p>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setPreview(null)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                loading={importMut.isPending}
                disabled={preview.valid.length === 0}
                onClick={confirmImport}
              >
                Import {preview.valid.length}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(restorePreview)} onClose={() => setRestorePreview(null)} title="Restore backup">
        {restorePreview && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will add the backup’s data to your account. Records with the same id are
              overwritten; anything not in the backup is left untouched.
            </p>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl bg-surface-muted p-3 text-sm">
              {backupCounts(restorePreview)
                .filter((r) => r.count > 0)
                .map((r) => (
                  <div key={r.table} className="flex justify-between">
                    <span className="capitalize text-muted-foreground">{r.table.replace(/_/g, ' ')}</span>
                    <span className="font-numeric font-semibold text-foreground">{r.count}</span>
                  </div>
                ))}
            </div>
            {restorePreview.exported_at && (
              <p className="px-1 text-xs text-muted-foreground">
                Exported {format(new Date(restorePreview.exported_at), 'd MMM yyyy, HH:mm')}
              </p>
            )}
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setRestorePreview(null)}>
                Cancel
              </Button>
              <Button className="flex-1" loading={busy === 'restore'} onClick={confirmRestore}>
                Restore
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
