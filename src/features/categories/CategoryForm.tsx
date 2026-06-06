import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { ACCOUNT_COLORS } from '@/features/accounts/meta'
import { useCategories, useCreateCategory, useUpdateCategory } from './api'
import { CATEGORY_ICONS } from './icons'
import type { Category, CategoryKind } from '@/types/db'

interface Props {
  open: boolean
  onClose: () => void
  category?: Category | null
  defaultKind?: CategoryKind
}

export function CategoryForm({ open, onClose, category, defaultKind }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={category ? 'Edit category' : 'New category'}>
      {open && (
        <CategoryFormBody
          onClose={onClose}
          category={category ?? null}
          defaultKind={defaultKind ?? 'expense'}
        />
      )}
    </Modal>
  )
}

function CategoryFormBody({
  onClose,
  category,
  defaultKind,
}: {
  onClose: () => void
  category: Category | null
  defaultKind: CategoryKind
}) {
  const create = useCreateCategory()
  const update = useUpdateCategory()
  const { data: categories = [] } = useCategories()
  const editing = Boolean(category)

  const [name, setName] = useState(category?.name ?? '')
  const [kind, setKind] = useState<CategoryKind>(category?.kind ?? defaultKind)
  const [color, setColor] = useState(category?.color ?? ACCOUNT_COLORS[0])
  const [icon, setIcon] = useState(category?.icon ?? '')
  const [parentId, setParentId] = useState(category?.parent_id ?? '')
  const [error, setError] = useState<string | null>(null)

  const pending = create.isPending || update.isPending

  // A category that already has children can't itself be nested (keep one level).
  const hasChildren = useMemo(
    () => categories.some((c) => c.parent_id === category?.id),
    [categories, category?.id],
  )
  // Valid parents: same-kind top-level categories, excluding self.
  const parentOptions = useMemo(
    () =>
      categories.filter(
        (c) => !c.is_archived && c.kind === kind && c.parent_id === null && c.id !== category?.id,
      ),
    [categories, kind, category?.id],
  )

  function changeKind(next: CategoryKind) {
    setKind(next)
    setParentId('') // parents are kind-specific, so a kind switch invalidates it
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Please name this category.')
      return
    }
    const patch = {
      name: name.trim(),
      kind,
      color,
      icon: icon || null,
      parent_id: hasChildren ? null : parentId || null,
    }
    try {
      if (category) {
        await update.mutateAsync({ id: category.id, patch })
      } else {
        await create.mutateAsync(patch)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Name">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Coffee, Rent, Freelance"
          autoFocus
        />
      </Field>

      <Field label="Type">
        <Select value={kind} onChange={(e) => changeKind(e.target.value as CategoryKind)}>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </Select>
      </Field>

      {!hasChildren && parentOptions.length > 0 && (
        <Field label="Parent category">
          <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">None (top level)</option>
            {parentOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Icon">
        <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-xl border border-border p-2">
          {CATEGORY_ICONS.map(({ name: iconName, Icon }) => {
            const active = icon === iconName
            return (
              <button
                type="button"
                key={iconName}
                onClick={() => setIcon(active ? '' : iconName)}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg border transition',
                  active
                    ? 'border-transparent text-white'
                    : 'border-border text-muted-foreground hover:bg-surface-muted',
                )}
                style={active ? { backgroundColor: color } : undefined}
                aria-label={iconName}
                aria-pressed={active}
              >
                <Icon className="h-4 w-4" />
              </button>
            )
          })}
        </div>
      </Field>

      <Field label="Color">
        <div className="flex flex-wrap gap-2">
          {ACCOUNT_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setColor(c)}
              className="h-8 w-8 rounded-full border-2 transition"
              style={{
                backgroundColor: c,
                borderColor: color === c ? 'var(--foreground)' : 'transparent',
              }}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
      </Field>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" loading={pending}>
          {editing ? 'Save' : 'Create'}
        </Button>
      </div>
    </form>
  )
}
