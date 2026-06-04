import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { TextSizeContext, TEXT_SIZES, type TextSize } from './text-size-context'

const PX = Object.fromEntries(TEXT_SIZES.map((s) => [s.value, s.px])) as Record<TextSize, number>

function getInitialSize(): TextSize {
  const stored = localStorage.getItem('text-size')
  if (stored === 'sm' || stored === 'md' || stored === 'lg' || stored === 'xl') return stored
  return 'md'
}

export function TextSizeProvider({ children }: { children: ReactNode }) {
  const [size, setSizeState] = useState<TextSize>(getInitialSize)

  useEffect(() => {
    document.documentElement.style.fontSize = `${PX[size]}px`
    localStorage.setItem('text-size', size)
  }, [size])

  const setSize = useCallback((s: TextSize) => setSizeState(s), [])

  return <TextSizeContext.Provider value={{ size, setSize }}>{children}</TextSizeContext.Provider>
}
