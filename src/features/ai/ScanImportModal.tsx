import { useMemo, useState } from 'react'
import { AlertTriangle, Check, Landmark, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Dropdown, type DropdownOption } from '@/components/ui/Dropdown'
import { Modal } from '@/components/ui/Modal'
import { useAccounts } from '@/features/accounts/api'
import { useImportTransactions } from '@/features/data/api'
import { useT } from '@/features/settings/language-context'
import type { MsgKey, TVars } from '@/i18n'
import type { ParsedTxRow } from '@/features/data/transactionsCsv'
import { formatMoney, toMinorUnits } from '@/lib/money'
import type { Account } from '@/types/db'
import type { ScanDocument, ScannedTransaction } from './api'

type Translate = (key: MsgKey, vars?: TVars) => string

interface PreparedRow {
  index: number
  description: string
  date: string | null
  direction: 'debit' | 'credit' | null
  amountMinor: number
  currency: string
  valid: boolean
  problem: string | null
  transaction: ParsedTxRow | null
}

interface ScanImportModalProps {
  scan: ScanDocument | null
  onClose: () => void
  onImported: (imported: number, skipped: number) => void
}

/** The only write confirmation for a scanned receipt or statement. */
export function ScanImportModal({ scan, onClose, onImported }: ScanImportModalProps) {
  const { t } = useT()
  const { data: accounts = [] } = useAccounts()
  const importTransactions = useImportTransactions()
  // '' means "use the auto-detected default"; a non-empty value is the user's
  // explicit override from the dropdown.
  const [accountId, setAccountId] = useState('')
  const [excluded, setExcluded] = useState<Set<number>>(() => new Set())

  // Reset the manual choices whenever a new document arrives — render-phase so
  // there's no cascading effect re-render.
  const [prevScan, setPrevScan] = useState(scan)
  if (prevScan !== scan) {
    setPrevScan(scan)
    setAccountId('')
    setExcluded(new Set())
  }

  // Default account: the one whose name matches the scanned account, else the
  // only account when there is just one. Asked for at most once, via dropdown.
  const autoAccountId = useMemo(() => {
    if (!scan || accounts.length === 0) return ''
    const requested = scan.account_name?.trim().toLocaleLowerCase()
    const matching = requested
      ? accounts.find((account) => account.name.trim().toLocaleLowerCase() === requested) ??
        accounts.find((account) => account.name.trim().toLocaleLowerCase().includes(requested))
      : undefined
    return matching?.id ?? (accounts.length === 1 ? accounts[0].id : '')
  }, [accounts, scan])

  const selectedAccountId = accountId || autoAccountId
  const account = accounts.find((item) => item.id === selectedAccountId)
  const rows = useMemo(() => buildRows(scan, account, t), [account, scan, t])
  const selected = rows.filter((row) => !excluded.has(row.index))
  const valid = selected.filter((row) => row.valid && row.transaction)
  const invalid = selected.filter((row) => !row.valid)
  const accountOptions: DropdownOption<string>[] = [
    { value: '', label: t('ai.scanChooseAccount') },
    ...accounts.map((item) => ({ value: item.id, label: `${item.name} · ${item.currency}` })),
  ]

  if (!scan) return null

  const isUnknown = scan.document_type === 'unknown'
  const title = isUnknown
    ? t('ai.scanTitleUnknown')
    : scan.document_type === 'receipt'
      ? t('ai.scanTitleReceipt')
      : t('ai.scanTitleTxns', { count: rows.length })
  const description = isUnknown ? t('ai.scanDescUnknown') : t('ai.scanDesc')

  function toggle(index: number) {
    setExcluded((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  async function confirm() {
    const imported = await importTransactions.mutateAsync(valid.map((row) => row.transaction!))
    onImported(imported, valid.length - imported)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={title} description={description} className="max-w-2xl">
      <div className="space-y-4">
        {!isUnknown && (
          <div className="rounded-xl border border-border bg-surface-muted p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <Landmark className="h-3.5 w-3.5" /> {t('ai.scanAccount')}
            </p>
            <Dropdown
              value={selectedAccountId}
              onChange={setAccountId}
              options={accountOptions}
              aria-label={t('ai.scanAccount')}
            />
            {accounts.length > 1 && !selectedAccountId && (
              <p className="mt-2 text-xs text-warning">{t('ai.scanNeedAccount')}</p>
            )}
          </div>
        )}

        {(scan.warnings.length > 0 || invalid.length > 0 || isUnknown) && (
          <div className="rounded-xl border border-warning/35 bg-warning/10 p-3 text-sm text-foreground">
            <p className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="h-4 w-4 text-warning" /> {t('ai.scanCheck')}
            </p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {scan.warnings.map((warning, index) => <li key={`warning-${index}`}>{warning}</li>)}
              {isUnknown && scan.warnings.length === 0 && <li>{t('ai.scanUnknownHint')}</li>}
              {invalid.slice(0, 3).map((row) => (
                <li key={`invalid-${row.index}`}>
                  {t('ai.scanRowProblem', { n: row.index + 1, problem: row.problem ?? '' })}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!isUnknown && rows.length > 0 && (
          <div className="max-h-[42vh] overflow-auto rounded-xl border border-border">
            <div className="min-w-[580px] divide-y divide-border text-sm">
              {rows.map((row) => {
                const isSelected = !excluded.has(row.index)
                return (
                  <div key={row.index} className="flex items-center gap-3 px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => toggle(row.index)}
                      aria-label={`${isSelected ? 'Exclude' : 'Include'} row ${row.index + 1}`}
                      className={isSelected
                        ? 'flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary text-white'
                        : 'h-5 w-5 shrink-0 rounded-md border border-border bg-surface'}
                    >
                      {isSelected && <Check className="h-3.5 w-3.5" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-foreground">{row.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.date ?? t('ai.scanDateUnreadable')} · {row.direction ?? t('ai.scanDirUnreadable')}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={row.direction === 'credit' ? 'font-numeric font-bold text-primary' : 'font-numeric font-bold text-foreground'}>
                        {row.amountMinor > 0 ? formatMoney(row.amountMinor, row.currency) : t('ai.scanUnreadable')}
                      </p>
                      {!row.valid && <p className="text-xs font-medium text-danger">{row.problem}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {!isUnknown && rows.length === 0 && (
          <p className="rounded-xl bg-surface-muted p-3 text-sm text-muted-foreground">
            {t('ai.scanNoRows')}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>{t('common.cancel')}</Button>
          {!isUnknown && (
            <Button
              className="flex-1"
              loading={importTransactions.isPending}
              disabled={!account || valid.length === 0}
              onClick={() => void confirm()}
            >
              {t('ai.scanSave', { count: valid.length })}
            </Button>
          )}
          {isUnknown && <Button className="flex-1" onClick={onClose}><X className="h-4 w-4" /> {t('common.close')}</Button>}
        </div>
      </div>
    </Modal>
  )
}

function buildRows(scan: ScanDocument | null, account: Account | undefined, t: Translate): PreparedRow[] {
  if (!scan) return []
  const isReceipt = scan.document_type === 'receipt'
  return scan.transactions.map((item, index) => buildRow(item, index, scan.currency, account, t, isReceipt))
}

function buildRow(
  item: ScannedTransaction,
  index: number,
  documentCurrency: string | null,
  account: Account | undefined,
  t: Translate,
  isReceipt: boolean,
): PreparedRow {
  const description = item.description?.trim() || t('ai.scanUnlabelled')
  const currency = (item.currency ?? documentCurrency ?? account?.currency ?? 'IDR').toUpperCase()
  const amountMinor = item.amount != null ? toMinorUnits(item.amount, currency) : 0
  // A single receipt with no printed date reasonably defaults to today;
  // statement rows stay strict since a missing date there is a real read error.
  const date = item.date ?? (isReceipt ? new Date().toISOString().slice(0, 10) : null)
  let problem: string | null = null
  if (!account) problem = t('ai.scanProblemAccount')
  else if (currency !== account.currency) problem = t('ai.scanProblemCurrency', { a: currency, b: account.currency })
  else if (!date) problem = t('ai.scanDateUnreadable')
  else if (!item.direction) problem = t('ai.scanProblemDir')
  else if (!Number.isFinite(amountMinor) || amountMinor <= 0) problem = t('ai.scanProblemAmount')

  const valid = problem == null
  return {
    index,
    description,
    date,
    direction: item.direction,
    amountMinor,
    currency,
    valid,
    problem,
    transaction: valid && account && date && item.direction
      ? {
          account_id: account.id,
          category_id: null,
          counter_account_id: null,
          type: item.direction === 'credit' ? 'income' : 'expense',
          amount: amountMinor,
          currency,
          occurred_at: `${date}T12:00:00.000Z`,
          payee: description,
          note: item.note?.trim() || null,
          external_ref: item.reference?.trim() || null,
          status: 'cleared',
          dedupe: true,
        }
      : null,
  }
}
