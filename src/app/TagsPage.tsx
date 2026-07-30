import { useState } from 'react'
import { Pencil, Plus, Tag as TagIcon, Tags, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState, ListSkeleton } from '@/components/ui/States'
import { PageHeader, Pill, ListCard, ListRow, IconChip } from '@/components/ui/list'
import { useConfirm } from '@/components/ui/confirm-context'
import { useT } from '@/features/settings/language-context'
import { useDeleteTag, useTags } from '@/features/tags/api'
import { TagForm } from '@/features/tags/TagForm'
import type { Tag } from '@/types/db'

export function TagsPage() {
  const { t } = useT()
  const { data: tags, isLoading } = useTags()
  const del = useDeleteTag()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<Tag | null>(null)
  const [creating, setCreating] = useState(false)

  async function remove(tagItem: Tag) {
    if (
      await confirm({
        title: t('tags.deleteTitle', { name: tagItem.name }),
        message: t('tags.deleteMsg'),
        tone: 'danger',
        confirmLabel: t('common.delete'),
      })
    )
      del.mutate(tagItem.id)
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title={t('tags.title')}
        action={
          (tags?.length ?? 0) > 0 ? (
            <Pill variant="tint" icon={Plus} onClick={() => setCreating(true)}>
              {t('tags.add')}
            </Pill>
          ) : undefined
        }
      />

      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : (tags?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Tags className="h-8 w-8" />}
          title={t('tags.emptyTitle')}
          description={t('tags.emptyDesc')}
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> {t('tags.new')}
            </Button>
          }
        />
      ) : (
        <ListCard>
          {tags!.map((tagItem) => (
            <ListRow
              key={tagItem.id}
              leading={<IconChip icon={TagIcon} color={tagItem.color ?? '#64748b'} />}
              title={tagItem.name}
              trailing={
                <div className="flex gap-1">
                  <button
                    onClick={() => setEditing(tagItem)}
                    className="rounded-xl border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-border hover:bg-surface-muted hover:text-foreground"
                    aria-label={`${t('common.edit')} ${tagItem.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => remove(tagItem)}
                    className="rounded-xl border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-danger/10 hover:bg-danger/10 hover:text-danger"
                    aria-label={`${t('common.delete')} ${tagItem.name}`}
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
