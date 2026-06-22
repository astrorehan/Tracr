import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, CornerDownLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { matchesQuery, type Command } from './types'

interface CommandPaletteProps {
  onClose: () => void
  commands: Command[]
}

/**
 * A Spotlight-style command palette: type to filter every navigation
 * destination and quick action, ↑/↓ to move, Enter to run. Opened with
 * Cmd/Ctrl-K (wired in {@link useAppShortcuts}). Rendered near the top of the
 * viewport rather than dead-centre for the familiar launcher feel.
 *
 * Mounted only while open (by the parent), so it always starts on a clean
 * query/selection without resetting state in an effect.
 */
export function CommandPalette({ onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(
    () => commands.filter((c) => matchesQuery(c, query)),
    [commands, query],
  )

  // Clamp during render rather than correcting via setState in an effect.
  const activeIndex = filtered.length ? Math.min(active, filtered.length - 1) : 0

  // Focus the input once on mount (touches the DOM only — no state change).
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 20)
    return () => clearTimeout(t)
  }, [])

  // Scroll the active row into view as you arrow through.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function run(cmd: Command | undefined) {
    if (!cmd) return
    onClose()
    cmd.perform()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((activeIndex + 1) % Math.max(1, filtered.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((activeIndex - 1 + filtered.length) % Math.max(1, filtered.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run(filtered[activeIndex])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  // Group while preserving each command's flat index (used for arrow nav).
  const groups: { name: string; items: { cmd: Command; index: number }[] }[] = []
  filtered.forEach((cmd, index) => {
    const last = groups[groups.length - 1]
    if (last && last.name === cmd.group) last.items.push({ cmd, index })
    else groups.push({ name: cmd.group, items: [{ cmd, index }] })
  })

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh] sm:pt-[16vh]">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[6px] animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="card-surface relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-lg animate-pop"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4.5 w-4.5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages and actions…"
            className="h-14 w-full bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
            spellCheck={false}
            autoComplete="off"
          />
          <kbd className="hidden shrink-0 rounded-md border border-border bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground sm:block">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              No matches for “{query}”.
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.name} className="mb-1">
                <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.name}
                </p>
                {group.items.map(({ cmd, index }) => {
                  const Icon = cmd.icon
                  const isActive = index === activeIndex
                  return (
                    <button
                      key={cmd.id}
                      data-index={index}
                      onMouseMove={() => setActive(index)}
                      onClick={() => run(cmd)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                        isActive
                          ? 'bg-primary/10 text-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <Icon className="h-4.5 w-4.5 shrink-0" />
                      <span className="flex-1 truncate font-medium text-foreground">
                        {cmd.label}
                      </span>
                      {cmd.shortcut && (
                        <span className="flex shrink-0 items-center gap-1">
                          {cmd.shortcut.map((key) => (
                            <kbd
                              key={key}
                              className="rounded-md border border-border bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
                            >
                              {key}
                            </kbd>
                          ))}
                        </span>
                      )}
                      {isActive && !cmd.shortcut && (
                        <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
