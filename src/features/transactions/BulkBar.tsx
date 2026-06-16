import { useState } from 'react'
import { Tag as TagIcon, Trash2, X, FolderTree, CircleCheck } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import { useConfirm } from '@/components/ui/confirm-context'
import { useCategories } from '@/features/categories/api'
import { flattenWithDepth } from '@/features/categories/tree'
import { useTags, useBulkAddTags } from '@/features/tags/api'
import { TagPicker } from '@/features/tags/TagPicker'
import { STATUS_OPTIONS } from './filters'
import { useBulkDeleteTransactions, useBulkSetCategory, useBulkSetStatus } from './api'
import type { Transaction, TransactionStatus } from '@/types/db'

interface Props {
  selected: Transaction[]
  onClear: () => void
}

/** Floating action bar shown while transactions are multi-selected. */
export function BulkBar({ selected, onClear }: Props) {
  const { data: categories = [] } = useCategories()
  const { data: tags = [] } = useTags()
  const bulkDelete = useBulkDeleteTransactions()
  const bulkCategory = useBulkSetCategory()
  const bulkTags = useBulkAddTags()
  const bulkStatus = useBulkSetStatus()
  const confirm = useConfirm()

  const [mode, setMode] = useState<'category' | 'tag' | 'status' | null>(null)
  const [categoryId, setCategoryId] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])
  const [status, setStatus] = useState<TransactionStatus>('cleared')

  const ids = selected.map((t) => t.id)
  // Transfers have no category, so recategorize skips them.
  const categorizableIds = selected.filter((t) => t.type !== 'transfer').map((t) => t.id)
  const categoryOptions = flattenWithDepth(categories.filter((c) => !c.is_archived))

  function close() {
    setMode(null)
    setCategoryId('')
    setTagIds([])
    setStatus('cleared')
  }

  async function handleDelete() {
    const n = ids.length
    if (
      await confirm({
        title: `Delete ${n} transaction${n === 1 ? '' : 's'}?`,
        message: 'This permanently removes the selected entries.',
        tone: 'danger',
        confirmLabel: 'Delete',
      })
    ) {
      bulkDelete.mutate(ids, { onSuccess: onClear })
    }
  }

  function applyCategory() {
    bulkCategory.mutate(
      { ids: categorizableIds, categoryId: categoryId || null },
      {
        onSuccess: () => {
          close()
          onClear()
        },
      },
    )
  }

  function applyTags() {
    bulkTags.mutate(
      { txIds: ids, tagIds },
      {
        onSuccess: () => {
          close()
          onClear()
        },
      },
    )
  }

  function applyStatus() {
    bulkStatus.mutate(
      { ids, status },
      {
        onSuccess: () => {
          close()
          onClear()
        },
      },
    )
  }

  return (
    <>
      <div className="fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 sm:bottom-6">
        <div className="glass-nav flex items-center gap-1 rounded-2xl border border-border/80 p-1.5 shadow-lg">
          <button
            onClick={onClear}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-surface-muted hover:text-foreground"
            aria-label="Clear selection"
          >
            <X className="h-5 w-5" />
          </button>
          <span className="px-2 font-numeric text-sm font-bold text-foreground">{ids.length}</span>
          <BarButton icon={<FolderTree className="h-4 w-4" />} label="Category" onClick={() => setMode('category')} />
          <BarButton icon={<TagIcon className="h-4 w-4" />} label="Tag" onClick={() => setMode('tag')} />
          <BarButton icon={<CircleCheck className="h-4 w-4" />} label="Status" onClick={() => setMode('status')} />
          <BarButton
            icon={<Trash2 className="h-4 w-4" />}
            label="Delete"
            onClick={handleDelete}
            danger
          />
        </div>
      </div>

      <Modal open={mode === 'category'} onClose={close} title="Set category">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Apply to {categorizableIds.length} transaction{categorizableIds.length === 1 ? '' : 's'}.
            {categorizableIds.length !== ids.length && ' Transfers are skipped.'}
          </p>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Uncategorized</option>
            {categoryOptions.map(({ category, depth }) => (
              <option key={category.id} value={category.id}>
                {depth ? '  — ' : ''}
                {category.name}
              </option>
            ))}
          </Select>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={close}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              loading={bulkCategory.isPending}
              disabled={categorizableIds.length === 0}
              onClick={applyCategory}
            >
              Apply
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={mode === 'status'} onClose={close} title="Set status">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Mark {ids.length} transaction{ids.length === 1 ? '' : 's'} as:
          </p>
          <Select value={status} onChange={(e) => setStatus(e.target.value as TransactionStatus)}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={close}>
              Cancel
            </Button>
            <Button className="flex-1" loading={bulkStatus.isPending} onClick={applyStatus}>
              Apply
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={mode === 'tag'} onClose={close} title="Add tags">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Add to {ids.length} transaction{ids.length === 1 ? '' : 's'}.
          </p>
          {tags.length === 0 ? (
            <p className="text-sm text-muted-foreground">Create some tags first.</p>
          ) : (
            <TagPicker selected={tagIds} onChange={setTagIds} />
          )}
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={close}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              loading={bulkTags.isPending}
              disabled={tagIds.length === 0}
              onClick={applyTags}
            >
              Add
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

function BarButton({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={
        'flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition ' +
        (danger
          ? 'text-danger hover:bg-danger/10'
          : 'text-foreground hover:bg-surface-muted')
      }
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
