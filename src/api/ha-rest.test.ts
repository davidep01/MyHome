import { describe, expect, it } from 'vitest'
import { getCameraPreviewEntityId, toProxiedHlsUrl } from './ha-rest'

describe('camera transport helpers', () => {
  it('uses the Ring snapshot companion for a native live-view entity', () => {
    expect(getCameraPreviewEntityId('camera.entrata_live_view')).toBe('camera.entrata_snapshot')
    expect(getCameraPreviewEntityId('camera.giardino_cam')).toBe('camera.giardino_cam')
  })

  it('keeps HLS on the authenticated same-origin proxy', () => {
    expect(toProxiedHlsUrl('/api/hls/token/master.m3u8')).toBe('/api/ha/hls/token/master.m3u8')
  })
})
