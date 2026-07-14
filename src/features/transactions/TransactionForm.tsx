import { useMemo, useRef, useState, type ComponentType } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  BookmarkPlus,
  Camera,
  Check,
  Loader2,
  Paperclip,
  Plus,
  Sparkles,
  Split,
  X,
  Zap,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Label, Select } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { getCurrency } from '@/lib/currencies'
import { amountToMinor, formatMoney, fromMinorUnits } from '@/lib/money'
import { isExpression } from '@/lib/calc'
import { useAuth } from '@/features/auth/useAuth'
import { useActiveBook } from '@/features/books/useActiveBook'
import { useT } from '@/features/settings/language-context'
import { callAi, type ScanDocument } from '@/features/ai/api'
import { prepareScanImages } from '@/features/ai/image'
import { useFxRates } from '@/features/fx/api'
import { buildRateTable, convertMinor } from '@/features/fx/fx'
import { useAccounts } from '@/features/accounts/api'
import { useCategories } from '@/features/categories/api'
import { flattenWithDepth } from '@/features/categories/tree'
import { TagPicker } from '@/features/tags/TagPicker'
import { useSetTransactionTags } from '@/features/tags/api'
import { useSetTransactionSplits } from './splits'
import { useUploadAttachments } from '@/features/attachments/api'
import { useRules } from '@/features/rules/api'
import { evaluateRules } from '@/features/rules/engine'
import { useCreateTransaction, useUpdateTransaction, usePayees, useTransactions } from './api'
import {
  useTransactionTemplates,
  useCreateTemplate,
  useDeleteTemplate,
} from './templates'
import type {
  Transaction,
  TransactionSplit,
  TransactionTemplate,
  TransactionType,
} from '@/types/db'

interface Props {
  open: boolean
  onClose: () => void
  defaultAccountId?: string
  transaction?: Transaction
  initialTagIds?: string[]
  initialSplits?: TransactionSplit[]
  initialCounterAmount?: string
}

type IconType = ComponentType<{ className?: string }>

// Active pill takes the money-direction color + a matching direction glyph so the
// chosen type reads at a glance.
const TYPES: { value: TransactionType; label: string; activeText: string; icon: IconType }[] = [
  { value: 'expense', label: 'Expense', activeText: 'text-negative', icon: ArrowUpRight },
  { value: 'income', label: 'Income', activeText: 'text-positive', icon: ArrowDownLeft },
  { value: 'transfer', label: 'Transfer', activeText: 'text-foreground', icon: ArrowLeftRight },
]

const AMOUNT_TONE: Record<TransactionType, { label: string; border: string }> = {
  expense: { label: 'text-negative', border: 'border-negative/30' },
  income: { label: 'text-positive', border: 'border-positive/30' },
  transfer: { label: 'text-muted-foreground', border: 'border-border' },
}

interface SplitRow {
  key: string
  categoryId: string
  amount: string
}

/** Result of a receipt scan, shown as a small banner above the form. */
type ScanNotice = { kind: 'ok' | 'error'; text: string }

function newRow(categoryId = '', amount = ''): SplitRow {
  return { key: crypto.randomUUID(), categoryId, amount }
}

function todayLocal() {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10)
}

function toLocalDate(isoString: string) {
  const d = new Date(isoString)
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10)
}

export function TransactionForm({
  open,
  onClose,
  defaultAccountId,
  transaction,
  initialTagIds,
  initialSplits,
  initialCounterAmount,
}: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={transaction ? 'Edit transaction' : 'Add transaction'}
      className="sm:max-w-2xl"
    >
      {open && (
        <TransactionFormBody
          onClose={onClose}
          defaultAccountId={defaultAccountId}
          transaction={transaction}
          initialTagIds={initialTagIds}
          initialSplits={initialSplits}
          initialCounterAmount={initialCounterAmount}
        />
      )}
    </Modal>
  )
}

