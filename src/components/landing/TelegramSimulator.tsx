import { useState, useRef, useEffect } from 'react'
import { Send, Bot, Sparkles, CheckCheck } from 'lucide-react'
import { useT } from '@/features/settings/language-context'
import { cn } from '@/lib/utils'

interface ChatMessage {
  id: string
  sender: 'user' | 'bot'
  text: string
  timestamp: string
}

export function TelegramSimulator() {
  const { t } = useT()
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      sender: 'user',
      text: 'makan siang 35k pakai gopay',
      timestamp: '12:30',
    },
    {
      id: '2',
      sender: 'bot',
      text: '✅ Transaksi dicatat! Rp 35.000 (Kategori: Makan & Minum, Dompet: GoPay). Sisa budget harian: Rp 140.000.',
      timestamp: '12:30',
    },
  ])

  const [inputVal, setInputVal] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [messages, isTyping])

  // Auto Demo Replay Loop
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return

    const autoPrompts = [
      'Kopi 25k BCA',
      'Transfer 200k ke Gopay',
      'Berapa pengeluaran kopi bulan ini?',
    ]

    let step = 0
    const interval = setInterval(() => {
      if (messages.length < 8 && !isTyping) {
        handleSendText(autoPrompts[step % autoPrompts.length])
        step++
      }
    }, 7000)

    return () => clearInterval(interval)
  }, [messages, isTyping])

  const handleSendText = (userText: string) => {
    if (!userText.trim() || isTyping) return

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: userText,
      timestamp: now,
    }

    setMessages((prev) => [...prev, userMsg])
    setInputVal('')
    setIsTyping(true)

    setTimeout(() => {
      let botResponse = ''
      const lower = userText.toLowerCase()

      if (lower.includes('kopi')) {
        botResponse = '☕ Transaksi dicatat! Rp 25.000 (Kategori: Kopi & Cafe, Dompet: BCA). Sisa budget harian: Rp 115.000.'
      } else if (lower.includes('gaji')) {
        botResponse = '💰 Pemasukan dicatat! +Rp 8.500.000 ke rekening BCA. Total saldo kini Rp 18.500.000.'
      } else if (lower.includes('transfer')) {
        botResponse = '🔄 Transfer berhasil dicatat! Rp 200.000 dari BCA ➔ GoPay. Bebas admin!'
      } else if (lower.includes('berapa')) {
        botResponse = '📊 Total pengeluaran Kopi bulan ini: Rp 245.000 (12 transaksi). Lebih hemat 15% dari bulan lalu! 🚀'
      } else {
        botResponse = `✅ Transaksi dicatat! "${userText}" telah dikategorikan otomatis oleh AI.`
      }

      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'bot',
        text: botResponse,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }

      setMessages((prev) => [...prev, botMsg])
      setIsTyping(false)
    }, 1200)
  }

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
            {[
              t('land.tgSimPreset1'),
              t('land.tgSimPreset2'),
              t('land.tgSimPreset3'),
              t('land.tgSimPreset4'),
            ].map((presetText) => (
              <button
                key={presetText}
                type="button"
                onClick={() => handleSendText(presetText)}
                className="pressable inline-flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-500/15 dark:text-sky-300 transition"
              >
                <Sparkles className="h-3.5 w-3.5 text-sky-500" />
                {presetText}
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
              <p className="text-sm font-bold leading-none">Tracr Telegram Assistant</p>
              <p className="mt-1 text-xs font-medium text-sky-100 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                {t('land.tgSimBotStatus')}
              </p>
            </div>
          </div>

          {/* Messages Feed */}
          <div ref={chatContainerRef} className="h-80 overflow-y-auto bg-slate-100/50 dark:bg-slate-950/40 p-4 space-y-3 text-sm font-medium">
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
              handleSendText(inputVal)
            }}
            className="flex items-center gap-2 border-t border-border bg-surface p-3"
          >
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder={t('land.tgSimPlaceholder')}
              className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <button
              type="submit"
              disabled={isTyping || !inputVal.trim()}
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
