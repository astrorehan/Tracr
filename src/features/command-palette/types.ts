import type { ComponentType } from 'react'

export type CommandIcon = ComponentType<{ className?: string }>

export interface Command {
  /** Stable id used as the React key. */
  id: string
  /** Primary label shown in the list. */
  label: string
  /** Section heading the command is grouped under. */
  group: string
  icon: CommandIcon
  /** Extra words to match against (synonyms, section names). */
  keywords?: string
  /** Key hint chips shown on the right, e.g. ['G', 'D']. */
  shortcut?: string[]
  /** Run the command. The palette closes itself right after. */
  perform: () => void
}

/** Case-insensitive substring match across label, group and keywords. */
export function matchesQuery(cmd: Command, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = `${cmd.label} ${cmd.group} ${cmd.keywords ?? ''}`.toLowerCase()
  // Every whitespace-separated term must appear somewhere — lets "go acc" match.
  return q.split(/\s+/).every((term) => haystack.includes(term))
}
