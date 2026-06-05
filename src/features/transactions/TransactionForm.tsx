import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Paperclip, Plus, Split, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Label, Select } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { getCurrency } from '@/lib/currencies'
import { amountToMinor, formatMoney, fromMinorUnits } from '@/lib/money'
import { isExpression } from '@/lib/calc'
import { useAuth } from '@/features/auth/useAuth'
import { useFxRates } from '@/features/fx/api'
import { buildRateTable, convertMinor } from '@/features/fx/fx'
import { useAccounts } from '@/features/accounts/api'
import { useCategories } from '@/features/categories/api'
import { flattenWithDepth } from '@/features/categories/tree'
import { TagPicker } from '@/features/tags/TagPicker'
import { useSetTransactionTags } from '@/features/tags/api'
import { useSetTransactionSplits } from './splits'
import { useUploadAttachments } from '@/features/attachments/api'
import { useCreateTransaction } from './api'
import type { TransactionType } from '@/types/db'

interface Props {
  open: boolean
  onClose: () => void
  defaultAccountId?: string
}

const TYPES: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
]

interface SplitRow {
  key: string
  categoryId: string
  amount: string
}

function newRow(categoryId = '', amount = ''): SplitRow {
  return { key: crypto.randomUUID(), categoryId, amount }
}

function todayLocal() {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10)
}

export function TransactionForm({ open, onClose, defaultAccountId }: Props) {
  // Modal unmounts its children when closed, so the body resets on every open.
  return (
    <Modal open={open} onClose={onClose} title="Add transaction">
      {open && <TransactionFormBody onClose={onClose} defaultAccountId={defaultAccountId} />}
    </Modal>
  )
}

