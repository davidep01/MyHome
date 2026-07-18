export const LIGHT_THEME_COLOR = '#f5f5f7'
export const DARK_THEME_COLOR = '#000000'

export function resolveInitialDark(stored: string | null, prefersDark: boolean): boolean {
  if (stored === 'dark') return true
  if (stored === 'light') return false
  return prefersDark
}

export function applyDarkAppearance(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR)
}

/** Apply the stored/OS appearance before React paints; the ambient sensor may
 * refine Auto mode after mount. */
export function bootstrapAppearance(): void {
  if (typeof window === 'undefined') return
  let stored: string | null = null
  try { stored = localStorage.getItem('myhome.themeMode') } catch { /* private mode */ }
  const prefersDark = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = resolveInitialDark(stored, prefersDark)
  applyDarkAppearance(dark)
}
