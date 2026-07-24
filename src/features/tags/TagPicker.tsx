import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useT } from '@/features/settings/language-context'
import { useTags } from './api'

interface Props {
  selected: string[]
  onChange: (next: string[]) => void
}

/** Toggleable chip multi-select over the user's tags. */
export function TagPicker({ selected, onChange }: Props) {
  const { data: tags = [], isLoading } = useTags()
  const { t } = useT()

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }

  if (isLoading) return null

  if (tags.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('txf.noTagsYet')}{' '}
        <Link to="/tags" className="font-medium text-primary hover:underline">
          {t('txf.createTags')}
        </Link>{' '}
        {t('txf.toLabelTx')}
      </p>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => {
        const active = selected.includes(tag.id)
        const color = tag.color ?? '#64748b'
        return (
          <button
            type="button"
            key={tag.id}
            onClick={() => toggle(tag.id)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm font-medium transition',
              active ? 'text-white' : 'text-foreground hover:bg-surface-muted',
            )}
            style={
              active
                ? { backgroundColor: color, borderColor: color }
                : { borderColor: 'var(--border)' }
            }
            aria-pressed={active}
          >
            {tag.name}
          </button>
        )
      })}
    </div>
  )
}
