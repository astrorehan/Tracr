import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useT } from '@/features/settings/language-context'
import { STARTERS } from './api'
import { AiAvatar, ChatSheet, type ChatSheetHandle } from './AiChat'

/**
 * Home-screen launcher for the assistant: a gradient-rimmed card that opens
 * the chat sheet, plus quick-question chips that open it already asked.
 * `/?chat=1` (settings shortcut) renders the sheet open; closing cleans the
 * param back out of the URL.
 */
export function AiHomeCard() {
  const { t } = useT()
  const [opened, setOpened] = useState(false)
  const [params, setParams] = useSearchParams()
  const sheet = useRef<ChatSheetHandle>(null)

  const deepLinked = params.get('chat') === '1'
  const open = opened || deepLinked

  function close() {
    setOpened(false)
    if (deepLinked) {
      const next = new URLSearchParams(params)
      next.delete('chat')
      setParams(next, { replace: true })
    }
  }

  return (
    <>
      <section className="ai-rim card-surface relative overflow-hidden rounded-[20px]">
        {/* Soft brand glow in the corner — atmosphere, not information. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-primary/10 blur-2xl"
        />

        <button
          type="button"
          onClick={() => setOpened(true)}
          className="relative flex w-full items-center gap-3 p-4 text-left"
        >
          <span className="relative shrink-0">
            <AiAvatar className="h-12 w-12 rounded-2xl" iconClassName="h-6 w-6" />
            {/* "Ready" dot */}
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-surface bg-positive"
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="text-[15px] font-extrabold text-foreground">{t('ai.assistant')}</span>
              <span className="rounded-md bg-primary-soft px-1.5 py-px text-[10px] font-extrabold tracking-wide text-primary">
                AI
              </span>
            </span>
            <span className="mt-0.5 block truncate text-[13px] font-medium text-muted-foreground">
              {t('ai.launcherDesc')}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </button>

        {/* Quick questions — tap to open the chat already asked. */}
        <div className="relative overflow-hidden pb-4 mx-4 group">
          <div className="pointer-events-none absolute left-0 top-0 bottom-4 z-20 w-8 bg-gradient-to-r from-surface to-transparent" />
          <div className="pointer-events-none absolute right-0 top-0 bottom-4 z-20 w-8 bg-gradient-to-l from-surface to-transparent" />
          
          <div className="flex w-max animate-marquee group-hover:[animation-play-state:paused]">
            {[0, 1].map((setIndex) => (
              <div key={setIndex} className="flex gap-2 pr-2">
                {STARTERS.slice(0, 3).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setOpened(true)
                      sheet.current?.ask(t(k))
                    }}
                    className="pressable shrink-0 rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-primary-soft/50"
                  >
                    {t(k)}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <ChatSheet ref={sheet} open={open} onClose={close} />
    </>
  )
}
