import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, GripVertical, Pencil, Plus, Trash2, Wand2, Zap } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { CenterSpinner, EmptyState } from '@/components/ui/States'
import { CategoryIcon } from '@/features/categories/CategoryIcon'
import { TagChip } from '@/features/tags/TagChip'
import { useCategories } from '@/features/categories/api'
import { useTags } from '@/features/tags/api'
import {
  useApplyRulesToUncategorized,
  useDeleteRule,
  useReorderRules,
  useRules,
  useUpdateRule,
} from '@/features/rules/api'
import { RuleForm } from '@/features/rules/RuleForm'
import { indexById } from '@/lib/collections'
import { cn } from '@/lib/utils'
import type { Category, Rule, RuleCondition, RuleField, Tag } from '@/types/db'

const FIELD_LABELS: Record<RuleField, string> = {
  payee: 'Payee',
  note: 'Note',
  amount: 'Amount',
  type: 'Type',
}
const OP_LABELS: Record<RuleCondition['op'], string> = {
  contains: 'contains',
  equals: 'is',
  starts_with: 'starts with',
  gt: '>',
  lt: '<',
}

export function RulesPage() {
  const { data: rules, isLoading } = useRules()
  const { data: categories = [] } = useCategories()
  const { data: tags = [] } = useTags()
  const update = useUpdateRule()
  const del = useDeleteRule()
  const reorder = useReorderRules()
  const apply = useApplyRulesToUncategorized()

  const [editing, setEditing] = useState<Rule | null>(null)
  const [creating, setCreating] = useState(false)
  const [applyMsg, setApplyMsg] = useState<string | null>(null)

  const categoryMap = useMemo(() => indexById(categories), [categories])
  const tagMap = useMemo(() => indexById(tags), [tags])

  // dragOrder holds a live ordering only while dragging; otherwise we render the
  // server order directly (no prop→state effect needed).
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOrder, setDragOrder] = useState<string[] | null>(null)

  const byId = useMemo(() => new Map((rules ?? []).map((r) => [r.id, r])), [rules])
  const serverIds = (rules ?? []).map((r) => r.id)
  const order = dragOrder ?? serverIds
  const ordered = order.map((id) => byId.get(id)).filter((r): r is Rule => !!r)

  function handleDragOver(e: React.DragEvent, overId: string) {
    if (!dragId || dragId === overId) return
    e.preventDefault()
    setDragOrder((cur) => {
      const base = cur ?? serverIds
      const from = base.indexOf(dragId)
      const to = base.indexOf(overId)
      if (from === -1 || to === -1 || from === to) return base
      const next = [...base]
      next.splice(to, 0, next.splice(from, 1)[0])
      return next
    })
  }
  function handleDrop() {
    if (dragOrder) reorder.mutate(dragOrder)
    setDragId(null)
    setDragOrder(null)
  }

  async function runApply() {
    setApplyMsg(null)
    const res = await apply.mutateAsync(rules ?? [])
    setApplyMsg(
      res.categorized === 0 && res.tagged === 0
        ? `Scanned ${res.scanned} uncategorized — nothing matched.`
        : `Categorized ${res.categorized} and tagged ${res.tagged} of ${res.scanned} uncategorized.`,
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3 py-1">
        <Link
          to="/settings"
          className="rounded-xl p-2 text-muted-foreground hover:bg-surface-muted hover:text-foreground transition-all border border-transparent hover:border-border"
          aria-label="Back to settings"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Rules</h1>
        <Button size="sm" className="ml-auto rounded-xl" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New rule
        </Button>
      </div>

      <p className="text-sm font-medium text-muted-foreground">
        Auto-categorize and tag transactions as you add or import them. Rules run top to bottom.
      </p>

      {isLoading ? (
        <CenterSpinner />
      ) : ordered.length === 0 ? (
        <EmptyState
          icon={<Zap className="h-8 w-8" />}
          title="No rules yet"
          description="Create a rule like “if payee contains GoFood → category Food, tag delivery”."
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> New rule
            </Button>
          }
        />
      ) : (
        <>
          <Card className="divide-y divide-border/60 py-1 px-4 shadow-sm">
            {ordered.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                categoryMap={categoryMap}
                tagMap={tagMap}
                dragging={dragId === rule.id}
                onDragStart={() => setDragId(rule.id)}
                onDragOver={(e) => handleDragOver(e, rule.id)}
                onDrop={handleDrop}
                onToggle={() => update.mutate({ id: rule.id, patch: { is_active: !rule.is_active } })}
                onEdit={() => setEditing(rule)}
                onDelete={() => {
                  if (confirm(`Delete rule "${rule.name}"?`)) del.mutate(rule.id)
                }}
              />
            ))}
          </Card>

          <Card className="flex flex-wrap items-center justify-between gap-3 p-4 shadow-sm">
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">Apply to existing</p>
              <p className="text-xs font-medium text-muted-foreground">
                Run active rules over uncategorized income & expenses.
              </p>
              {applyMsg && <p className="mt-1 text-xs font-semibold text-primary">{applyMsg}</p>}
            </div>
            <Button variant="secondary" onClick={runApply} loading={apply.isPending}>
              <Wand2 className="h-4 w-4" /> Run now
            </Button>
          </Card>
        </>
      )}

      <RuleForm
        open={creating || Boolean(editing)}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        rule={editing}
      />
    </div>
  )
}

