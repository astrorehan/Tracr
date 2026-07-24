import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Check, Loader2, SlidersHorizontal, Wallet, Zap } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { CategoryIcon } from '@/features/categories/CategoryIcon'
import { formatMoney } from '@/lib/money'
import { indexById } from '@/lib/collections'
import { cn } from '@/lib/utils'
import { useT } from '@/features/settings/language-context'
import { useAccounts } from '@/features/accounts/api'
import { useCategories } from '@/features/categories/api'
import { useRules } from '@/features/rules/api'
import { evaluateRules } from '@/features/rules/engine'
import { useSetTransactionTags } from '@/features/tags/api'
import { useCreateTransaction } from './api'
import { parseQuickEntry, type QuickDraft } from './quickEntry'
import { TransactionForm } from './TransactionForm'

type Notice = { kind: 'ok' | 'err'; text: string }

/**
 * Express-entry bar: one text field that parses "25k coffee bca" into a draft
 * and saves it in a tap. Deterministic and offline — no AI, no credits. Anything
 * it can't fully resolve (or the user wants to tweak) hands off to the full form
 * via "More options", pre-filled with whatever was understood.
 */
export function QuickEntryBar() {
  const { t } = useT()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { data: rules = [] } = useRules()
  const create = useCreateTransaction()
  const setTags = useSetTransactionTags()

  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [formDraft, setFormDraft] = useState<QuickDraft | null>(null)

  const catById = useMemo(() => indexById(categories), [categories])

  const draft = useMemo(
    () => parseQuickEntry(text, { accounts, categories }),
    [text, accounts, categories],
  )

  // When the parser didn't spot a category, let the user's rules fill it (and
  // any tags) from the leftover note — the same engine the full form uses.
  const enriched = useMemo(() => {
    if (draft.amountMinor == null) return { categoryId: draft.categoryId, tagIds: [] as string[] }
    const outcome = evaluateRules(rules, {
      payee: draft.note || null,
      note: draft.note || null,
      amount: draft.amountMinor,
      currency: draft.currency,
      type: draft.type,
    })
    return { categoryId: draft.categoryId ?? outcome.categoryId, tagIds: outcome.tagIds }
  }, [draft, rules])

  if (accounts.length === 0) return null

  const account = accounts.find((a) => a.id === draft.accountId)
  const category = enriched.categoryId ? catById[enriched.categoryId] : undefined
  const canSave = draft.amountMinor != null && draft.amountMinor > 0 && !!account
  const income = draft.type === 'income'

  async function save() {
    if (!canSave || !account || draft.amountMinor == null) return
    setSaving(true)
    setNotice(null)
    try {
      const tx = await create.mutateAsync({
        account_id: account.id,
        counter_account_id: null,
        category_id: enriched.categoryId,
        type: draft.type,
        amount: draft.amountMinor,
        currency: draft.currency,
        occurred_at: new Date().toISOString(),
        note: draft.note || null,
      })
      if (enriched.tagIds.length > 0)
        await setTags.mutateAsync({ transactionId: tx.id, tagIds: enriched.tagIds })
      setNotice({
        kind: 'ok',
        text: t('qe.saved', {
          amount: formatMoney(draft.amountMinor, draft.currency, { signDisplay: 'never' }),
        }),
      })
      setText('')
    } catch {
      setNotice({ kind: 'err', text: t('qe.saveFailed') })
    } finally {
      setSaving(false)
    }
  }

  function openForm() {
    // Freeze the current understanding so the full form opens pre-filled.
    setFormDraft({ ...draft, categoryId: enriched.categoryId })
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (canSave) void save()
    else if (text.trim()) openForm()
  }

  const showPreview = text.trim().length > 0

  return (
    <>
      <Card className="p-4">
        <div className="mb-2.5 flex items-center gap-1.5 px-0.5">
          <Zap className="h-[18px] w-[18px] text-primary" />
          <h2 className="text-base font-bold text-foreground">{t('qe.title')}</h2>
        </div>

        <div className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setNotice(null)
            }}
            onKeyDown={onKeyDown}
            placeholder={t('qe.placeholder')}
            aria-label={t('qe.title')}
            enterKeyHint="done"
            className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 text-base text-foreground shadow-sm transition-all placeholder:text-muted-foreground focus-visible:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          />
          {/* When a one-tap save is on the table, keep an escape hatch to the full
              form for the odd entry that needs a tag, receipt or split. */}
          {canSave && (
            <button
              type="button"
              onClick={openForm}
              disabled={saving}
              aria-label={t('qe.more')}
              className="pressable flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground shadow-sm transition-all hover:bg-surface-muted hover:text-foreground disabled:opacity-50"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => (canSave ? void save() : openForm())}
            disabled={saving || !text.trim()}
            className={cn(
              'pressable flex h-12 shrink-0 items-center gap-1.5 rounded-xl px-4 text-sm font-bold shadow-sm transition-all disabled:opacity-50',
              canSave
                ? 'bg-primary text-primary-foreground hover:brightness-[1.06]'
                : 'border border-border bg-surface text-foreground hover:bg-surface-muted',
            )}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : canSave ? (
              <Check className="h-4 w-4" />
            ) : (
              <SlidersHorizontal className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">{t(canSave ? 'common.save' : 'qe.more')}</span>
          </button>
        </div>

        {/* Live read-out of what the parser understood, so a one-tap save is never
            a blind one. */}
        {showPreview ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Chip
              tone={income ? 'green' : 'orange'}
              icon={income ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
            >
              {draft.amountMinor != null
                ? formatMoney(draft.amountMinor, draft.currency, { signDisplay: 'never' })
                : t('qe.needAmount')}
            </Chip>
            {account && (
              <Chip icon={<Wallet className="h-3.5 w-3.5" />}>{account.name}</Chip>
            )}
            <Chip
              icon={<CategoryIcon name={category?.icon} className="h-3.5 w-3.5" />}
              muted={!category}
            >
              {category?.name ?? t('txf.uncategorized')}
            </Chip>
            {draft.note && <Chip muted>{draft.note}</Chip>}
          </div>
        ) : (
          <p className="mt-2 px-0.5 text-xs font-medium text-muted-foreground">{t('qe.hint')}</p>
        )}

        {notice && (
          <p
            className={cn(
              'mt-2 flex items-center gap-1.5 px-0.5 text-xs font-semibold',
              notice.kind === 'ok' ? 'text-positive' : 'text-danger',
            )}
          >
            {notice.kind === 'ok' && <Check className="h-3.5 w-3.5" />}
            {notice.text}
          </p>
        )}
      </Card>

      {/* Fallback / tweak path — opens pre-filled from the frozen draft. */}
      <TransactionForm
        open={formDraft !== null}
        onClose={() => setFormDraft(null)}
        initialDraft={formDraft ?? undefined}
      />
    </>
  )
}

/** A small rounded pill for the preview read-out. */
function Chip({
  children,
  icon,
  tone,
  muted,
}: {
  children: React.ReactNode
  icon?: React.ReactNode
  tone?: 'green' | 'orange'
  muted?: boolean
}) {
  const toneCls =
    tone === 'green'
      ? 'border-positive/30 bg-positive/10 text-positive'
      : tone === 'orange'
        ? 'border-warning/30 bg-warning/10 text-warning'
        : muted
          ? 'border-border bg-surface-muted/60 text-muted-foreground'
          : 'border-border bg-surface text-foreground'
  return (
    <span
      className={cn(
        'inline-flex max-w-[45%] items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold',
        toneCls,
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  )
}
