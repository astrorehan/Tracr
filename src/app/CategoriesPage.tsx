import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  GitMerge,
  GripVertical,
  Pencil,
  Plus,
  Tag,
  Trash2,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Field, Select } from '@/components/ui/Input'
import { CenterSpinner, EmptyState } from '@/components/ui/States'
import { useConfirm } from '@/components/ui/confirm-context'
import {
  useCategories,
  useDeleteCategory,
  useMergeCategories,
  useReorderCategories,
  useSetCategoryArchived,
} from '@/features/categories/api'
import { CategoryForm } from '@/features/categories/CategoryForm'
import { CategoryIcon } from '@/features/categories/CategoryIcon'
import { groupByParent } from '@/features/categories/tree'
import { cn } from '@/lib/utils'
import type { Category, CategoryKind } from '@/types/db'

export function CategoriesPage() {
  const { data: categories, isLoading } = useCategories()
  const del = useDeleteCategory()
  const setArchived = useSetCategoryArchived()
  const reorder = useReorderCategories()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<Category | null>(null)
  const [creatingKind, setCreatingKind] = useState<CategoryKind | null>(null)
  const [merging, setMerging] = useState<Category | null>(null)

  const { activeByKind, archived } = useMemo(() => {
    const active: Record<CategoryKind, Category[]> = { income: [], expense: [] }
    const archived: Category[] = []
    for (const c of categories ?? []) {
      if (c.is_archived) archived.push(c)
      else active[c.kind].push(c)
    }
    return { activeByKind: active, archived }
  }, [categories])

  async function remove(c: Category) {
    if (
      await confirm({
        title: `Delete "${c.name}"?`,
        message: 'Existing transactions stay but become uncategorized.',
        tone: 'danger',
        confirmLabel: 'Delete',
      })
    )
      del.mutate(c.id)
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
        <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Categories</h1>
      </div>

      {isLoading ? (
        <CenterSpinner />
      ) : (categories?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Tag className="h-8 w-8" />}
          title="No categories yet"
          description="Create categories to organize your spending and income."
          action={
            <Button size="sm" onClick={() => setCreatingKind('expense')}>
              <Plus className="h-4 w-4" /> New category
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          <CategoryGroup
            title="Expense"
            items={activeByKind.expense}
            onAdd={() => setCreatingKind('expense')}
            onEdit={setEditing}
            onDelete={remove}
            onArchive={(c) => setArchived.mutate({ id: c.id, archived: true })}
            onMerge={setMerging}
            onReorder={(ids) => reorder.mutate(ids)}
          />
          <CategoryGroup
            title="Income"
            items={activeByKind.income}
            onAdd={() => setCreatingKind('income')}
            onEdit={setEditing}
            onDelete={remove}
            onArchive={(c) => setArchived.mutate({ id: c.id, archived: true })}
            onMerge={setMerging}
            onReorder={(ids) => reorder.mutate(ids)}
          />

          {archived.length > 0 && (
            <ArchivedSection
              items={archived}
              onRestore={(c) => setArchived.mutate({ id: c.id, archived: false })}
              onDelete={remove}
            />
          )}
        </div>
      )}

      <CategoryForm
        open={Boolean(editing) || Boolean(creatingKind)}
        onClose={() => {
          setEditing(null)
          setCreatingKind(null)
        }}
        category={editing}
        defaultKind={creatingKind ?? 'expense'}
      />

      <MergeModal
        key={merging?.id ?? 'none'}
        source={merging}
        categories={categories ?? []}
        onClose={() => setMerging(null)}
      />
    </div>
  )
}

interface RowActions {
  onEdit: (c: Category) => void
  onDelete: (c: Category) => void
  onArchive: (c: Category) => void
  onMerge: (c: Category) => void
}

