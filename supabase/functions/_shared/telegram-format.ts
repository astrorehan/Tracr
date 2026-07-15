/**
 * Markdown → Telegram HTML.
 *
 * Models emit markdown no matter what the system prompt says, and raw markdown
 * in a chat looks like litter ("**Rp 45.000**"). So we render it instead of
 * banning it.
 *
 * HTML, not MarkdownV2: MarkdownV2 rejects the ENTIRE message over a single
 * unescaped '.', '-' or '(' — all extremely common in money text — and the reply
 * would silently fail to send. HTML needs only & < > escaped, which happens
 * first, so every tag in the output is one this file put there.
 *
 * Deliberately no imports: this is the one piece of the bot that unit tests can
 * exercise directly (see telegram-format.test.ts), so it must stay runnable
 * outside Deno.
 */

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Telegram's own supported tag set is small: b, i, u, s, a, code, pre,
 *  blockquote. Anything else is a 400, so we only ever emit these. */
export function renderTelegramHtml(md: string): string {
  let s = escapeHtml(md)

  // Fenced blocks first, so their contents aren't re-processed as emphasis.
  s = s.replace(/```[a-z]*\n?([\s\S]*?)```/gi, (_m, code) => `<pre>${String(code).trim()}</pre>`)
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>')

  // Headings have no chat equivalent — flatten to bold.
  s = s.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>')

  // Links before emphasis: the label may itself be bold.
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')

  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
  s = s.replace(/__([^_\n]+)__/g, '<b>$1</b>')
  // Single-char emphasis last, and only when it wraps real text: a bare '*'
  // bullet and underscores inside words (snake_case) must survive untouched.
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,!?)]|$)/gm, '$1<i>$2</i>')
  s = s.replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,!?)]|$)/gm, '$1<i>$2</i>')

  // Markdown bullets don't render; a real bullet character does.
  s = s.replace(/^[ \t]*[-*+][ \t]+/gm, '• ')

  return s.trim()
}

/** Last-resort text when Telegram rejects our HTML: strip the markup rather
 *  than lose the reply entirely. */
export function stripMarkdown(md: string): string {
  return md.replace(/[*_`#]/g, '')
}