function TransactionFormBody({
  onClose,
  defaultAccountId,
}: {
  onClose: () => void
  defaultAccountId?: string
}) {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const base = profile?.base_currency ?? 'IDR'
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { data: fxRates = [] } = useFxRates()
  const create = useCreateTransaction()
  const setTags = useSetTransactionTags()
  const setSplits = useSetTransactionSplits()
  const uploadFiles = useUploadAttachments()
  const fileRef = useRef<HTMLInputElement>(null)

  const [type, setType] = useState<TransactionType>('expense')
  const [accountId, setAccountId] = useState(defaultAccountId ?? accounts[0]?.id ?? '')
  const [counterId, setCounterId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayLocal())
  const [note, setNote] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [splitMode, setSplitMode] = useState(false)
  const [splits, setSplits_] = useState<SplitRow[]>([newRow(), newRow()])
  const [counterAmount, setCounterAmount] = useState('')
  const [counterEdited, setCounterEdited] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fall back to the first account if state is still empty (e.g. accounts
  // loaded after this body mounted).
  const effectiveAccountId = accountId || accounts[0]?.id || ''
  const account = accounts.find((a) => a.id === effectiveAccountId)
  const currency = account?.currency ?? 'IDR'
  const symbol = getCurrency(currency).symbol

  // Cross-currency transfer: the destination account holds a different currency,
  // so the user enters (or accepts a rate-based suggestion for) the amount the
  // counter account actually receives.
  const destAccount = accounts.find((a) => a.id === counterId)
  const crossCurrency =
    type === 'transfer' && !!destAccount && destAccount.currency !== currency
  const destCurrency = destAccount?.currency ?? currency
  const rateTable = useMemo(() => buildRateTable(fxRates, base), [fxRates, base])

  // Suggest the received amount from the latest rate; the user's own input takes
  // over once they edit. Derived (no effect) so it always tracks the source amount.
  const suggestedCounter = useMemo(() => {
    if (!crossCurrency) return ''
    const srcMinor = amountToMinor(amount, currency)
    if (srcMinor <= 0) return ''
    const conv = convertMinor(srcMinor, currency, destCurrency, rateTable)
    return conv != null ? String(fromMinorUnits(conv, destCurrency)) : ''
  }, [crossCurrency, amount, currency, destCurrency, rateTable])
  const counterValue = counterEdited ? counterAmount : suggestedCounter

  const categoryOptions = useMemo(
    () =>
      flattenWithDepth(
        categories.filter((c) => c.kind === (type === 'income' ? 'income' : 'expense')),
      ),
    [categories, type],
  )

  const canSplit = type !== 'transfer'
  const splitting = canSplit && splitMode

  const splitTotal = useMemo(
    () => splits.reduce((sum, r) => sum + Math.max(0, amountToMinor(r.amount, currency)), 0),
    [splits, currency],
  )

  // Live calculator result for the focal amount field (only when an expression).
  const amountPreview = isExpression(amount) ? amountToMinor(amount, currency) : null

  function updateSplit(key: string, patch: Partial<SplitRow>) {
    setSplits_((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }
  function addSplit() {
    setSplits_((rows) => [...rows, newRow()])
  }
  function removeSplit(key: string) {
    setSplits_((rows) => (rows.length > 1 ? rows.filter((r) => r.key !== key) : rows))
  }
  function toggleSplit() {
    setSplitMode((on) => {
      const next = !on
      // Seed the first row from the single-category fields when entering split mode.
      if (next) setSplits_([newRow(categoryId, amount), newRow()])
      return next
    })
  }

  if (accounts.length === 0) {
    return (
      <div>
        <p className="text-sm text-muted-foreground">
          You need at least one account before logging a transaction.
        </p>
        <Button
          className="mt-4 w-full"
          onClick={() => {
            onClose()
            navigate('/accounts')
          }}
        >
          Go to Accounts
        </Button>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!effectiveAccountId) return setError('Pick an account.')

    if (type === 'transfer') {
      if (!counterId) return setError('Pick a destination account.')
      if (counterId === effectiveAccountId) return setError('Choose two different accounts.')
    }

    // Determine the total + whether we'll write splits.
    let amountMinor: number
    let splitRows: { category_id: string | null; amount: number }[] = []
    if (splitting) {
      splitRows = splits
        .map((r) => ({ category_id: r.categoryId || null, amount: amountToMinor(r.amount, currency) }))
        .filter((r) => r.amount > 0)
      if (splitRows.length < 2)
        return setError('Add at least two splits, or turn off Split.')
      amountMinor = splitRows.reduce((s, r) => s + r.amount, 0)
    } else {
      amountMinor = amountToMinor(amount, currency)
      if (amountMinor <= 0) return setError('Enter an amount greater than zero.')
    }

    // Cross-currency transfer: credit the counter account a different amount in
    // its own currency (rate-based suggestion, user-editable).
    let counterAmountMinor: number | null = null
    let counterFxRate: number | null = null
    if (type === 'transfer' && crossCurrency) {
      counterAmountMinor = amountToMinor(counterValue, destCurrency)
      if (counterAmountMinor <= 0)
        return setError(`Enter the amount received in ${destCurrency}.`)
      const srcMajor = fromMinorUnits(amountMinor, currency)
      counterFxRate = srcMajor > 0 ? fromMinorUnits(counterAmountMinor, destCurrency) / srcMajor : null
    }

    const occurredAt = new Date(`${date}T${new Date().toTimeString().slice(0, 8)}`).toISOString()

    try {
      const tx = await create.mutateAsync({
        account_id: effectiveAccountId,
        counter_account_id: type === 'transfer' ? counterId : null,
        // A split transaction has no single category; its breakdown lives in splits.
        category_id: type === 'transfer' || splitting ? null : categoryId || null,
        type,
        amount: amountMinor,
        currency,
        counter_amount: counterAmountMinor,
        counter_fx_rate: counterFxRate,
        occurred_at: occurredAt,
        note: note.trim() || null,
      })
      if (splitting) await setSplits.mutateAsync({ transactionId: tx.id, splits: splitRows })
      if (tagIds.length > 0) await setTags.mutateAsync({ transactionId: tx.id, tagIds })
      if (files.length > 0) await uploadFiles.mutateAsync({ transactionId: tx.id, files })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Type switch */}
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-muted p-1">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value)}
            className={cn(
              'rounded-lg py-2 text-sm transition-all duration-200',
              type === t.value
                ? 'bg-surface font-bold text-foreground shadow-sm'
                : 'font-semibold text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Amount — focal point */}
      <div className="rounded-2xl border border-border bg-surface-muted p-5 text-center">
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {type} amount
        </p>
        <div className="flex items-center justify-center gap-1.5 font-numeric text-4xl font-extrabold">
          <span className="text-muted-foreground">{symbol}</span>
          {splitting ? (
            <span className="min-w-[4rem]">
              {new Intl.NumberFormat().format(fromMinorUnits(splitTotal, currency))}
            </span>
          ) : (
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              autoFocus
              className="w-44 bg-transparent text-center outline-none placeholder:text-muted-foreground/40"
            />
          )}
        </div>
        {splitting && (
          <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
            Total of {splits.filter((r) => amountToMinor(r.amount, currency) > 0).length} splits
          </p>
        )}
        {!splitting && amountPreview !== null && (
          <p className="mt-1 text-[11px] font-semibold text-primary">
            = {formatMoney(amountPreview, currency, { signDisplay: 'never' })}
          </p>
        )}
      </div>

      <Field label={type === 'transfer' ? 'From account' : 'Account'}>
        <Select value={effectiveAccountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </Select>
      </Field>

      {type === 'transfer' ? (
        <>
          <Field label="To account">
            <Select value={counterId} onChange={(e) => setCounterId(e.target.value)}>
              <option value="">Select…</option>
              {accounts
                .filter((a) => a.id !== effectiveAccountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
            </Select>
          </Field>

          {crossCurrency && (
            <Field label={`Amount received (${destCurrency})`}>
              <div className="flex items-center gap-2">
                <span className="font-numeric text-sm font-semibold text-muted-foreground">
                  {getCurrency(destCurrency).symbol}
                </span>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={counterValue}
                  onChange={(e) => {
                    setCounterEdited(true)
                    setCounterAmount(e.target.value)
                  }}
                  placeholder="0"
                />
              </div>
              <p className="mt-1.5 text-[11px] font-medium text-muted-foreground">
                {amountToMinor(counterValue, destCurrency) > 0 && amountToMinor(amount, currency) > 0
                  ? `≈ 1 ${currency} = ${new Intl.NumberFormat(undefined, {
                      maximumFractionDigits: 6,
                    }).format(
                      fromMinorUnits(amountToMinor(counterValue, destCurrency), destCurrency) /
                        fromMinorUnits(amountToMinor(amount, currency), currency),
                    )} ${destCurrency}`
                  : counterEdited
                    ? 'Enter what the destination account receives.'
                    : `No saved ${currency}→${destCurrency} rate — enter the received amount, or add a rate in Settings.`}
              </p>
            </Field>
          )}
        </>
      ) : (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="mb-0">{splitting ? 'Splits' : 'Category'}</Label>
            <button
              type="button"
              onClick={toggleSplit}
              className={cn(
                'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition',
                splitting
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground',
              )}
              aria-pressed={splitting}
            >
              <Split className="h-3.5 w-3.5" />
              {splitting ? 'Splitting' : 'Split'}
            </button>
          </div>

          {splitting ? (
            <div className="space-y-2">
              {splits.map((r) => (
                <div key={r.key} className="flex gap-2">
                  <Select
                    value={r.categoryId}
                    onChange={(e) => updateSplit(r.key, { categoryId: e.target.value })}
                    className="h-11 flex-1"
                  >
                    <option value="">Uncategorized</option>
                    {categoryOptions.map(({ category, depth }) => (
                      <option key={category.id} value={category.id}>
                        {depth ? '  — ' : ''}
                        {category.name}
                      </option>
                    ))}
                  </Select>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={r.amount}
                    onChange={(e) => updateSplit(r.key, { amount: e.target.value })}
                    placeholder="0"
                    className="h-11 w-28 rounded-xl border border-border bg-surface px-3 text-right font-numeric text-sm text-foreground shadow-sm focus-visible:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                  />
                  <button
                    type="button"
                    onClick={() => removeSplit(r.key)}
                    disabled={splits.length <= 1}
                    className="flex h-11 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                    aria-label="Remove split"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addSplit}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary transition hover:bg-primary/10"
              >
                <Plus className="h-3.5 w-3.5" /> Add split
              </button>
            </div>
          ) : (
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Uncategorized</option>
              {categoryOptions.map(({ category, depth }) => (
                <option key={category.id} value={category.id}>
                  {depth ? '  — ' : ''}
                  {category.name}
                </option>
              ))}
            </Select>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </Field>
      </div>

      <Field label="Tags">
        <TagPicker selected={tagIds} onChange={setTagIds} />
      </Field>

      <Field label="Receipts">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            setFiles((cur) => [...cur, ...Array.from(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-primary"
        >
          <Paperclip className="h-4 w-4" /> Attach receipt
        </button>
        {files.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <span
                key={`${f.name}-${i}`}
                className="inline-flex items-center gap-1 rounded-full bg-surface-muted py-1 pl-3 pr-1.5 text-xs font-medium text-foreground"
              >
                <span className="max-w-[10rem] truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => setFiles((cur) => cur.filter((_, idx) => idx !== i))}
                  className="rounded-full p-0.5 text-muted-foreground hover:text-danger"
                  aria-label={`Remove ${f.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </Field>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button
        type="submit"
        className="w-full"
        size="lg"
        loading={
          create.isPending || setTags.isPending || setSplits.isPending || uploadFiles.isPending
        }
      >
        Save transaction
        {splitting && splitTotal > 0 ? ` · ${formatMoney(splitTotal, currency, { signDisplay: 'never' })}` : ''}
      </Button>
    </form>
  )
}
