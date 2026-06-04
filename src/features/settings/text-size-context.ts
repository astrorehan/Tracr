import { createContext, useContext } from 'react'

export type TextSize = 'sm' | 'md' | 'lg' | 'xl'

/** Root font-size (px) per step. Tailwind sizes are rem-based, so changing the
   root scales all text and spacing proportionally. 'md' (17px) is the default —
   a touch larger than the browser-standard 16px for comfier reading. */
export const TEXT_SIZES: { value: TextSize; label: string; px: number }[] = [
  { value: 'sm', label: 'Small', px: 16 },
  { value: 'md', label: 'Default', px: 17 },
  { value: 'lg', label: 'Large', px: 18 },
  { value: 'xl', label: 'Larger', px: 19 },
]

export interface TextSizeCtx {
  size: TextSize
  setSize: (s: TextSize) => void
}

export const TextSizeContext = createContext<TextSizeCtx | undefined>(undefined)

export function useTextSize() {
  const ctx = useContext(TextSizeContext)
  if (!ctx) throw new Error('useTextSize must be used within a TextSizeProvider')
  return ctx
}
