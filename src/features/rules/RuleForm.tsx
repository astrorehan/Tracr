import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Label, Select } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { useCategories } from '@/features/categories/api'
import { flattenWithDepth } from '@/features/categories/tree'
import { TagPicker } from '@/features/tags/TagPicker'
import { useCreateRule, useUpdateRule } from './api'
import type { Rule, RuleCondition, RuleField, RuleMatch, RuleOp } from '@/types/db'

interface Props {
  open: boolean
  onClose: () => void
  rule?: Rule | null
}

const FIELD_LABELS: Record<RuleField, string> = {
  payee: 'Payee',
  note: 'Note',
  amount: 'Amount',
  type: 'Type',
}

const OPS_BY_FIELD: Record<RuleField, { value: RuleOp; label: string }[]> = {
  payee: [
    { value: 'contains', label: 'contains' },
    { value: 'equals', label: 'is exactly' },
    { value: 'starts_with', label: 'starts with' },
  ],
  note: [
    { value: 'contains', label: 'contains' },
    { value: 'equals', label: 'is exactly' },
    { value: 'starts_with', label: 'starts with' },
  ],
  amount: [
    { value: 'gt', label: 'greater than' },
    { value: 'lt', label: 'less than' },
    { value: 'equals', label: 'equals' },
  ],
  type: [{ value: 'equals', label: 'is' }],
}

function newCondition(): RuleCondition {
  return { field: 'payee', op: 'contains', value: '' }
}

export function RuleForm({ open, onClose, rule }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={rule ? 'Edit rule' : 'New rule'}>
      {open && <RuleFormBody onClose={onClose} rule={rule ?? null} />}
    </Modal>
  )
}

function RuleFormBody({ onClose, rule }: { onClose: () => void; rule: Rule | null }) {
  const create = useCreateRule()
  const update = useUpdateRule()
  const { data: categories = [] } = useCategories()

  const [name, setName] = useState(rule?.name ?? '')
  const [matchType, setMatchType] = useState<RuleMatch>(rule?.match_type ?? 'all')
  const [conditions, setConditions] = useState<RuleCondition[]>(
    rule?.conditions?.length ? rule.conditions : [newCondition()],
  )
  const [categoryId, setCategoryId] = useState(rule?.actions?.category_id ?? '')
  const [tagIds, setTagIds] = useState<string[]>(rule?.actions?.tag_ids ?? [])
  const [stopAfter, setStopAfter] = useState(rule?.stop_after ?? false)
  const [isActive, setIsActive] = useState(rule?.is_active ?? true)
  const [error, setError] = useState<string | null>(null)

  const categoryOptions = useMemo(
    () => flattenWithDepth(categories.filter((c) => !c.is_archived)),
    [categories],
  )

  const pending = create.isPending || update.isPending

  function updateCondition(i: number, patch: Partial<RuleCondition>) {
    setConditions((cur) =>
      cur.map((c, idx) => {
        if (idx !== i) return c
        const next = { ...c, ...patch }
        // Keep the operator valid when the field changes.
        if (patch.field && !OPS_BY_FIELD[patch.field].some((o) => o.value === next.op)) {
          next.op = OPS_BY_FIELD[patch.field][0].value
          next.value = patch.field === 'type' ? 'expense' : ''
        }
        return next
      }),
    )
  }
  function addCondition() {
    setConditions((cur) => [...cur, newCondition()])
  }
  function removeCondition(i: number) {
    setConditions((cur) => (cur.length > 1 ? cur.filter((_, idx) => idx !== i) : cur))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('Give this rule a name.')

    const cleaned = conditions
      .map((c) => ({ ...c, value: c.value.trim() }))
      .filter((c) => c.field === 'type' || c.value)
    if (cleaned.length === 0) return setError('Add at least one condition with a value.')
    if (!categoryId && tagIds.length === 0)
      return setError('Set a category and/or at least one tag for the action.')

    const patch = {
      name: name.trim(),
      match_type: matchType,
      conditions: cleaned,
      actions: { category_id: categoryId || null, tag_ids: tagIds },
      stop_after: stopAfter,
      is_active: isActive,
    }

    try {
      if (rule) await update.mutateAsync({ id: rule.id, patch })
      else await create.mutateAsync(patch)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the rule.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Rule name">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. GoFood → Food + delivery"
          autoFocus
        />
      </Field>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <Label className="mb-0">Conditions</Label>
          <div className="inline-flex overflow-hidden rounded-lg border border-border text-xs font-semibold">
            {(['all', 'any'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMatchType(m)}
                className={cn(
                  'px-2.5 py-1 transition',
                  matchType === m
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-surface text-muted-foreground hover:text-foreground',
                )}
              >
                {m === 'all' ? 'Match all' : 'Match any'}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {conditions.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-muted/50 p-2">
              <Select
                value={c.field}
                onChange={(e) => updateCondition(i, { field: e.target.value as RuleField })}
                className="h-10 w-[5.5rem] flex-none bg-surface"
              >
                {(Object.keys(FIELD_LABELS) as RuleField[]).map((f) => (
                  <option key={f} value={f}>
                    {FIELD_LABELS[f]}
                  </option>
                ))}
              </Select>
              <Select
                value={c.op}
                onChange={(e) => updateCondition(i, { op: e.target.value as RuleOp })}
                className="h-10 w-[7.5rem] flex-none bg-surface"
              >
                {OPS_BY_FIELD[c.field].map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              {c.field === 'type' ? (
                <Select
                  value={c.value || 'expense'}
                  onChange={(e) => updateCondition(i, { value: e.target.value })}
                  className="h-10 min-w-0 flex-1 bg-surface"
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                  <option value="transfer">Transfer</option>
                </Select>
              ) : (
                <Input
                  type={c.field === 'amount' ? 'number' : 'text'}
                  inputMode={c.field === 'amount' ? 'decimal' : undefined}
                  value={c.value}
                  onChange={(e) => updateCondition(i, { value: e.target.value })}
                  placeholder={c.field === 'amount' ? '0' : 'value'}
                  className="h-10 min-w-0 flex-1"
                />
              )}
              <button
                type="button"
                onClick={() => removeCondition(i)}
                disabled={conditions.length <= 1}
                className="flex h-10 w-9 flex-none items-center justify-center rounded-xl text-muted-foreground transition hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                aria-label="Remove condition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addCondition}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary transition hover:bg-primary/10"
          >
            <Plus className="h-3.5 w-3.5" /> Add condition
          </button>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border p-3">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Then</p>
        <Field label="Set category">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Don’t change</option>
            {categoryOptions.map(({ category, depth }) => (
              <option key={category.id} value={category.id}>
                {depth ? '  — ' : ''}
                {category.name} ({category.kind})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Add tags">
          <TagPicker selected={tagIds} onChange={setTagIds} />
        </Field>
      </div>

      <div className="space-y-2">
        <ToggleRow
          label="Active"
          desc="Apply this rule on new transactions & imports"
          checked={isActive}
          onChange={setIsActive}
        />
        <ToggleRow
          label="Stop after match"
          desc="Skip later rules once this one matches"
          checked={stopAfter}
          onChange={setStopAfter}
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-3 pt-1">
        <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" loading={pending}>
          {rule ? 'Save' : 'Create rule'}
        </Button>
      </div>
    </form>
  )
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string
  desc: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 text-left transition hover:bg-surface-muted"
      aria-pressed={checked}
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{desc}</span>
      </span>
      <span
        className={cn(
          'relative h-6 w-10 shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-border',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[1.125rem]' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  )
}
