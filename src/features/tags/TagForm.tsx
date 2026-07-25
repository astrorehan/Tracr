import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { ACCOUNT_COLORS } from '@/features/accounts/meta'
import { useT } from '@/features/settings/language-context'
import { useCreateTag, useUpdateTag } from './api'
import type { Tag } from '@/types/db'

interface Props {
  open: boolean
  onClose: () => void
  tag?: Tag | null
}

export function TagForm({ open, onClose, tag }: Props) {
  const { t } = useT()
  return (
    <Modal open={open} onClose={onClose} title={t(tag ? 'tags.editTitle' : 'tags.newTitle')}>
      {open && <TagFormBody onClose={onClose} tag={tag ?? null} />}
    </Modal>
  )
}

function TagFormBody({ onClose, tag }: { onClose: () => void; tag: Tag | null }) {
  const { t } = useT()
  const create = useCreateTag()
  const update = useUpdateTag()
  const editing = Boolean(tag)

  const [name, setName] = useState(tag?.name ?? '')
  const [color, setColor] = useState(tag?.color ?? ACCOUNT_COLORS[0])
  const [error, setError] = useState<string | null>(null)

  const pending = create.isPending || update.isPending

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError(t('tags.errNoName'))
      return
    }
    try {
      if (tag) {
        await update.mutateAsync({ id: tag.id, patch: { name: name.trim(), color } })
      } else {
        await create.mutateAsync({ name: name.trim(), color })
      }
      onClose()
    } catch (err) {
      // 23505 = unique violation on (user_id, lower(name)).
      const message =
        err instanceof Error && err.message.includes('duplicate')
          ? t('tags.errDuplicate')
          : err instanceof Error
            ? err.message
            : t('acc.form.errGeneric')
      setError(message)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label={t('tags.nameLabel')}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('tags.namePlaceholder')}
          autoFocus
        />
      </Field>

      <Field label={t('tags.colorLabel')}>
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
          {t('common.cancel')}
        </Button>
        <Button type="submit" className="flex-1" loading={pending}>
          {t(editing ? 'common.save' : 'common.add')}
        </Button>
      </div>
    </form>
  )
}
