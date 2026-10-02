/** Shared by config validation, browser uploads and Gemini reference building. */
export const MAX_KNOWN_FACES = 8
export const MAX_FACE_PHOTOS = 3
export const MAX_FACE_DATA_URL_LENGTH = 400_000
export const MAX_FACE_TOTAL_DATA_URL_LENGTH = 2_500_000
export const FACE_DATA_URL_PATTERN = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/
export function faceImageBudgetError(faces: readonly { images: readonly string[] }[]): string | null {
  let total = 0
  for (const face of faces) {
    for (const image of face.images) {
      if (image.length > MAX_FACE_DATA_URL_LENGTH) return 'Foto del volto troppo grande: riduci la risoluzione.'
      const match = FACE_DATA_URL_PATTERN.exec(image)
      if (!match || match[1].length % 4 !== 0) return 'Foto del volto non valida: usa un JPEG.'
      total += image.length
      if (total > MAX_FACE_TOTAL_DATA_URL_LENGTH) return 'Le foto dei volti superano il limite totale di 2,5 MB. Rimuovi o riduci una foto.'
    }
  }
  return null
}
