import type { HTMLAttributes } from 'react'
import { cn } from '@/utils'

type HeadingLevel = 1 | 2 | 3

const headingClass: Record<HeadingLevel, string> = {
  1: 'text-2xl font-semibold tracking-tight text-ink',
  2: 'text-lg font-semibold tracking-tight text-ink',
  3: 'text-sm font-semibold text-ink',
}

interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  level?: HeadingLevel
}

/** Typographic heading. Typography-first design (see the `ui-design` skill). */
export function Heading({ level = 1, className, ...props }: HeadingProps) {
  const Tag = `h${level}` as const
  return <Tag className={cn(headingClass[level], className)} {...props} />
}

interface TextProps extends HTMLAttributes<HTMLParagraphElement> {
  muted?: boolean
}

/** Body text. `muted` for secondary copy. */
export function Text({ muted, className, ...props }: TextProps) {
  return (
    <p
      className={cn('text-sm', muted ? 'text-muted' : 'text-ink-soft', className)}
      {...props}
    />
  )
}
