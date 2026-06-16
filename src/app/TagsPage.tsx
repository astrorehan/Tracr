import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { CenterSpinner, EmptyState } from '@/components/ui/States'
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
      <div className="flex items-center gap-3 py-1">
        <Link
          to="/settings"
          className="rounded-xl p-2 text-muted-foreground hover:bg-surface-muted hover:text-foreground transition-all border border-transparent hover:border-border"
          aria-label="Back to settings"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-2xl font-extrabold tracking-tight lg:text-3xl">Tags</h1>
        {(tags?.length ?? 0) > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setCreating(true)} className="h-8 rounded-xl">
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        )}
      </div>

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
        <Card className="divide-y divide-border/60 py-1 px-4 shadow-sm">
          {tags!.map((t) => (
            <div key={t.id} className="flex items-center gap-3.5 py-3 group">
              <span
                className="h-4.5 w-4.5 shrink-0 rounded-lg shadow-sm border border-black/5"
                style={{ backgroundColor: t.color ?? '#64748b' }}
              />
              <span className="flex-1 truncate text-sm font-bold text-foreground">{t.name}</span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setEditing(t)}
                  className="rounded-xl p-1.5 text-muted-foreground hover:text-foreground hover:bg-surface-muted transition-colors border border-transparent hover:border-border"
                  aria-label={`Edit ${t.name}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => remove(t)}
                  className="rounded-xl p-1.5 text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors border border-transparent hover:border-danger/10"
                  aria-label={`Delete ${t.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </Card>
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