function CategoryGroup({
  title,
  items,
  onAdd,
  onReorder,
  ...actions
}: {
  title: string
  items: Category[]
  onAdd: () => void
  onReorder: (orderedIds: string[]) => void
} & RowActions) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="section-head text-[17px] text-foreground">{title}</h2>
        <Button variant="ghost" size="sm" onClick={onAdd} className="h-8 rounded-xl">
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>
      {items.length === 0 ? (
        <Card className="text-sm font-semibold text-muted-foreground p-5 text-center bg-surface-muted/30">
          No {title.toLowerCase()} categories yet.
        </Card>
      ) : (
        <Card className="divide-y divide-border/60 py-1 px-4 shadow-sm">
          <SortableRows items={items} onReorder={onReorder} {...actions} />
        </Card>
      )}
    </div>
  )
}

/** Drag handle + scope tag used while dragging to constrain drops to siblings. */
interface DragState {
  id: string
  scope: string
}

/**
 * Native-DnD sortable rendering of a category group: top-level rows, each
 * followed by its indented children. Reordering is constrained to a sibling
 * group (top-level of this kind, or the children of one parent).
 */
function SortableRows({
  items,
  onReorder,
  ...actions
}: {
  items: Category[]
  onReorder: (orderedIds: string[]) => void
} & RowActions) {
  // dragOrder holds a live ordering only while dragging; otherwise the data order
  // is rendered directly (no prop→state effect needed).
  const [drag, setDrag] = useState<DragState | null>(null)
  const [dragOrder, setDragOrder] = useState<string[] | null>(null)

  const byId = useMemo(() => new Map(items.map((c) => [c.id, c])), [items])
  const scopeOf = (c: Category) => c.parent_id ?? `top:${c.kind}`
  const baseIds = items.map((c) => c.id)
  const order = dragOrder ?? baseIds

  const nodes = useMemo(() => {
    const ordered = order.map((id) => byId.get(id)).filter(Boolean) as Category[]
    return groupByParent(ordered)
  }, [order, byId])

  function handleDragStart(c: Category) {
    setDrag({ id: c.id, scope: scopeOf(c) })
  }

  function handleDragOver(e: React.DragEvent, over: Category) {
    if (!drag || drag.id === over.id) return
    if (scopeOf(over) !== drag.scope) return // only reorder within siblings
    e.preventDefault()
    setDragOrder((cur) => {
      const base = cur ?? baseIds
      const from = base.indexOf(drag.id)
      const to = base.indexOf(over.id)
      if (from === -1 || to === -1 || from === to) return base
      const next = [...base]
      next.splice(to, 0, next.splice(from, 1)[0])
      return next
    })
  }

  function handleDrop() {
    if (!drag) return
    // Persist the new order of just the dragged item's sibling group.
    const siblings = order
      .map((id) => byId.get(id))
      .filter((c): c is Category => !!c && scopeOf(c) === drag.scope)
      .map((c) => c.id)
    onReorder(siblings)
    setDrag(null)
    setDragOrder(null)
  }

  return (
    <>
      {nodes.map((node) => (
        <Fragment key={node.category.id}>
          <CategoryRow
            c={node.category}
            dragging={drag?.id === node.category.id}
            onDragStart={() => handleDragStart(node.category)}
            onDragOver={(e) => handleDragOver(e, node.category)}
            onDrop={handleDrop}
            {...actions}
          />
          {node.children.map((child) => (
            <CategoryRow
              key={child.id}
              c={child}
              child
              dragging={drag?.id === child.id}
              onDragStart={() => handleDragStart(child)}
              onDragOver={(e) => handleDragOver(e, child)}
              onDrop={handleDrop}
              {...actions}
            />
          ))}
        </Fragment>
      ))}
    </>
  )
}

