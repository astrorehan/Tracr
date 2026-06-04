import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Pencil, Plus, Tag, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { CenterSpinner, EmptyState } from '@/components/ui/States'
import { useCategories, useDeleteCategory } from '@/features/categories/api'
import { CategoryForm } from '@/features/categories/CategoryForm'
import { CategoryIcon } from '@/features/categories/CategoryIcon'
import { groupByParent } from '@/features/categories/tree'
import { cn } from '@/lib/utils'
import type { Category, CategoryKind } from '@/types/db'

export function CategoriesPage() {
  const { data: categories, isLoading } = useCategories()
  const del = useDeleteCategory()
  const [editing, setEditing] = useState<Category | null>(null)
  const [creatingKind, setCreatingKind] = useState<CategoryKind | null>(null)

  const { income, expense } = useMemo(() => {
    const income: Category[] = []
    const expense: Category[] = []
    for (const c of categories ?? []) (c.kind === 'income' ? income : expense).push(c)
    return { income, expense }
  }, [categories])

  function remove(c: Category) {
    if (confirm(`Delete "${c.name}"? Existing transactions stay but become uncategorized.`))
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
            items={expense}
            onAdd={() => setCreatingKind('expense')}
            onEdit={setEditing}
            onDelete={remove}
          />
          <CategoryGroup
            title="Income"
            items={income}
            onAdd={() => setCreatingKind('income')}
            onEdit={setEditing}
            onDelete={remove}
          />
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
    </div>
  )
}

function CategoryGroup({
  title,
  items,
  onAdd,
  onEdit,
  onDelete,
}: {
  title: string
  items: Category[]
  onAdd: () => void
  onEdit: (c: Category) => void
  onDelete: (c: Category) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{title}</p>
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
          {groupByParent(items).map((node) => (
            <Fragment key={node.category.id}>
              <CategoryRow c={node.category} onEdit={onEdit} onDelete={onDelete} />
              {node.children.map((child) => (
                <CategoryRow key={child.id} c={child} child onEdit={onEdit} onDelete={onDelete} />
              ))}
            </Fragment>
          ))}
        </Card>
      )}
    </div>
  )
}

function CategoryRow({
  c,
  child,
  onEdit,
  onDelete,
}: {
  c: Category
  child?: boolean
  onEdit: (c: Category) => void
  onDelete: (c: Category) => void
}) {
  const color = c.color ?? '#64748b'
  return (
    <div className={cn('flex items-center gap-3.5 py-3 group', child && 'pl-8 relative before:absolute before:left-3.5 before:top-0 before:h-1/2 before:w-3 before:border-l-2 before:border-b-2 before:border-border/60 before:rounded-bl-lg')}>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-inner font-semibold transition-transform duration-300 group-hover:scale-105"
        style={{ backgroundColor: `${color}15`, color }}
      >
        <CategoryIcon name={c.icon} className={child ? 'h-4 w-4' : 'h-4.5 w-4.5'} />
      </span>
      <span className="flex-1 truncate text-sm font-bold text-foreground">{c.name}</span>
      <div className="flex gap-1.5">
        <button
          onClick={() => onEdit(c)}
          className="rounded-xl p-1.5 text-muted-foreground hover:text-foreground hover:bg-surface-muted transition-colors border border-transparent hover:border-border"
          aria-label={`Edit ${c.name}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onDelete(c)}
          className="rounded-xl p-1.5 text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors border border-transparent hover:border-danger/10"
          aria-label={`Delete ${c.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
