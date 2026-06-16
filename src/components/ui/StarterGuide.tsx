import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { Card } from './Card'

interface GuidePoint {
  title: string
  body: string
}

export interface TemplateItem {
  label: string
  hint?: string
  onClick: () => void
}

/** Onboarding panel for an empty feature page: a short "how it works" walkthrough
 *  plus one-tap starter templates that open the create form prefilled. */
export function StarterGuide({
  icon,
  title,
  intro,
  points,
  templatesTitle = 'Start from a template',
  templates,
}: {
  icon: ReactNode
  title: string
  intro: string
  points: GuidePoint[]
  templatesTitle?: string
  templates: TemplateItem[]
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Card className="p-6 sm:p-7">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-muted text-foreground ring-1 ring-border">
            {icon}
          </span>
          <div className="min-w-0">
            <h2 className="section-head text-xl text-foreground">{title}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{intro}</p>
          </div>
        </div>

        <ol className="mt-5 space-y-3.5">
          {points.map((p, i) => (
            <li key={p.title} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground font-numeric text-xs font-bold text-primary-foreground">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{p.title}</p>
                <p className="text-sm text-muted-foreground">{p.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <div>
        <h3 className="section-head mb-2 px-1 text-base text-foreground">{templatesTitle}</h3>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {templates.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={t.onClick}
              className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-surface-muted"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-foreground">{t.label}</span>
                {t.hint && (
                  <span className="block truncate text-xs text-muted-foreground">{t.hint}</span>
                )}
              </span>
              <Plus className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
