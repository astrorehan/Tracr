import { Fragment, useMemo, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Tiny renderer for the markdown subset the assistant actually produces:
 * ### headings, bullet / numbered lists, **bold**, *italic*, `code`, ---
 * rules and simple | tables. Zero dependencies, and tolerant of a half-typed
 * string (an unclosed ** just bolds the rest) so it can render mid-typewriter
 * without flashing literal asterisks.
 */

type Block =
  | { t: 'h'; depth: number; text: string }
  | { t: 'p'; lines: string[] }
  | { t: 'ul'; items: string[] }
  | { t: 'ol'; items: string[]; start: number }
  | { t: 'hr' }
  | { t: 'table'; rows: string[][] }

const UL_RE = /^[-*•]\s+(.*)$/
const OL_RE = /^(\d{1,3})[.)]\s+(.*)$/
const H_RE = /^(#{1,4})\s+(.*)$/

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    if (!line) {
      i++
      continue
    }

    const h = H_RE.exec(line)
    if (h) {
      blocks.push({ t: 'h', depth: h[1].length, text: h[2] })
      i++
      continue
    }

    if (/^([-*_])\1{2,}$/.test(line.replace(/\s/g, ''))) {
      blocks.push({ t: 'hr' })
      i++
      continue
    }

    if (UL_RE.test(line)) {
      const items: string[] = []
      while (i < lines.length) {
        const m = UL_RE.exec(lines[i].trim())
        if (!m) break
        items.push(m[1])
        i++
      }
      blocks.push({ t: 'ul', items })
      continue
    }

    const ol = OL_RE.exec(line)
    if (ol) {
      const items: string[] = []
      const start = parseInt(ol[1], 10)
      while (i < lines.length) {
        const m = OL_RE.exec(lines[i].trim())
        if (!m) break
        items.push(m[2])
        i++
      }
      blocks.push({ t: 'ol', items, start })
      continue
    }

    if (line.startsWith('|') && line.endsWith('|') && line.length > 2) {
      const rows: string[][] = []
      while (i < lines.length) {
        const l = lines[i].trim()
        if (!(l.startsWith('|') && l.endsWith('|') && l.length > 2)) break
        // Skip the |---|---| separator row.
        if (!/^\|[\s:|-]+\|$/.test(l)) rows.push(l.slice(1, -1).split('|').map((c) => c.trim()))
        i++
      }
      if (rows.length) {
        blocks.push({ t: 'table', rows })
        continue
      }
    }

    // Paragraph: consecutive plain lines, broken by any block starter above.
    const para: string[] = [line]
    i++
    while (i < lines.length) {
      const l = lines[i].trim()
      if (!l || H_RE.test(l) || UL_RE.test(l) || OL_RE.test(l) || l.startsWith('|')) break
      para.push(l)
      i++
    }
    blocks.push({ t: 'p', lines: para })
  }
  return blocks
}

/** **bold**, *italic*, `code` — recursive so bold can contain italic. */
function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let plain = ''
  let key = 0
  let i = 0
  const flush = () => {
    if (plain) {
      nodes.push(plain)
      plain = ''
    }
  }

  while (i < text.length) {
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1)
      const body = end === -1 ? text.slice(i + 1) : text.slice(i + 1, end)
      flush()
      nodes.push(
        <code
          key={`c${key++}`}
          className="rounded-md bg-surface-muted px-1 py-0.5 font-numeric text-[0.9em] font-semibold"
        >
          {body}
        </code>,
      )
      i = end === -1 ? text.length : end + 1
      continue
    }
    if (text.startsWith('**', i)) {
      const end = text.indexOf('**', i + 2)
      // Unclosed ** (mid-typewriter): bold the rest instead of leaking asterisks.
      const body = end === -1 ? text.slice(i + 2) : text.slice(i + 2, end)
      flush()
      nodes.push(
        <strong key={`b${key++}`} className="font-bold">
          {inline(body)}
        </strong>,
      )
      i = end === -1 ? text.length : end + 2
      continue
    }
    if (text[i] === '*') {
      const end = text.indexOf('*', i + 1)
      if (end !== -1 && end > i + 1) {
        flush()
        nodes.push(<em key={`i${key++}`}>{inline(text.slice(i + 1, end))}</em>)
        i = end + 1
        continue
      }
    }
    plain += text[i]
    i++
  }
  flush()
  return nodes
}

export function AiMarkdown({ text, className }: { text: string; className?: string }) {
  const blocks = useMemo(() => parseBlocks(text), [text])
  return (
    <div className={cn('space-y-2 text-sm leading-relaxed text-foreground', className)}>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'h':
            return (
              <p
                key={i}
                className={cn(
                  'font-extrabold tracking-tight text-foreground',
                  b.depth <= 2 ? 'text-[15px]' : 'text-sm',
                  i > 0 && 'pt-1.5',
                )}
              >
                {inline(b.text)}
              </p>
            )
          case 'hr':
            return <div key={i} aria-hidden className="my-1 h-px bg-border" />
          case 'ul':
            return (
              <ul key={i} className="space-y-1.5">
                {b.items.map((item, j) => (
                  <li key={j} className="flex gap-2.5">
                    <span
                      aria-hidden
                      className="mt-[0.5em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70"
                    />
                    <span className="min-w-0 flex-1">{inline(item)}</span>
                  </li>
                ))}
              </ul>
            )
          case 'ol':
            return (
              <ol key={i} className="space-y-1.5">
                {b.items.map((item, j) => (
                  <li key={j} className="flex gap-2">
                    <span className="w-[1.4rem] shrink-0 text-right font-numeric text-[13px] font-extrabold leading-[1.7] text-primary">
                      {b.start + j}.
                    </span>
                    <span className="min-w-0 flex-1">{inline(item)}</span>
                  </li>
                ))}
              </ol>
            )
          case 'table':
            return (
              <div key={i} className="overflow-x-auto">
                <table className="w-full min-w-[240px] border-collapse text-[13px]">
                  <tbody>
                    {b.rows.map((row, r) => (
                      <tr key={r} className={cn(r > 0 && 'border-t border-border')}>
                        {row.map((cell, c) => (
                          <td key={c} className={cn('px-2 py-1.5 align-top', r === 0 && 'font-bold')}>
                            {inline(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          default:
            return (
              <p key={i}>
                {b.lines.map((l, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    {inline(l)}
                  </Fragment>
                ))}
              </p>
            )
        }
      })}
    </div>
  )
}