function RuleRow({
  rule,
  categoryMap,
  tagMap,
  dragging,
  onDragStart,
  onDragOver,
  onDrop,
  onToggle,
  onEdit,
  onDelete,
}: {
  rule: Rule
  categoryMap: Record<string, Category>
  tagMap: Record<string, Tag>
  dragging: boolean
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: () => void
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const joiner = rule.match_type === 'all' ? ' and ' : ' or '
  const condText = rule.conditions
    .map((c) => `${FIELD_LABELS[c.field]} ${OP_LABELS[c.op]} ${c.field === 'amount' ? c.value : `“${c.value}”`}`)
    .join(joiner)
  const cat = rule.actions?.category_id ? categoryMap[rule.actions.category_id] : undefined
  const ruleTags = (rule.actions?.tag_ids ?? []).map((id) => tagMap[id]).filter(Boolean) as Tag[]

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDrop}
      className={cn(
        'group flex items-start gap-2 py-3',
        dragging && 'opacity-50',
        !rule.is_active && 'opacity-60',
      )}
    >
      <GripVertical className="mt-1 h-4 w-4 shrink-0 cursor-grab text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-bold text-foreground">{rule.name}</p>
          {rule.stop_after && (
            <span className="rounded bg-surface-muted px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              stop
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">
          If {condText || '…'}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {cat && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
              style={{ backgroundColor: `${cat.color ?? '#64748b'}20`, color: cat.color ?? '#64748b' }}
            >
              <CategoryIcon name={cat.icon} className="h-3 w-3" />
              {cat.name}
            </span>
          )}
          {ruleTags.map((t) => (
            <TagChip key={t.id} tag={t} />
          ))}
          {!cat && ruleTags.length === 0 && (
            <span className="text-xs font-medium text-muted-foreground">No action set</span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={onToggle}
          className={cn(
            'relative h-5 w-9 rounded-full transition-colors',
            rule.is_active ? 'bg-primary' : 'bg-border',
          )}
          aria-label={rule.is_active ? 'Disable rule' : 'Enable rule'}
          aria-pressed={rule.is_active}
        >
          <span
            className={cn(
              'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
              rule.is_active ? 'translate-x-[1.125rem]' : 'translate-x-0.5',
            )}
          />
        </button>
        <button
          onClick={onEdit}
          className="rounded-xl p-1.5 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
          aria-label={`Edit ${rule.name}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="rounded-xl p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
          aria-label={`Delete ${rule.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
