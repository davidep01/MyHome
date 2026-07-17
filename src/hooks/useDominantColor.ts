import { useEffect, useState } from 'react'

const cache = new Map<string, string | null>()

/**
 * Colore dominante di una copertina (§9.4): media dei pixel via canvas 1×1.
 * Funziona perché le copertine passano dal proxy same-origin (`/api/ha/image`),
 * quindi il canvas non è tainted. Il colore viene scurito quel tanto che basta
 * a reggere come accent su vetro chiaro. Cache per URL; il valore si legge in
 * render, l'effect si limita a riempire la cache in asincrono.
 */
export function useDominantColor(url?: string): string | undefined {
  const [, bump] = useState(0)

  useEffect(() => {
    if (!url || cache.has(url)) return
    let cancelled = false
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      if (cancelled) return
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 1
        canvas.height = 1
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) throw new Error('no 2d context')
        ctx.drawImage(img, 0, 0, 1, 1)
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
        // Su parchment un colore troppo chiaro sparisce: si scurisce verso una
        // luminanza leggibile mantenendo la tinta.
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
        const k = luma > 150 ? 150 / luma : 1
        cache.set(url, `#${[r, g, b].map((v) => Math.round(v * k).toString(16).padStart(2, '0')).join('')}`)
      } catch {
        cache.set(url, null)
      }
      bump((n) => n + 1)
    }
    img.onerror = () => {
      if (cancelled) return
      cache.set(url, null)
      bump((n) => n + 1)
    }
    img.src = url
    return () => { cancelled = true }
  }, [url])

  return url ? cache.get(url) ?? undefined : undefined
}
