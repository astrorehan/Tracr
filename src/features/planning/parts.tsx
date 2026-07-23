import type { ComponentType, ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IconChip, Pill } from '@/components/ui/list'
import { cn } from '@/lib/utils'

type IconType = ComponentType<{ className?: string }>

/** The heading of one planning section: accent chip + title + live count,
 *  with the primary "add" pill parked on the right. */
export function SectionHeader({
  icon,
  color,
  title,
  count,
  addLabel,
  onAdd,
}: {
  icon: IconType
  color: string
  title: string
  count: number
  addLabel: string
  onAdd: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-0.5">
      <IconChip icon={icon} color={color} className="h-9 w-9" />
      <div className="min-w-0 flex-1">
        <h2 className="section-head flex items-center gap-2 text-lg text-foreground">
          <span className="truncate">{title}</span>
          {count > 0 && (
            <span className="font-numeric shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
              {count}
            </span>
          )}
        </h2>
      </div>
      <Pill variant="tint" icon={Plus} onClick={onAdd} aria-label={addLabel}>
        <span className="hidden sm:inline">{addLabel}</span>
      </Pill>
    </div>
  )
}

export interface TemplateChip {
  label: string
  onClick: () => void
}

/**
 * Empty state that *shows the shape* instead of describing it: a faithful, muted
 * sample of a real card fades out behind a single clear call-to-action and a row
 * of one-tap starter chips. The user sees exactly what they'll get before they
 * ever open the form.
 */
export function EmptyPreview({
  sample,
  blurb,
  ctaLabel,
  onCreate,
  templates,
}: {
  sample: ReactNode
  blurb: string
  ctaLabel: string
  onCreate: () => void
  templates: TemplateChip[]
}) {
  return (
    <Card className="space-y-4 p-4 text-center sm:p-5">
      {/* A real, muted sample in a dashed "example" frame — shows the exact
          shape a filled card will take, without pretending to be live data. */}
      <div className="pointer-events-none select-none rounded-2xl border border-dashed border-border bg-surface-muted/40 p-4 text-left opacity-70">
        {sample}
      </div>

      <p className="mx-auto max-w-sm text-sm font-medium text-muted-foreground">{blurb}</p>

      <div className="flex justify-center">
        <Button onClick={onCreate}>
          <Plus className="h-4 w-4" />
          {ctaLabel}
        </Button>
      </div>

      {templates.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {templates.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={t.onClick}
              className="pressable rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </Card>
  )
}

/** Bar used inside sample cards + real cards, so the ghost preview matches. */
export function ProgressBar({ pct, color, className }: { pct: number; color: string; className?: string }) {
  return (
    <div className={cn('h-2.5 w-full overflow-hidden rounded-full bg-surface-muted', className)}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: color }}
      />
    </div>
  )
}
