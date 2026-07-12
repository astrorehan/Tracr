import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean
}

export function Card({ className, hoverable = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'card-surface rounded-[20px] p-5',
        hoverable && 'card-hover active:scale-[0.99]',
        className,
      )}
      {...props}
    />
  )
}
