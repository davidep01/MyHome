/** Returns a trimmed provider key only when it is safe and actually usable. */
export function validProviderKey(value: string | undefined, maxLength: number): string | null {
  const key = value?.trim() ?? ''
  if (!key || key.startsWith('your_') || key.length > maxLength || /\s/.test(key)) return null
  return key
}

export function configuredIntegrations() {
  return {
    gemini: Boolean(validProviderKey(process.env.GEMINI_API_KEY, 512)),
    openweather: Boolean(validProviderKey(process.env.OPENWEATHER_API_KEY, 256)),
  }
}
