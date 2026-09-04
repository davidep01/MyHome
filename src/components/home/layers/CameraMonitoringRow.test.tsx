import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../widgets/WidgetGrid', () => ({
  EntityCard: () => <div>camera</div>,
}))

import { CameraMonitoringRow } from './CameraMonitoringRow'

describe('camera monitoring row', () => {
  it('renders nothing but the section shell when no camera is configured', () => {
    const html = renderToStaticMarkup(<CameraMonitoringRow entityIds={[]} />)
    expect(html).toContain('aria-label="Monitoraggio video"')
    expect(html).not.toContain('Camera non configurata')
    expect(html.match(/camera</g)).toBeNull()
  })

  it('renders exactly one card for one configured camera, no placeholder for the rest', () => {
    const html = renderToStaticMarkup(<CameraMonitoringRow entityIds={['camera.ingresso']} />)
    expect(html.match(/camera</g)).toHaveLength(1)
    expect(html).not.toContain('Camera non configurata')
  })

  it('caps at three cards even with more cameras configured', () => {
    const html = renderToStaticMarkup(<CameraMonitoringRow entityIds={['camera.a', 'camera.b', 'camera.c', 'camera.d']} />)
    expect(html.match(/camera</g)).toHaveLength(3)
  })
})
