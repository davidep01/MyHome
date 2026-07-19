import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../widgets/WidgetGrid', () => ({
  EntityCard: () => <div>camera</div>,
}))

import { CameraMonitoringRow } from './CameraMonitoringRow'

describe('camera monitoring row', () => {
  it('keeps exactly three stable slots even before cameras are discovered', () => {
    const html = renderToStaticMarkup(<CameraMonitoringRow entityIds={[]} />)
    expect(html).toContain('aria-label="Monitoraggio video"')
    expect(html.match(/Camera non configurata/g)).toHaveLength(3)
  })
})
