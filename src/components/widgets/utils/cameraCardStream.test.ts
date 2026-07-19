import { describe, expect, it } from 'vitest'
import type { WidgetVisualSize } from '../types'
import { shouldRenderCameraStream } from './cameraCardStream'

describe('camera card live stream sizes', () => {
  it.each<WidgetVisualSize>(['XS', 'S', 'M', 'L', 'XL'])('renders a live camera in size %s', (size) => {
    expect(shouldRenderCameraStream('camera', size, false)).toBe(true)
    expect(shouldRenderCameraStream('doorbell', size, false)).toBe(true)
  })

  it('keeps unavailable cameras and non-camera cards out of the stream renderer', () => {
    expect(shouldRenderCameraStream('camera', 'S', true)).toBe(false)
    expect(shouldRenderCameraStream('media', 'S', false)).toBe(false)
  })
})
