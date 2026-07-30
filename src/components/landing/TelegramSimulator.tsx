import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Bot, Sparkles, CheckCheck } from 'lucide-react'
import { useT } from '@/features/settings/language-context'
import type { MsgKey } from '@/i18n'
import { cn } from '@/lib/utils'

interface ChatMessage {
  id: string
  sender: 'user' | 'bot'
  text: string
  timestamp: string
}

/** Preset prompts, in the order the demo plays them. */
const PRESETS: { key: MsgKey; intent: Intent }[] = [
  { key: 'land.tgSimPreset1', intent: 'coffee' },
  { key: 'land.tgSimPreset2', intent: 'income' },
  { key: 'land.tgSimPreset3', intent: 'transfer' },
  { key: 'land.tgSimPreset4', intent: 'query' },
]

type Intent = 'coffee' | 'income' | 'transfer' | 'query' | 'generic'

/**
 * Guess what a typed message is about. Both languages are matched, because the
 * presets themselves are translated — an English visitor tapping "Coffee 25k
 * BCA" has to get the coffee reply, not the catch-all one.
 */
const INTENT_WORDS: Record<Exclude<Intent, 'generic'>, string[]> = {
  coffee: ['kopi', 'coffee'],
  income: ['gaji', 'masuk', 'honor', 'salary', 'income'],
  transfer: ['transfer', 'pindah', 'move'],
  query: ['berapa', 'how much', 'how many'],
}

const REPLY_KEY: Record<Exclude<Intent, 'generic'>, MsgKey> = {
  coffee: 'land.tgSimReplyCoffee',
  income: 'land.tgSimReplyIncome',
  transfer: 'land.tgSimReplyTransfer',
  query: 'land.tgSimReplyQuery',
}

/** A question wins over a keyword: "how much on coffee?" is a query, not a log. */
function detectIntent(text: string): Intent {
  const lower = text.toLowerCase()
  if (INTENT_WORDS.query.some((w) => lower.includes(w))) return 'query'
  if (INTENT_WORDS.transfer.some((w) => lower.includes(w))) return 'transfer'
  if (INTENT_WORDS.income.some((w) => lower.includes(w))) return 'income'
  if (INTENT_WORDS.coffee.some((w) => lower.includes(w))) return 'coffee'
  return 'generic'
}

const MAX_DEMO_MESSAGES = 8

