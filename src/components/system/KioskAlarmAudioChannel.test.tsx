import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { KioskAlarmAudioChannel } from './KioskAlarmAudioChannel'

describe('kiosk static alarm audio', () => {
  it('renders a persistent static autoplay element for Fully Kiosk', () => {
    const html = renderToStaticMarkup(<KioskAlarmAudioChannel active={false} />)
    expect(html).toContain('<audio')
    expect(html).toContain('alarm-siren.wav?v=4')
    // React SSR preserves the JSX property spelling; the browser still emits
    // the standard autoplay attribute when it creates the DOM node.
    expect(html).toContain('autoPlay=""')
    expect(html).toContain('loop=""')
    expect(html).toContain('muted=""')
  })
})