function TransactionFormBody({
  onClose,
  defaultAccountId,
  transaction,
  initialTagIds = [],
  initialSplits = [],
  initialCounterAmount = '',
}: {
  onClose: () => void
  defaultAccountId?: string
  transaction?: Transaction
  initialTagIds?: string[]
  initialSplits?: TransactionSplit[]
  initialCounterAmount?: string
}) {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { activeBookId } = useActiveBook()
  const { lang } = useT()
  const base = profile?.base_currency ?? 'IDR'
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { data: fxRates = [] } = useFxRates()
  const { data: payeeSuggestions = [] } = usePayees()
  const { data: rules = [] } = useRules()
  const { data: recentTx = [] } = useTransactions({ limit: 100 })
  const { data: templates = [] } = useTransactionTemplates()
  const createTemplate = useCreateTemplate()
  const deleteTemplate = useDeleteTemplate()
  const editing = !!transaction
  const create = useCreateTransaction()
  const update = useUpdateTransaction()
  const setTags = useSetTransactionTags()
  const setSplits = useSetTransactionSplits()
  const uploadFiles = useUploadAttachments()
  const fileRef = useRef<HTMLInputElement>(null)
  const scanRef = useRef<HTMLInputElement>(null)

  const [type, setType] = useState<TransactionType>(transaction?.type ?? 'expense')
  const [accountId, setAccountId] = useState(
    transaction?.account_id ?? (defaultAccountId ?? accounts[0]?.id ?? ''),
  )
  const [counterId, setCounterId] = useState(transaction?.counter_account_id ?? '')
  const [categoryId, setCategoryId] = useState(transaction?.category_id ?? '')
  const [amount, setAmount] = useState(
    transaction ? String(fromMinorUnits(transaction.amount, transaction.currency)) : '',
  )
  const [date, setDate] = useState(transaction ? toLocalDate(transaction.occurred_at) : todayLocal())
  const [payee, setPayee] = useState(transaction?.payee ?? '')
  const [note, setNote] = useState(transaction?.note ?? '')
  const [tagIds, setTagIds] = useState<string[]>(editing ? initialTagIds : [])
  const [files, setFiles] = useState<File[]>([])
  const [splitMode, setSplitMode] = useState(initialSplits.length > 0)
  const [splits, setSplits_] = useState<SplitRow[]>(
    initialSplits.length > 0 && transaction
      ? initialSplits.map((s) =>
          newRow(s.category_id ?? '', String(fromMinorUnits(s.amount, transaction.currency))),
        )
      : [newRow(), newRow()],
  )
  const [counterAmount, setCounterAmount] = useState(initialCounterAmount)
  const [linkedId, setLinkedId] = useState(transaction?.linked_transaction_id ?? '')
  const [counterEdited, setCounterEdited] = useState(editing && !!initialCounterAmount)
  const [categoryTouched, setCategoryTouched] = useState(editing)
  const [tagsTouched, setTagsTouched] = useState(editing)
  const [savingTpl, setSavingTpl] = useState(false)
  const [tplName, setTplName] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Receipt scan: in-flight flag + the review banner after a fill.
  const [scanning, setScanning] = useState(false)
  const [scanNotice, setScanNotice] = useState<ScanNotice | null>(null)

  // Fall back to the first account if state is still empty (e.g. accounts
  // loaded after this body mounted).
  const effectiveAccountId = accountId || accounts[0]?.id || ''
  const account = accounts.find((a) => a.id === effectiveAccountId)
  const currency = account?.currency ?? transaction?.currency ?? 'IDR'
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
        categories.filter(
          (c) => !c.is_archived && c.kind === (type === 'income' ? 'income' : 'expense'),
        ),
      ),
    [categories, type],
  )

  const canSplit = type !== 'transfer'
  const splitting = canSplit && splitMode

  // Refund / reimbursement link: an income offsets an earlier expense (and vice
  // versa), so we offer the opposite-direction transactions as link targets.
  const linkCandidates = useMemo(() => {
    if (type === 'transfer') return []
    const opp: TransactionType = type === 'income' ? 'expense' : 'income'
    return recentTx.filter((t) => t.type === opp && t.id !== transaction?.id).slice(0, 50)
  }, [recentTx, type, transaction?.id])
  // Keep a currently-linked transaction selectable even if it's older than the
  // recent window we fetched.
  const linkedMissing =
    !!linkedId && !linkCandidates.some((t) => t.id === linkedId)
  function linkLabel(t: Transaction) {
    const who = t.payee || t.note || (t.type === 'income' ? 'Income' : 'Expense')
    const when = new Date(t.occurred_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    return `${when} · ${who} · ${formatMoney(t.amount, t.currency, { signDisplay: 'never' })}`
  }

  // Rules auto-fill category & tags as the user types, until they edit those
  // fields themselves (transfers and split mode opt out of category auto-fill).
  const ruleOutcome = useMemo(() => {
    if (type === 'transfer') return { categoryId: null as string | null, tagIds: [] as string[], matched: [] }
    return evaluateRules(rules, {
      payee: payee.trim() || null,
      note: note.trim() || null,
      amount: amountToMinor(amount, currency),
      currency,
      type,
    })
  }, [rules, payee, note, amount, currency, type])

  // Derived (no effect): the user's pick once they've touched the field,
  // otherwise the rule suggestion. Used for the inputs and on submit.
  const effectiveCategoryId =
    categoryTouched || splitting ? categoryId : (ruleOutcome.categoryId ?? '')
  const effectiveTagIds = tagsTouched ? tagIds : ruleOutcome.tagIds

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
      if (next) setSplits_([newRow(effectiveCategoryId, amount), newRow()])
      return next
    })
  }

  // Apply a saved template: pre-fill the single-entry fields. The amount is
  // valued in the template account's currency (or the current one as a fallback).
  function applyTemplate(t: TransactionTemplate) {
    setType(t.type)
    const acc = t.account_id ? accounts.find((a) => a.id === t.account_id) : undefined
    if (acc) setAccountId(acc.id)
    const cur = acc?.currency ?? currency
    if (t.category_id) {
      setCategoryTouched(true)
      setCategoryId(t.category_id)
    }
    if (t.amount > 0) setAmount(String(fromMinorUnits(t.amount, cur)))
    setTagsTouched(true)
    setPayee(t.payee ?? '')
    setNote(t.note ?? '')
    setSplitMode(false)
  }

  async function saveTemplate() {
    const name = tplName.trim()
    if (!name) return
    await createTemplate.mutateAsync({
      name,
      type,
      account_id: effectiveAccountId || null,
      category_id: effectiveCategoryId || null,
      amount: Math.max(0, amountToMinor(amount, currency)),
      payee: payee.trim() || null,
      note: note.trim() || null,
    })
    setTplName('')
    setSavingTpl(false)
  }

  // ── Receipt scan ──────────────────────────────────────────────────────────
  // Read a photo with the same vision path the assistant uses, then pre-fill the
  // single-entry fields so the user only reviews and saves. Never writes on its
  // own — the form's Save button stays the one confirmation.
  function applyScan(doc: ScanDocument) {
    const rows = doc.transactions.filter((r) => r.amount != null && r.amount > 0)
    if (rows.length === 0) {
      setScanNotice({ kind: 'error', text: 'No amount found on that receipt — enter it by hand.' })
      return
    }
    const first = rows[0]
    setType(first.direction === 'credit' ? 'income' : 'expense')
    setSplitMode(false)
    // Receipts often come back as a single total; itemised ones sum to it.
    const total = rows.reduce((sum, r) => sum + (r.amount ?? 0), 0)
    setAmount(String(total))
    setPayee(first.description?.trim() || doc.account_name?.trim() || '')
    setDate(first.date ?? todayLocal())
    const noteText =
      rows.length > 1
        ? rows.map((r) => r.description?.trim()).filter(Boolean).join(', ')
        : first.note?.trim() ?? ''
    if (noteText) setNote(noteText.slice(0, 200))
    // Let category/tag rules react to the filled-in payee.
    setCategoryTouched(false)
    setTagsTouched(false)
    const mismatch =
      doc.currency && doc.currency.toUpperCase() !== currency
        ? ` Amount is in ${doc.currency.toUpperCase()} — check it matches ${currency}.`
        : ''
    setScanNotice({
      kind: 'ok',
      text:
        (rows.length > 1
          ? `Filled from your photo · ${rows.length} items added up.`
          : 'Filled from your photo.') +
        ' Review and save.' +
        mismatch,
    })
  }

  async function handleScan(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || scanning) return
    if (!activeBookId) {
      setScanNotice({ kind: 'error', text: 'Pick a book first, then try scanning again.' })
      return
    }
    setScanNotice(null)
    setScanning(true)
    try {
      const images = await prepareScanImages(fileList)
      const data = await callAi({ mode: 'scan', book_id: activeBookId, lang, images })
      if (data.limited) {
        setScanNotice({ kind: 'error', text: 'You’ve hit your AI limit for now — enter it by hand.' })
        return
      }
      const doc = data.scan
      if (!doc || doc.document_type === 'unknown' || doc.transactions.length === 0) {
        setScanNotice({ kind: 'error', text: 'Couldn’t read a receipt there. Try a clearer photo.' })
        return
      }
      applyScan(doc)
    } catch {
      setScanNotice({ kind: 'error', text: 'Couldn’t read that image. Try another photo.' })
    } finally {
      setScanning(false)
    }
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
      if (editing) {
        await update.mutateAsync({
          id: transaction!.id,
          patch: {
            account_id: effectiveAccountId,
            counter_account_id: type === 'transfer' ? counterId || null : null,
            category_id: type === 'transfer' || splitting ? null : effectiveCategoryId || null,
            type,
            amount: amountMinor,
            currency,
            counter_amount: type === 'transfer' ? counterAmountMinor : null,
            counter_fx_rate: type === 'transfer' ? counterFxRate : null,
            occurred_at: occurredAt,
            payee: type === 'transfer' ? null : payee.trim() || null,
            note: note.trim() || null,
            linked_transaction_id: type === 'transfer' ? null : linkedId || null,
          },
        })
        await setSplits.mutateAsync({ transactionId: transaction!.id, splits: splitRows })
        await setTags.mutateAsync({ transactionId: transaction!.id, tagIds: effectiveTagIds })
        if (files.length > 0) await uploadFiles.mutateAsync({ transactionId: transaction!.id, files })
      } else {
        const tx = await create.mutateAsync({
          account_id: effectiveAccountId,
          counter_account_id: type === 'transfer' ? counterId : null,
          category_id: type === 'transfer' || splitting ? null : effectiveCategoryId || null,
          type,
          amount: amountMinor,
          currency,
          counter_amount: counterAmountMinor,
          counter_fx_rate: counterFxRate,
          occurred_at: occurredAt,
          payee: type === 'transfer' ? null : payee.trim() || null,
          note: note.trim() || null,
          linked_transaction_id: type === 'transfer' ? null : linkedId || null,
        })
        if (splitting) await setSplits.mutateAsync({ transactionId: tx.id, splits: splitRows })
        if (effectiveTagIds.length > 0)
          await setTags.mutateAsync({ transactionId: tx.id, tagIds: effectiveTagIds })
        if (files.length > 0) await uploadFiles.mutateAsync({ transactionId: tx.id, files })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    }
  }

  const categoryBlock =
    type === 'transfer' ? null : (
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
          <>
            <Select
              value={effectiveCategoryId}
              onChange={(e) => {
                setCategoryTouched(true)
                setCategoryId(e.target.value)
              }}
            >
              <option value="">Uncategorized</option>
              {categoryOptions.map(({ category, depth }) => (
                <option key={category.id} value={category.id}>
                  {depth ? '  — ' : ''}
                  {category.name}
                </option>
              ))}
            </Select>
            {!categoryTouched && ruleOutcome.matched.length > 0 && (
              <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-primary">
                <Zap className="h-3 w-3" /> Auto-filled by rule “{ruleOutcome.matched[0].name}”
              </p>
            )}
          </>
        )}
      </div>
    )

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Scan a receipt — auto-fill the whole form from a photo (new entries only) */}
      {!editing && (
        <div>
          <input
            ref={scanRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleScan(e.target.files)
              e.target.value = '' // let the same photo be picked again
            }}
          />
          <button
            type="button"
            onClick={() => scanRef.current?.click()}
            disabled={scanning}
            className="group flex w-full items-center gap-3 rounded-2xl border border-primary/25 bg-primary-soft/50 px-4 py-3.5 text-left transition-colors hover:border-primary/50 hover:bg-primary-soft disabled:cursor-wait disabled:opacity-80"
          >
            <span className="brand-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm">
              {scanning ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Camera className="h-5 w-5" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                {scanning ? 'Reading your receipt…' : 'Scan a receipt'}
                {!scanning && <Sparkles className="h-3.5 w-3.5 text-primary" />}
              </span>
              <span className="mt-0.5 block text-xs font-medium text-muted-foreground">
                {scanning ? 'This takes a few seconds.' : 'Snap a photo — we’ll fill in the details.'}
              </span>
            </span>
          </button>
          {scanNotice && (
            <p
              className={cn(
                'mt-2 flex items-start gap-1.5 text-xs font-semibold',
                scanNotice.kind === 'ok' ? 'text-positive' : 'text-danger',
              )}
            >
              {scanNotice.kind === 'ok' && <Check className="mt-px h-3.5 w-3.5 shrink-0" />}
              <span>{scanNotice.text}</span>
            </p>
          )}
        </div>
      )}

      {!editing && templates.length > 0 && (
        <div className="space-y-1.5">
          <Label className="mb-0">Quick templates</Label>
          <div className="flex flex-wrap gap-1.5">
            {templates.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center rounded-full border border-border bg-surface-muted/60 text-xs font-semibold text-foreground"
              >
                <button
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="rounded-l-full py-1 pl-3 pr-1.5 transition hover:text-primary"
                >
                  {t.name}
                </button>
                <button
                  type="button"
                  onClick={() => deleteTemplate.mutate(t.id)}
                  className="rounded-r-full py-1 pl-0.5 pr-2 text-muted-foreground transition hover:text-danger"
                  aria-label={`Delete template ${t.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Type switch */}
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-muted p-1">
        {TYPES.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm transition-all duration-200',
                type === t.value
                  ? cn('bg-surface font-bold shadow-sm', t.activeText)
                  : 'font-semibold text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Amount — focal point, tinted by money direction */}
      <div
        className={cn(
          'rounded-2xl border bg-surface-muted p-5 text-center transition-colors duration-300',
          AMOUNT_TONE[type].border,
        )}
      >
        <p
          className={cn(
            'mb-1.5 text-xs font-bold uppercase tracking-widest transition-colors duration-300',
            AMOUNT_TONE[type].label,
          )}
        >
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
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            Total of {splits.filter((r) => amountToMinor(r.amount, currency) > 0).length} splits
          </p>
        )}
        {!splitting && amountPreview !== null && (
          <p className="mt-1 text-xs font-semibold text-primary">
            = {formatMoney(amountPreview, currency, { signDisplay: 'never' })}
          </p>
        )}
      </div>

      {/* Details — two columns on desktop, single column on phones */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className={cn(splitting && 'sm:col-span-2')}>
          <Field label={type === 'transfer' ? 'From account' : 'Account'}>
            <Select value={effectiveAccountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {type === 'transfer' ? (
          <>
            <div>
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
            </div>

            {crossCurrency && (
              <div className="sm:col-span-2">
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
                  <p className="mt-1.5 text-xs font-medium text-muted-foreground">
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
              </div>
            )}
          </>
        ) : (
          <div className={cn(splitting && 'sm:col-span-2')}>{categoryBlock}</div>
        )}

        {type !== 'transfer' && (
          <div className="sm:col-span-2">
            <Field label={type === 'income' ? 'Payer / source' : 'Payee / merchant'}>
              <Input
                list="payee-suggestions"
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
                placeholder={type === 'income' ? 'Who paid you? (optional)' : 'Who did you pay? (optional)'}
                autoComplete="off"
              />
              <datalist id="payee-suggestions">
                {payeeSuggestions.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Field>
          </div>
        )}

        {type !== 'transfer' && (linkCandidates.length > 0 || linkedId) && (
          <div className="sm:col-span-2">
            <Field label={type === 'income' ? 'Refund for (optional)' : 'Reimbursed by (optional)'}>
              <Select value={linkedId} onChange={(e) => setLinkedId(e.target.value)}>
                <option value="">Not linked</option>
                {linkedMissing && <option value={linkedId}>Currently linked transaction</option>}
                {linkCandidates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {linkLabel(t)}
                  </option>
                ))}
              </Select>
              <p className="mt-1.5 text-xs font-medium text-muted-foreground">
                {type === 'income'
                  ? 'Tie this money back to the original expense it refunds.'
                  : 'Tie this to the income that paid you back for it.'}
              </p>
            </Field>
          </div>
        )}

        <div>
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <div>
          <Field label="Note">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label="Tags">
            <TagPicker
              selected={effectiveTagIds}
              onChange={(ids) => {
                setTagsTouched(true)
                setTagIds(ids)
              }}
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
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
        </div>
      </div>

      {type !== 'transfer' &&
        (savingTpl ? (
          <div className="flex items-center gap-2">
            <Input
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              placeholder="Template name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void saveTemplate()
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              onClick={() => void saveTemplate()}
              loading={createTemplate.isPending}
              disabled={!tplName.trim()}
            >
              Save
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setSavingTpl(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setTplName(payee.trim() || note.trim() || '')
              setSavingTpl(true)
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition hover:text-primary"
          >
            <BookmarkPlus className="h-3.5 w-3.5" /> Save as template
          </button>
        ))}

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button
        type="submit"
        className="w-full"
        size="lg"
        loading={
          create.isPending || update.isPending || setTags.isPending || setSplits.isPending || uploadFiles.isPending
        }
      >
        {editing ? 'Save changes' : 'Save transaction'}
        {splitting && splitTotal > 0 ? ` · ${formatMoney(splitTotal, currency, { signDisplay: 'never' })}` : ''}
      </Button>
    </form>
  )
}
