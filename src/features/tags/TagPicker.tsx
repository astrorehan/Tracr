import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useTags } from './api'

interface Props {
  selected: string[]
  onChange: (next: string[]) => void
}

/** Toggleable chip multi-select over the user's tags. */
export function TagPicker({ selected, onChange }: Props) {
  const { data: tags = [], isLoading } = useTags()

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((t) => t !== id) : [...selected, id])
  }

  if (isLoading) return null

  if (tags.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No tags yet.{' '}
        <Link to="/tags" className="font-medium text-primary hover:underline">
          Create some
        </Link>{' '}
        to label transactions.
      </p>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((t) => {
        const active = selected.includes(t.id)
        const color = t.color ?? '#64748b'
        return (
          <button
            type="button"
            key={t.id}
            onClick={() => toggle(t.id)}
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
            {t.name}
          </button>
        )
      })}
    </div>
  )
}