function CategoryRow({
  c,
  child,
  dragging,
  onEdit,
  onDelete,
  onArchive,
  onMerge,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  c: Category
  child?: boolean
  dragging?: boolean
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: () => void
} & RowActions) {
  const color = c.color ?? '#64748b'
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDrop}
      className={cn(
        'flex items-center gap-2 py-3 group',
        dragging && 'opacity-50',
        child &&
          'pl-8 relative before:absolute before:left-3.5 before:top-0 before:h-1/2 before:w-3 before:border-l-2 before:border-b-2 before:border-border/60 before:rounded-bl-lg',
      )}
    >
      <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-inner font-semibold transition-transform duration-300 group-hover:scale-105"
        style={{ backgroundColor: `${color}15`, color }}
      >
        <CategoryIcon name={c.icon} className={child ? 'h-4 w-4' : 'h-4.5 w-4.5'} />
      </span>
      <span className="flex-1 truncate text-sm font-bold text-foreground">{c.name}</span>
      <div className="flex gap-1">
        <IconButton label={`Merge ${c.name}`} onClick={() => onMerge(c)}>
          <GitMerge className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton label={`Edit ${c.name}`} onClick={() => onEdit(c)}>
          <Pencil className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton label={`Archive ${c.name}`} onClick={() => onArchive(c)}>
          <Archive className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton label={`Delete ${c.name}`} danger onClick={() => onDelete(c)}>
          <Trash2 className="h-3.5 w-3.5" />
        </IconButton>
      </div>
    </div>
  )
}

function IconButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string
  danger?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-xl p-1.5 text-muted-foreground transition-colors border border-transparent',
        danger
          ? 'hover:text-danger hover:bg-danger/10 hover:border-danger/10'
          : 'hover:text-foreground hover:bg-surface-muted hover:border-border',
      )}
      aria-label={label}
    >
      {children}
    </button>
  )
}

function ArchivedSection({
  items,
  onRestore,
  onDelete,
}: {
  items: Category[]
  onRestore: (c: Category) => void
  onDelete: (c: Category) => void
}) {
  return (
    <div className="space-y-2">
      <h2 className="section-head px-1 text-[17px] text-foreground">Archived</h2>
      <Card className="divide-y divide-border/60 py-1 px-4 shadow-sm">
        {items.map((c) => {
          const color = c.color ?? '#64748b'
          return (
            <div key={c.id} className="flex items-center gap-3 py-3 group">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl opacity-60"
                style={{ backgroundColor: `${color}15`, color }}
              >
                <CategoryIcon name={c.icon} className="h-4 w-4" />
              </span>
              <span className="flex-1 truncate text-sm font-semibold text-muted-foreground">
                {c.name}
                <span className="ml-2 text-xs font-bold uppercase tracking-wide text-muted-foreground/60">
                  {c.kind}
                </span>
              </span>
              <div className="flex gap-1">
                <IconButton label={`Restore ${c.name}`} onClick={() => onRestore(c)}>
                  <ArchiveRestore className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton label={`Delete ${c.name}`} danger onClick={() => onDelete(c)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
              </div>
            </div>
          )
        })}
      </Card>
    </div>
  )
}

function MergeModal({
  source,
  categories,
  onClose,
}: {
  source: Category | null
  categories: Category[]
  onClose: () => void
}) {
  const merge = useMergeCategories()
  // Parent remounts this via key={source.id}, so fresh state per source.
  const [targetId, setTargetId] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Valid targets: same kind, active, not the source and not one of its children.
  const targets = useMemo(() => {
    if (!source) return []
    return categories.filter(
      (c) =>
        c.kind === source.kind &&
        !c.is_archived &&
        c.id !== source.id &&
        c.parent_id !== source.id,
    )
  }, [categories, source])

  async function handleMerge() {
    if (!source) return
    const target = targets.find((c) => c.id === targetId)
    if (!target) {
      setError('Pick a category to merge into.')
      return
    }
    try {
      await merge.mutateAsync({ source, target })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not merge.')
    }
  }

  return (
    <Modal open={Boolean(source)} onClose={onClose} title="Merge category">
      {source && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Move every transaction, split and bill from{' '}
            <span className="font-semibold text-foreground">{source.name}</span> into another
            category, then delete it. Any subcategories move too. This can’t be undone.
          </p>
          {targets.length === 0 ? (
            <p className="rounded-xl bg-surface-muted/60 p-3 text-sm font-medium text-muted-foreground">
              No other {source.kind} category to merge into. Create one first.
            </p>
          ) : (
            <Field label={`Merge "${source.name}" into`}>
              <Select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                <option value="">Select a category…</option>
                {targets.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.parent_id ? '— ' : ''}
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1"
              loading={merge.isPending}
              disabled={!targetId || targets.length === 0}
              onClick={handleMerge}
            >
              Merge
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
