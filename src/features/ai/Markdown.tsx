import { Fragment, useMemo, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Tiny renderer for the markdown subset the assistant actually produces:
 * ### headings, bullet / numbered lists, **bold**, *italic*, ~~strike~~,
 * `code`, ``` fences, > quotes, --- rules, [links](…) and | tables |.
 * Zero dependencies, and tolerant of a half-typed string (an unclosed ** just
 * bolds the rest) so it can render mid-typewriter without flashing literal
 * asterisks.
 *
 * Tables carry most of the formatting weight, so they get real work:
 *  - two columns and no header row  → a label/value receipt card (what the
 *    assistant writes after saving one transaction);
 *  - anything wider → a proper table when the bubble is roomy, stacked cards
 *    when it isn't. The container query measures the BUBBLE, not the viewport,
 *    which is the width that actually has to fit.
 * Money columns are detected and right-aligned with tabular figures so the
 * digits line up, and +/- amounts pick up the in/out colours.
 */

type Align = 'left' | 'right' | 'center'

type Block =
  | { t: 'h'; depth: number; text: string }
  | { t: 'p'; lines: string[] }
  | { t: 'ul'; items: string[] }
  | { t: 'ol'; items: string[]; start: number }
  | { t: 'hr' }
  | { t: 'quote'; lines: string[] }
  | { t: 'code'; lines: string[] }
  | { t: 'table'; head: string[] | null; rows: string[][]; align: (Align | null)[] }

const UL_RE = /^[-*•]\s+(.*)$/
const OL_RE = /^(\d{1,3})[.)]\s+(.*)$/
const H_RE = /^(#{1,4})\s+(.*)$/
const QUOTE_RE = /^>\s?(.*)$/
const FENCE_RE = /^```/
const isRow = (l: string) => l.startsWith('|') && l.endsWith('|') && l.length > 2
const isSeparatorRow = (l: string) => /^\|[\s:|-]+\|$/.test(l) && l.includes('-')

/** Cells that read as a number/money/percentage — used for column alignment. */
const NUMISH = /^[+\-−(]?\s*(?:rp|idr|usd|eur|sgd|myr|[$€£¥])?\s*\d[\d.,\s]*\s*(?:%|jt|rb|k|m)?\)?$/i

const splitRow = (l: string) => l.slice(1, -1).split('|').map((c) => c.trim())

/** Plain text of a cell, so numeric detection isn't fooled by **bold**. */
const bare = (cell: string) => cell.replace(/[*`~]/g, '').trim()

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

    // ``` fence — everything until the closing fence, or to the end while the
    // reply is still typing itself out.
    if (FENCE_RE.test(line)) {
      i++
      const body: string[] = []
      while (i < lines.length && !FENCE_RE.test(lines[i].trim())) {
        body.push(lines[i])
        i++
      }
      if (i < lines.length) i++ // consume the closing fence
      blocks.push({ t: 'code', lines: body })
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

    if (QUOTE_RE.test(line)) {
      const quoted: string[] = []
      while (i < lines.length) {
        const m = QUOTE_RE.exec(lines[i].trim())
        if (!m) break
        quoted.push(m[1])
        i++
      }
      blocks.push({ t: 'quote', lines: quoted })
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

    if (isRow(line)) {
      const raw: string[] = []
      while (i < lines.length && isRow(lines[i].trim())) {
        raw.push(lines[i].trim())
        i++
      }
      const table = buildTable(raw)
      if (table) {
        blocks.push(table)
        continue
      }
    }

    // Paragraph: consecutive plain lines, broken by any block starter above.
    const para: string[] = [line]
    i++
    while (i < lines.length) {
      const l = lines[i].trim()
      if (!l || H_RE.test(l) || UL_RE.test(l) || OL_RE.test(l) || QUOTE_RE.test(l) || FENCE_RE.test(l) || l.startsWith('|')) break
      para.push(l)
      i++
    }
    blocks.push({ t: 'p', lines: para })
  }
  return blocks
}

/** Turn collected `| … |` lines into a table block, reading the optional
 *  |:--|--:| separator for per-column alignment. */
function buildTable(raw: string[]): Block | null {
  const sepAt = raw.findIndex(isSeparatorRow)
  const align: (Align | null)[] =
    sepAt >= 0
      ? splitRow(raw[sepAt]).map((cell) => {
          const left = cell.startsWith(':')
          const right = cell.endsWith(':')
          return left && right ? 'center' : right ? 'right' : left ? 'left' : null
        })
      : []
  const body = raw.filter((_, index) => index !== sepAt).map(splitRow)
  if (body.length === 0) return null
  // A separator directly under the first row is what makes it a header row.
  const head = sepAt === 1 ? body[0] : null
  const rows = head ? body.slice(1) : body
  if (rows.length === 0 && !head) return null
  return { t: 'table', head, rows, align }
}

/** Longest row wins, so a ragged table still lines up. */
const widthOf = (t: Extract<Block, { t: 'table' }>) =>
  Math.max(t.head?.length ?? 0, ...t.rows.map((r) => r.length), 1)

/** Per-column alignment: the separator row if it said so, else right for a
 *  column whose body cells all read as numbers. */
function columnAligns(t: Extract<Block, { t: 'table' }>, cols: number): Align[] {
  return Array.from({ length: cols }, (_, c) => {
    if (t.align[c]) return t.align[c] as Align
    const cells = t.rows.map((r) => bare(r[c] ?? '')).filter(Boolean)
    return cells.length > 0 && cells.every((cell) => NUMISH.test(cell)) ? 'right' : 'left'
  })
}

const ALIGN_CLASS: Record<Align, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
}

/** Money cells get tabular figures, and a leading +/- picks up the in/out
 *  colour so a column of amounts is readable at a glance. */
function cellTone(cell: string, align: Align): string {
  const text = bare(cell)
  if (!NUMISH.test(text)) return ''
  const sign = /^[+]/.test(text) ? 'text-positive' : /^[-−(]/.test(text) ? 'text-danger' : ''
  return cn('font-numeric', align === 'right' && 'font-semibold', sign)
}

const SAFE_HREF = /^(https?:\/\/|mailto:|\/)/i

/** **bold**, *italic*, ~~strike~~, `code`, [links](…) — recursive so bold can
 *  contain italic. */
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
    if (text[i] === '[') {
      // [label](href) — anything else falls through as plain text.
      const close = text.indexOf('](', i)
      const end = close === -1 ? -1 : text.indexOf(')', close + 2)
      if (close !== -1 && end !== -1) {
        const href = text.slice(close + 2, end).trim()
        const label = text.slice(i + 1, close)
        if (SAFE_HREF.test(href)) {
          flush()
          nodes.push(
            <a
              key={`a${key++}`}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary underline decoration-primary/40 underline-offset-2"
            >
              {inline(label)}
            </a>,
          )
          i = end + 1
          continue
        }
      }
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
    if (text.startsWith('~~', i)) {
      const end = text.indexOf('~~', i + 2)
      if (end !== -1) {
        flush()
        nodes.push(
          <s key={`s${key++}`} className="opacity-70">
            {inline(text.slice(i + 2, end))}
          </s>,
        )
        i = end + 2
        continue
      }
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
    // @container is on TableBlock so tables size against their bubble without shrinking text bubbles to min-content.
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
          case 'quote':
            return (
              <div
                key={i}
                className="rounded-r-xl border-l-[3px] border-primary/50 bg-primary-soft/40 px-3 py-2 text-[13px]"
              >
                {b.lines.map((l, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    {inline(l)}
                  </Fragment>
                ))}
              </div>
            )
          case 'code':
            return (
              <pre
                key={i}
                className="overflow-x-auto rounded-xl border border-border bg-surface-muted px-3 py-2.5 text-[12px] leading-relaxed"
              >
                <code className="font-numeric">{b.lines.join('\n')}</code>
              </pre>
            )
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
            return <TableBlock key={i} block={b} />
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

function TableBlock({ block }: { block: Extract<Block, { t: 'table' }> }) {
  const cols = widthOf(block)
  const aligns = columnAligns(block, cols)
  const head = block.head

  // Two columns, no header: a label/value card — the shape the assistant uses
  // to restate one saved transaction. Never needs to scroll.
  if (!head && cols === 2) return <KeyValueCard rows={block.rows} />

  return (
    <div className="@container w-full my-0.5">
      {/* Roomy bubble: a real table. */}
      <div className="hidden overflow-x-auto rounded-xl border border-border @[300px]:block">
        <table className="w-full border-collapse text-[13px]">
          {head && (
            <thead>
              <tr className="bg-surface-muted/70">
                {Array.from({ length: cols }, (_, c) => (
                  <th
                    key={c}
                    scope="col"
                    className={cn(
                      'whitespace-nowrap px-2.5 py-2 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground',
                      ALIGN_CLASS[aligns[c]],
                    )}
                  >
                    {inline(head[c] ?? '')}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r} className={cn((r > 0 || head) && 'border-t border-border')}>
                {Array.from({ length: cols }, (_, c) => (
                  <td
                    key={c}
                    className={cn(
                      'px-2.5 py-2 align-top',
                      ALIGN_CLASS[aligns[c]],
                      c === 0 && 'font-semibold text-foreground',
                      cellTone(row[c] ?? '', aligns[c]),
                    )}
                  >
                    {inline(row[c] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Narrow bubble (phone): one card per row, so nothing scrolls sideways. */}
      <div className="space-y-1.5 @[300px]:hidden">
        {block.rows.map((row, r) => (
          <div key={r} className="rounded-xl border border-border bg-surface-muted/40 px-3 py-2">
            <p className="text-[13px] font-bold text-foreground">{inline(row[0] ?? '')}</p>
            <dl className="mt-1 space-y-0.5">
              {Array.from({ length: cols - 1 }, (_, k) => {
                const c = k + 1
                const value = row[c] ?? ''
                if (!bare(value)) return null
                return (
                  <div key={c} className="flex items-baseline justify-between gap-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {inline(head?.[c] ?? '')}
                    </dt>
                    <dd className={cn('text-right text-[13px] font-semibold', cellTone(value, 'right'))}>
                      {inline(value)}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </div>
        ))}
      </div>
    </div>
  )
}

/** `| Label | Value |` with no header row: a compact receipt card. */
function KeyValueCard({ rows }: { rows: string[][] }) {
  return (
    <dl className="my-0.5 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-muted/40">
      {rows.map((row, r) => (
        <div key={r} className="flex items-baseline justify-between gap-3 px-3 py-2">
          <dt className="shrink-0 text-[12px] font-semibold text-muted-foreground">
            {inline(row[0] ?? '')}
          </dt>
          <dd
            className={cn(
              'min-w-0 text-right text-[13px] font-bold text-foreground',
              cellTone(row[1] ?? '', 'right'),
            )}
          >
            {inline(row[1] ?? '')}
          </dd>
        </div>
      ))}
    </dl>
  )
}
