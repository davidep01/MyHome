import { createElement } from 'react'
import type { LucideIcon, LucideProps } from 'lucide-react'
import { lucideIcon } from '../lib/lucide'

interface Props extends LucideProps {
  name?: string
  fallback: LucideIcon
}

/** Renders a lucide icon resolved by name, falling back to `fallback`. */
export function DynamicIcon({ name, fallback, ...props }: Props) {
  return createElement(lucideIcon(name) ?? fallback, props)
}
