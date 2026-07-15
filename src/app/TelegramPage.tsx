import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Check, Copy, Send } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader, Section, IconChip, ListCard, ListRow } from '@/components/ui/list'
import { CenterSpinner } from '@/components/ui/States'
import { useConfirm } from '@/components/ui/confirm-context'
import { useT } from '@/features/settings/language-context'
import { useActiveBook } from '@/features/books/useActiveBook'
import { useBotLinks, useMintLinkToken, useUnlinkBot } from '@/features/bot/api'
import { dateLocale } from '@/i18n'

/** The bot's @username. Public by definition — it's how anyone finds the bot —
 *  so it ships in the client. Only the deep link needs it; the backend never
 *  does. Override per-deploy if the bot is ever renamed. */
const BOT = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? 'TracrBot').replace(/^@/, '')

/**
 * Connect a Telegram chat to this ledger.
 *
 * The whole handshake is: mint a one-time token, hand it to Telegram via a deep
 * link, and let the bot redeem it (see supabase/functions/tg-webhook). The
 * binding is written by the BOT, not by this page — so after opening the link
 * there is nothing to await, we just poll bot_links until the row shows up.
 */
export function TelegramPage() {
  const { t } = useT()
  const confirm = useConfirm()
  const { activeBookId } = useActiveBook()

  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mint = useMintLinkToken()
  const unlink = useUnlinkBot('telegram')
  // Poll only while a token is outstanding — the bot writes the row server-side
  // and the browser gets no signal.
  const links = useBotLinks('telegram', token != null)
  const link = links.data?.[0] ?? null

  // The moment the bot redeems the token, drop out of the waiting state.
  useEffect(() => {
    if (link && token) {
      setToken(null)
      setCopied(false)
    }
  }, [link, token])

  async function connect() {
    setError(null)
    if (!activeBookId) {
      setError(t('tg.noBook'))
      return
    }
    try {
      const fresh = await mint.mutateAsync('telegram')
      setToken(fresh)
      // Opened before any await on our side so it still counts as a user
      // gesture; popup blockers eat it otherwise.
      window.open(`https://t.me/${BOT}?start=${fresh}`, '_blank', 'noopener,noreferrer')
    } catch {
      setError(t('tg.error'))
    }
  }

  async function disconnect(chatId: string) {
    const ok = await confirm({
      title: t('tg.unlinkConfirmTitle'),
      message: t('tg.unlinkConfirmBody'),
      confirmLabel: t('tg.unlink'),
      tone: 'danger',
    })
    if (ok) await unlink.mutateAsync(chatId)
  }

  function copyCommand() {
    if (!token) return
    void navigator.clipboard?.writeText(`/start ${token}`).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      },
      () => {},
    )
  }

  if (links.isLoading) return <CenterSpinner />

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t('tg.title')} subtitle={t('tg.subtitle')} />

      {link ? (
        <Section title={t('tg.connectedTitle')}>
          <ListCard>
            <ListRow
              leading={<IconChip icon={Send} color="blue" />}
              title={`@${BOT}`}
              subtitle={t('tg.connectedSince', {
                date: format(new Date(link.linked_at), 'd MMM yyyy', { locale: dateLocale() }),
              })}
              chevron={false}
            />
            {link.book_name && (
              <div className="py-3">
                <p className="text-sm font-bold text-foreground">
                  {t('tg.writesTo', { book: link.book_name })}
                </p>
                {/* The book is frozen at link time — bot-core resolves it from the
                    row, not from whatever is open here. Say so before it confuses. */}
                <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                  {t('tg.bookWarning', { book: link.book_name })}
                </p>
              </div>
            )}
          </ListCard>
          <Button
            variant="secondary"
            onClick={() => disconnect(link.chat_id)}
            disabled={unlink.isPending}
            className="w-full border border-danger/30 text-danger"
          >
            {t('tg.unlink')}
          </Button>
        </Section>
      ) : token ? (
        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-3">
            <IconChip icon={Send} color="blue" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">{t('tg.waitingTitle')}</p>
              <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                {t('tg.waitingBody')}
              </p>
            </div>
          </div>

          {/* Fallback for desktop, where the deep link may not reach an app. */}
          <div className="space-y-2 rounded-2xl bg-surface-muted/50 p-4">
            <p className="text-xs font-semibold text-muted-foreground">
              {t('tg.manualHint', { bot: `@${BOT}` })}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg bg-surface px-3 py-2 text-sm font-bold text-foreground">
                /start {token}
              </code>
              <Button variant="secondary" size="sm" onClick={copyCommand}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? t('tg.copied') : t('tg.copy')}
              </Button>
            </div>
            <p className="text-xs font-medium text-muted-foreground">{t('tg.expiresHint')}</p>
          </div>

          <Button variant="secondary" onClick={() => setToken(null)} className="w-full">
            {t('tg.cancel')}
          </Button>
        </Card>
      ) : (
        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-3">
            <IconChip icon={Send} color="blue" />
            <p className="text-sm font-medium text-foreground">{t('tg.pitch')}</p>
          </div>
          <p className="text-xs font-medium text-muted-foreground">{t('tg.checkFirst')}</p>
          {error && <p className="text-xs font-semibold text-danger">{error}</p>}
          <Button onClick={connect} disabled={mint.isPending} className="w-full">
            {mint.isPending ? t('tg.connecting') : t('tg.connect')}
          </Button>
        </Card>
      )}
    </div>
  )
}