export function TelegramSimulator() {
  const { t } = useT()
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'seed-user', sender: 'user', text: t('land.tgSimSeedUser'), timestamp: '12:30' },
    { id: 'seed-bot', sender: 'bot', text: t('land.tgSimSeedBot'), timestamp: '12:30' },
  ])

  const [inputVal, setInputVal] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = chatContainerRef.current
    // Keep the newest message in view without dragging the whole page along.
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, isTyping])

  const sendText = useCallback(
    (userText: string, intent?: Intent) => {
      const text = userText.trim()
      if (!text) return

      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-u`, sender: 'user', text, timestamp: now },
      ])
      setInputVal('')
      setIsTyping(true)

      const resolved = intent ?? detectIntent(text)
      const reply =
        resolved === 'generic'
          ? t('land.tgSimReplyGeneric', { text })
          : t(REPLY_KEY[resolved])

      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-b`,
            sender: 'bot',
            text: reply,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ])
        setIsTyping(false)
      }, 1200)
    },
    [t]
  )

  // Self-running demo. The step counter is a ref so the sequence keeps advancing
  // across the re-renders each new message causes, instead of replaying preset 1
  // forever. Guarded by a ref for the same reason: reading `messages`/`isTyping`
  // from state here would restart the interval on every tick.
  const stepRef = useRef(0)
  const busyRef = useRef(false)
  const countRef = useRef(0)

  useEffect(() => {
    busyRef.current = isTyping
    countRef.current = messages.length
  }, [isTyping, messages.length])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const interval = setInterval(() => {
      if (busyRef.current || countRef.current >= MAX_DEMO_MESSAGES) return
      const preset = PRESETS[stepRef.current % PRESETS.length]
      stepRef.current += 1
      sendText(t(preset.key), preset.intent)
    }, 7000)

    return () => clearInterval(interval)
  }, [sendText, t])

  return (
    <section id="telegram-demo" className="scroll-mt-12 border-y border-border bg-surface/50 py-20 sm:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-2">
        {/* Left Explanation Column */}
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-sky-500/10 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
            <Bot className="h-4 w-4" /> {t('land.tgSimBadge')}
          </div>

          <h2 className="mt-4 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            {t('land.tgSimTitle')}
          </h2>

          <p className="mt-4 text-base font-medium leading-relaxed text-muted-foreground">
            {t('land.tgSimSubtitle')}
          </p>

          {/* Presets buttons */}
          <div className="mt-6 flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => sendText(t(preset.key), preset.intent)}
                disabled={isTyping}
                className="pressable inline-flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-500/15 disabled:opacity-50 dark:text-sky-300 transition"
              >
                <Sparkles className="h-3.5 w-3.5 text-sky-500" />
                {t(preset.key)}
              </button>
            ))}
          </div>

          <div className="mt-8 space-y-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                ✓
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                <strong className="text-foreground">{t('land.tgSimFeature1Title')}</strong> {t('land.tgSimFeature1Body')}
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                ✓
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                <strong className="text-foreground">{t('land.tgSimFeature2Title')}</strong> {t('land.tgSimFeature2Body')}
              </p>
            </div>
          </div>
        </div>

        {/* Right Telegram Chat Window */}
        <div className="card-surface mx-auto w-full max-w-md overflow-hidden rounded-3xl border border-border shadow-xl">
          {/* Telegram Header */}
          <div className="flex items-center gap-3 border-b border-border bg-sky-600 px-5 py-4 text-white">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white shadow-inner font-bold">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold leading-none">Tracr Telegram Bot</p>
              <p className="mt-1 text-xs font-medium text-sky-100 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                {t('land.tgSimBotStatus')}
              </p>
            </div>
          </div>

          {/* Messages Feed */}
          <div
            ref={chatContainerRef}
            role="log"
            aria-label={t('land.tgSimChatAria')}
            className="h-80 overflow-y-auto bg-slate-100/50 dark:bg-slate-950/40 p-4 space-y-3 text-sm font-medium"
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex flex-col max-w-[85%]',
                  msg.sender === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'
                )}
              >
                <div
                  className={cn(
                    'rounded-2xl px-4 py-2.5 shadow-xs leading-relaxed text-xs sm:text-sm',
                    msg.sender === 'user'
                      ? 'rounded-br-xs bg-sky-600 text-white'
                      : 'rounded-bl-xs bg-surface border border-border text-foreground'
                  )}
                >
                  {msg.text}
                </div>
                <span className="mt-1 text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                  {msg.timestamp}
                  {msg.sender === 'user' && <CheckCheck className="h-3 w-3 text-sky-500" />}
                </span>
              </div>
            ))}

            {isTyping && (
              <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-xs bg-surface border border-border px-4 py-3 text-xs text-muted-foreground w-fit">
                <span className="typing-dot h-2 w-2 rounded-full bg-sky-500" />
                <span className="typing-dot h-2 w-2 rounded-full bg-sky-500" />
                <span className="typing-dot h-2 w-2 rounded-full bg-sky-500" />
                <span className="ml-2 font-medium">{t('land.tgSimTyping')}</span>
              </div>
            )}
          </div>

          {/* Chat Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!isTyping) sendText(inputVal)
            }}
            className="flex items-center gap-2 border-t border-border bg-surface p-3"
          >
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder={t('land.tgSimPlaceholder')}
              aria-label={t('land.tgSimPlaceholder')}
              className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <button
              type="submit"
              disabled={isTyping || !inputVal.trim()}
              aria-label={t('land.tgSimSendAria')}
              className="pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white transition hover:bg-sky-700 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </section>
  )
}
