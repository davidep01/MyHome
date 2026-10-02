import type { KnownFace } from '../db/types.js'
import { FACE_DATA_URL_PATTERN, faceImageBudgetError } from './face-limits.js'
import { runBoundedWorker } from './bounded-worker.js'
export async function validateFaceImages(faces: KnownFace[]): Promise<void> {
  const error = faceImageBudgetError(faces)
  if (error) throw new Error(error)
  const images = faces.flatMap((face) => face.images.map((image) => {
    const match = FACE_DATA_URL_PATTERN.exec(image)!
    const bytes = Buffer.from(match[1], 'base64')
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new Error('JPEG del volto non valido o incompleto')
    return bytes
  }))
  if (images.length) await runBoundedWorker('jpeg-worker', images)
}
