import { icons, type LucideIcon } from 'lucide-react'

/**
 * Resolves a lucide icon by name (accepts kebab/snake/space, e.g. "garage-door").
 * Returns undefined if not found, so callers can fall back to a default.
 */
export function lucideIcon(name?: string): LucideIcon | undefined {
  if (!name) return undefined
  const pascal = name
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join('')
  return (icons as Record<string, LucideIcon>)[pascal]
}

/** True if a lucide icon exists for this name (for previews/validation). */
export function iconExists(name?: string): boolean {
  return Boolean(lucideIcon(name))
}
