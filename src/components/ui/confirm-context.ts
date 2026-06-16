import { createContext, useContext } from 'react'

export interface ConfirmOptions {
  title: string
  /** Optional supporting line under the title. */
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  /** `danger` paints the confirm button red and focuses Cancel by default. */
  tone?: 'default' | 'danger'
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

export const ConfirmContext = createContext<ConfirmFn | null>(null)

/** Returns an async `confirm(opts) => Promise<boolean>` rendered as a styled,
 *  in-app dialog instead of the browser's native `window.confirm`. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within <ConfirmProvider>')
  return ctx
}
