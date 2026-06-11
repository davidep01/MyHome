/**
 * Prepara una foto-volto per `config.ai.faces`: ridimensiona a max 512px sul
 * lato lungo e serializza in JPEG data URL. Il resize avviene QUI, lato client,
 * così il documento di config resta piccolo (~50-80KB a foto).
 */
export async function fileToFaceDataUrl(file: File, maxSide = 512): Promise<string> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas non disponibile')
    ctx.drawImage(bitmap, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', 0.82)
  } finally {
    bitmap.close()
  }
}
