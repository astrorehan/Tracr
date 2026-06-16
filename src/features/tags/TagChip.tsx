import { cn } from '@/lib/utils'
import type { Tag } from '@/types/db'

/** Small colored pill used to show a tag in lists and rows. */
export function TagChip({ tag, className }: { tag: Tag; className?: string }) {
  const color = tag.color ?? '#64748b'
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium leading-none',
        className,
      )}
      style={{ backgroundColor: `${color}20`, color }}
    >
      {tag.name}
    </span>
  )
}
