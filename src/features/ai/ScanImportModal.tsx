import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Check, Landmark } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Dropdown, type DropdownOption } from '@/components/ui/Dropdown'
import { Modal } from '@/components/ui/Modal'
import { useAccounts } from '@/features/accounts/api'
import { useImportTransactions } from '@/features/data/api'
import { useT } from '@/features/settings/language-context'
import type { MsgKey, TVars } from '@/i18n'
import type { ParsedTxRow } from '@/features/data/transactionsCsv'
import { formatMoney, toMinorUnits } from '@/lib/money'
import { cn } from '@/lib/utils'
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
  /** Intrinsically importable (date/direction/amount/currency all read cleanly).
   *  Whether an account is chosen is a separate, modal-level gate. */
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

  // Intrinsically importable rows the user hasn't unchecked. The account itself
  // is a separate gate (the Save button), so an unpicked account never makes a
  // clean row look broken.
  const validRows = rows.filter((row) => row.valid)
  const chosen = validRows.filter((row) => !excluded.has(row.index))
  const problemRows = rows.filter((row) => !row.valid)
  const toSave = account ? chosen.filter((row) => row.transaction) : []
  const allChosen = validRows.length > 0 && chosen.length === validRows.length

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
  const needsAccount = !isUnknown && rows.length > 0 && !selectedAccountId

  function toggle(index: number) {
    setExcluded((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function toggleAll() {
    setExcluded(allChosen ? new Set(validRows.map((row) => row.index)) : new Set())
  }

  async function confirm() {
    const imported = await importTransactions.mutateAsync(toSave.map((row) => row.transaction!))
    onImported(imported, toSave.length - imported)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={title} description={description} className="max-w-xl">
      <div className="space-y-4">
        {isUnknown ? (
          <UnknownState hint={scan.warnings[0] ?? t('ai.scanUnknownHint')} />
        ) : (
          <>
            {/* ── Save-to account ── */}
            <div>
              <label className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <Landmark className="h-3.5 w-3.5" /> {t('ai.scanAccount')}
              </label>
              <Dropdown
                value={selectedAccountId}
                onChange={setAccountId}
                options={accountOptions}
                aria-label={t('ai.scanAccount')}
              />
              {needsAccount && (
                <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-warning">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {t('ai.scanNeedAccount')}
                </p>
              )}
            </div>

            {/* ── Rows ── */}
            {rows.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border border-border">
                <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-muted/60 px-3.5 py-2.5">
                  <button
                    type="button"
                    onClick={toggleAll}
                    disabled={validRows.length === 0}
                    className="pressable inline-flex items-center gap-2 text-xs font-bold text-foreground disabled:opacity-40"
                  >
                    <Box checked={allChosen} />
                    {allChosen ? t('ai.scanClear') : t('ai.scanSelectAll')}
                  </button>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {t('ai.scanSelectedCount', { n: chosen.length, total: validRows.length })}
                  </span>
                </div>

                <div className="max-h-[42vh] divide-y divide-border overflow-y-auto">
                  {rows.map((row) => (
                    <Row
                      key={row.index}
                      row={row}
                      checked={row.valid && !excluded.has(row.index)}
                      onToggle={() => toggle(row.index)}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <p className="rounded-2xl border border-border bg-surface-muted p-4 text-sm text-muted-foreground">
                {t('ai.scanNoRows')}
              </p>
            )}

            {/* ── Read notices (statement warnings only; per-row issues show inline) ── */}
            {scan.warnings.length > 0 && (
              <div className="rounded-2xl border border-warning/30 bg-warning/10 p-3.5">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-warning" /> {t('ai.scanCheck')}
                </p>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {scan.warnings.map((warning, index) => (
                    <li key={`warning-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {rows.length > 0 && validRows.length === 0 && scan.warnings.length === 0 && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
                {t('ai.scanNothingValid')}
              </p>
            )}
          </>
        )}

        {/* ── Actions ── */}
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            {isUnknown ? t('common.close') : t('common.cancel')}
          </Button>
          {!isUnknown && (
            <Button
              className="flex-1"
              loading={importTransactions.isPending}
              disabled={!account || toSave.length === 0}
              onClick={() => void confirm()}
            >
              {t('ai.scanSave', { count: chosen.length })}
            </Button>
          )}
        </div>
        {problemRows.length > 0 && !isUnknown && (
          <p className="text-center text-[11px] font-medium text-muted-foreground">
            {t('ai.scanRowProblem', {
              n: problemRows[0].index + 1,
              problem: problemRows[0].problem ?? '',
            })}
            {problemRows.length > 1 ? ` +${problemRows.length - 1}` : ''}
          </p>
        )}
      </div>
    </Modal>
  )
}

/** A single scanned line: check state, direction glyph, label, amount. Rows that
 *  didn't read cleanly show a warning marker instead of a checkbox and can't be
 *  chosen. */
function Row({
  row,
  checked,
  onToggle,
  t,
}: {
  row: PreparedRow
  checked: boolean
  onToggle: () => void
  t: Translate
}) {
  const credit = row.direction === 'credit'
  const dirLabel = credit ? t('ai.scanIn') : row.direction === 'debit' ? t('ai.scanOut') : t('ai.scanDirUnreadable')
  return (
    <div className={cn('flex items-center gap-3 px-3.5 py-3', !row.valid && 'opacity-70')}>
      {row.valid ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label={`${checked ? 'Exclude' : 'Include'} row ${row.index + 1}`}
        >
          <Box checked={checked} />
        </button>
      ) : (
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-warning/15 text-warning"
          title={row.problem ?? ''}
        >
          <AlertTriangle className="h-3 w-3" />
        </span>
      )}

      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          credit ? 'bg-positive/10 text-positive' : 'bg-surface-muted text-muted-foreground',
        )}
        aria-hidden
      >
        {credit ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{row.description}</p>
        <p className="truncate text-xs text-muted-foreground">
          {row.date ?? t('ai.scanDateUnreadable')} · {dirLabel}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p
          className={cn(
            'font-numeric text-sm font-bold',
            credit ? 'text-positive' : 'text-foreground',
          )}
        >
          {row.amountMinor > 0
            ? `${credit ? '+' : ''}${formatMoney(row.amountMinor, row.currency)}`
            : t('ai.scanUnreadable')}
        </p>
        {!row.valid && row.problem && (
          <p className="text-[11px] font-medium text-warning">{row.problem}</p>
        )}
      </div>
    </div>
  )
}

/** Square check control shared by the select-all header and each row. */
function Box({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
        checked ? 'border-primary bg-primary text-white' : 'border-border bg-surface',
      )}
    >
      {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
    </span>
  )
}

/** Shown when the image couldn't be parsed as a receipt or statement. */
function UnknownState({ hint }: { hint: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface-muted/50 px-4 py-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-warning">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <p className="max-w-[320px] text-sm font-medium text-muted-foreground">{hint}</p>
    </div>
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

  // Row validity covers only what was read off the image. A missing account is
  // NOT a row problem — it's one modal-level gate (the Save button), so an
  // unpicked account never spams every row with the same warning.
  let problem: string | null = null
  if (!date) problem = t('ai.scanDateUnreadable')
  else if (!item.direction) problem = t('ai.scanProblemDir')
  else if (!Number.isFinite(amountMinor) || amountMinor <= 0) problem = t('ai.scanProblemAmount')
  else if (account && currency !== account.currency)
    problem = t('ai.scanProblemCurrency', { a: currency, b: account.currency })

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
