import { useState } from 'react'
import { Pencil, Plus, Tag as TagIcon, Tags, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { CenterSpinner, EmptyState } from '@/components/ui/States'
import { PageHeader, Pill, ListCard, ListRow, IconChip } from '@/components/ui/list'
import { useConfirm } from '@/components/ui/confirm-context'
import { useDeleteTag, useTags } from '@/features/tags/api'
import { TagForm } from '@/features/tags/TagForm'
import type { Tag } from '@/types/db'

export function TagsPage() {
  const { data: tags, isLoading } = useTags()
  const del = useDeleteTag()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<Tag | null>(null)
  const [creating, setCreating] = useState(false)

  async function remove(t: Tag) {
    if (
      await confirm({
        title: `Delete "${t.name}"?`,
        message: "It will be removed from any transactions it's on.",
        tone: 'danger',
        confirmLabel: 'Delete',
      })
    )
      del.mutate(t.id)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Tags"
        action={
          (tags?.length ?? 0) > 0 ? (
            <Pill variant="tint" icon={Plus} onClick={() => setCreating(true)}>
              Add
            </Pill>
          ) : undefined
        }
      />

      {isLoading ? (
        <CenterSpinner />
      ) : (tags?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Tags className="h-8 w-8" />}
          title="No tags yet"
          description="Tags are free-form labels you can add to any transaction — like travel, work, or reimbursable."
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> New tag
            </Button>
          }
        />
      ) : (
        <ListCard>
          {tags!.map((t) => (
            <ListRow
              key={t.id}
              leading={<IconChip icon={TagIcon} color={t.color ?? '#64748b'} />}
              title={t.name}
              trailing={
                <div className="flex gap-1">
                  <button
                    onClick={() => setEditing(t)}
                    className="rounded-xl border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-border hover:bg-surface-muted hover:text-foreground"
                    aria-label={`Edit ${t.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => remove(t)}
                    className="rounded-xl border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-danger/10 hover:bg-danger/10 hover:text-danger"
                    aria-label={`Delete ${t.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              }
            />
          ))}
        </ListCard>
      )}

      <TagForm
        open={Boolean(editing) || creating}
        onClose={() => {
          setEditing(null)
          setCreating(false)
        }}
        tag={editing}
      />
    </div>
  )
}
