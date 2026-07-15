import { describe, it, expect } from 'vitest'
import { renderTelegramHtml, stripMarkdown } from './telegram-format'

describe('renderTelegramHtml', () => {
  it('renders the emphasis Telegram supports', () => {
    expect(renderTelegramHtml('**Rp 45.000**')).toBe('<b>Rp 45.000</b>')
    expect(renderTelegramHtml('__done__')).toBe('<b>done</b>')
    expect(renderTelegramHtml('that is *maybe* right')).toBe('that is <i>maybe</i> right')
    expect(renderTelegramHtml('`code`')).toBe('<code>code</code>')
  })

  it('escapes HTML before adding any tags of its own', () => {
    // Otherwise a model writing "<b>" or "a < b" would inject markup or 400 the
    // send. Every tag in the output must be one we put there.
    expect(renderTelegramHtml('5 < 6 & 7 > 2')).toBe('5 &lt; 6 &amp; 7 &gt; 2')
    expect(renderTelegramHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    )
    expect(renderTelegramHtml('**<b>x</b>**')).toBe('<b>&lt;b&gt;x&lt;/b&gt;</b>')
  })

  it('turns markdown bullets into real bullets', () => {
    expect(renderTelegramHtml('- Food\n- Transport')).toBe('• Food\n• Transport')
    expect(renderTelegramHtml('* Food\n+ Transport')).toBe('• Food\n• Transport')
  })

  it('flattens headings, which do not render in chat', () => {
    expect(renderTelegramHtml('## This month')).toBe('<b>This month</b>')
  })

  it('leaves underscores inside words alone', () => {
    // snake_case in a note must not become italics.
    expect(renderTelegramHtml('account_balances is fine')).toBe('account_balances is fine')
    expect(renderTelegramHtml('a_b_c')).toBe('a_b_c')
  })

  it('does not treat a bullet asterisk as emphasis', () => {
    expect(renderTelegramHtml('* one\n* two')).toBe('• one\n• two')
  })

  it('renders links', () => {
    expect(renderTelegramHtml('[Tracr](https://tracr.app)')).toBe(
      '<a href="https://tracr.app">Tracr</a>',
    )
  })

  it('keeps code blocks intact instead of styling their contents', () => {
    expect(renderTelegramHtml('```\na * b\n```')).toBe('<pre>a * b</pre>')
  })

  it('passes plain money text through untouched', () => {
    // The common case: no markup at all, and full stops/hyphens that MarkdownV2
    // would have choked on.
    const s = 'You spent Rp 1.368.549 last month - about 12% more than before.'
    expect(renderTelegramHtml(s)).toBe(s)
  })

  it('handles a realistic mixed reply', () => {
    expect(renderTelegramHtml('Saved **Rp 45.000** to *Cash*.\n- Category: Food')).toBe(
      'Saved <b>Rp 45.000</b> to <i>Cash</i>.\n• Category: Food',
    )
  })
})

describe('stripMarkdown', () => {
  it('removes markup for the plain-text fallback', () => {
    expect(stripMarkdown('**Rp 45.000** in `Cash`')).toBe('Rp 45.000 in Cash')
  })
})
