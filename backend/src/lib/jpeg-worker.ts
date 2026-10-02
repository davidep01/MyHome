import jpeg from 'jpeg-js'
import { parentPort, workerData } from 'node:worker_threads'

try {
  const images = Array.isArray(workerData) ? workerData as Uint8Array[] : [workerData as Uint8Array]
  for (const bytes of images) {
  const image = jpeg.decode(bytes, {
    tolerantDecoding: false, useTArray: true, formatAsRGBA: false,
    maxResolutionInMP: 4, maxMemoryUsageInMB: 64,
  })
  if (image.width < 1 || image.height < 1) throw new Error('Dimensioni non valide')
  }
  parentPort?.postMessage({ events: true })
} catch {
  parentPort?.postMessage({ error: 'JPEG non valido o troppo grande (massimo 4 megapixel)' })
}
