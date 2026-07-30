import { useMemo, useState } from 'react'
import { GripVertical, Pencil, Plus, Trash2, Wand2, Zap } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader, Pill } from '@/components/ui/list'
import { EmptyState, ListSkeleton } from '@/components/ui/States'
import { useConfirm } from '@/components/ui/confirm-context'
import { useT } from '@/features/settings/language-context'
import type { MsgKey } from '@/i18n'
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

const FIELD_KEYS: Record<RuleField, MsgKey> = {
  payee: 'rules.field.payee',
  note: 'rules.field.note',
  amount: 'rules.field.amount',
  type: 'rules.field.type',
}
const OP_KEYS: Record<RuleCondition['op'], MsgKey> = {
  contains: 'rules.op.contains',
  equals: 'rules.op.equals',
  starts_with: 'rules.op.startsWith',
  gt: 'rules.op.gt',
  lt: 'rules.op.lt',
}

export function RulesPage() {
  const { t } = useT()
  const { data: rules, isLoading } = useRules()
  const { data: categories = [] } = useCategories()
  const { data: tags = [] } = useTags()
  const update = useUpdateRule()
  const del = useDeleteRule()
  const reorder = useReorderRules()
  const apply = useApplyRulesToUncategorized()
  const confirm = useConfirm()

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
        ? t('rules.scannedNone', { scanned: res.scanned })
        : t('rules.scannedResult', {
            categorized: res.categorized,
            tagged: res.tagged,
            scanned: res.scanned,
          }),
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title={t('rules.title')}
        action={
          <Pill variant="tint" icon={Plus} onClick={() => setCreating(true)}>
            {t('rules.new')}
          </Pill>
        }
      />

      <p className="text-sm font-medium text-muted-foreground">
        {t('rules.subtitle')}
      </p>

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : ordered.length === 0 ? (
        <EmptyState
          icon={<Zap className="h-8 w-8" />}
          title={t('rules.emptyTitle')}
          description={t('rules.emptyDesc')}
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> {t('rules.new')}
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
                onDelete={async () => {
                  if (
                    await confirm({
                      title: t('rules.deleteTitle', { name: rule.name }),
                      tone: 'danger',
                      confirmLabel: t('common.delete'),
                    })
                  )
                    del.mutate(rule.id)
                }}
              />
            ))}
          </Card>

          <Card className="flex flex-wrap items-center justify-between gap-3 p-4 shadow-sm">
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">{t('rules.applyTitle')}</p>
              <p className="text-xs font-medium text-muted-foreground">
                {t('rules.applyDesc')}
              </p>
              {applyMsg && <p className="mt-1 text-xs font-semibold text-primary">{applyMsg}</p>}
            </div>
            <Button variant="secondary" onClick={runApply} loading={apply.isPending}>
              <Wand2 className="h-4 w-4" /> {t('rules.runNow')}
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
  const { t } = useT()
  const joiner = rule.match_type === 'all' ? ' AND ' : ' OR '
  const condText = rule.conditions
    .map(
      (c) =>
        `${t(FIELD_KEYS[c.field])} ${t(OP_KEYS[c.op])} ${c.field === 'amount' ? c.value : `“${c.value}”`}`,
    )
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
          {t('rules.ifCond', { cond: condText || '…' })}
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
          {ruleTags.map((tItem) => (
            <TagChip key={tItem.id} tag={tItem} />
          ))}
          {!cat && ruleTags.length === 0 && (
            <span className="text-xs font-medium text-muted-foreground">{t('rules.noAction')}</span>
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
          aria-label={`${t('common.edit')} ${rule.name}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="rounded-xl p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
          aria-label={`${t('common.delete')} ${rule.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
