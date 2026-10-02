import { describe, expect, it } from 'vitest'
import jpeg from 'jpeg-js'
import { faceImageBudgetError, MAX_KNOWN_FACES, MAX_FACE_PHOTOS } from './face-limits.js'
import { validateFaceImages } from './validate-face-images.js'
import { validateConfigPatch } from './config-validation.js'
const image = `data:image/jpeg;base64,${jpeg.encode({ width: 2, height: 2, data: Buffer.alloc(16, 255) }, 70).data.toString('base64')}`
describe('shared face image limits', () => {
  it('accepts all configured people and photos with genuine decodable images', async () => {
    const faces = Array.from({ length: MAX_KNOWN_FACES }, (_, index) => ({ id: `face_${index}`, name: `Persona ${index}`, images: Array(MAX_FACE_PHOTOS).fill(image) as string[] }))
    expect(faceImageBudgetError(faces)).toBeNull()
    expect(validateConfigPatch({ ai: { faces } }).ok).toBe(true)
    await expect(validateFaceImages(faces)).resolves.toBeUndefined()
  })
  it('explains aggregate overflow instead of silently dropping the last references', () => {
    const large = `data:image/jpeg;base64,${'A'.repeat(399972)}`
    const faces = Array.from({ length: 3 }, (_, index) => ({ id: `face_${index}`, name: `Persona ${index}`, images: [large, large, large] }))
    expect(faceImageBudgetError(faces)).toContain('limite totale')
    expect(validateConfigPatch({ ai: { faces } })).toMatchObject({ ok: false, error: expect.stringContaining('limite totale') })
  })
  it('rejects fake JPEG references before save or recognition', async () => {
    await expect(validateFaceImages([{ id: 'fake', name: 'Fake', images: ['data:image/jpeg;base64,AAAA'] }])).rejects.toThrow('JPEG')
  })
})
