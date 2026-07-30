import { createContext, useContext } from 'react'

export interface AiApi {
  /** Open the assistant. Pass a question to send it straight away. */
  open: (question?: string) => void
  close: () => void
  isOpen: boolean
}

export const AiContext = createContext<AiApi | null>(null)

export function useAi(): AiApi {
  const ctx = useContext(AiContext)
  if (!ctx) throw new Error('useAi must be used within an AiProvider')
  return ctx
}
