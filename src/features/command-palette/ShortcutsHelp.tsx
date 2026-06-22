import { Modal } from '@/components/ui/Modal'

interface ShortcutsHelpProps {
  open: boolean
  onClose: () => void
}

const SECTIONS: { title: string; rows: { keys: string[]; label: string }[] }[] = [
  {
    title: 'General',
    rows: [
      { keys: ['Ctrl', 'K'], label: 'Open command palette' },
      { keys: ['N'], label: 'New transaction' },
      { keys: ['?'], label: 'Show this help' },
      { keys: ['Esc'], label: 'Close dialog' },
    ],
  },
  {
    title: 'Go to… (press G, then)',
    rows: [
      { keys: ['G', 'D'], label: 'Dashboard' },
      { keys: ['G', 'A'], label: 'Accounts' },
      { keys: ['G', 'T'], label: 'Activity' },
      { keys: ['G', 'R'], label: 'Reports' },
      { keys: ['G', 'B'], label: 'Budgets' },
      { keys: ['G', 'I'], label: 'Bills' },
      { keys: ['G', 'G'], label: 'Goals' },
      { keys: ['G', 'S'], label: 'Settings' },
    ],
  },
]

/** A reference card for every keyboard shortcut, opened with `?`. */
export function ShortcutsHelp({ open, onClose }: ShortcutsHelpProps) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts">
      <div className="space-y-5">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {section.title}
            </p>
            <div className="space-y-1.5">
              {section.rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-4">
                  <span className="text-sm text-foreground">{row.label}</span>
                  <span className="flex items-center gap-1">
                    {row.keys.map((key) => (
                      <kbd
                        key={key}
                        className="rounded-md border border-border bg-surface-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground"
                      >
                        {key}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
