import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AddonUpdateScreen } from './AddonUpdateOverlay'

describe('schermata di aggiornamento del kiosk', () => {
  it('resta invisibile quando non sta aggiornando', () => {
    expect(renderToStaticMarkup(
      <AddonUpdateScreen phase="idle" percentage={null} />,
    )).toBe('')
  })

  it('dice che sta aggiornando, con versioni e percentuale reale', () => {
    const html = renderToStaticMarkup(
      <AddonUpdateScreen phase="updating" percentage={42} installedVersion="2.2.105" latestVersion="2.2.108" />,
    )
    expect(html).toContain('Aggiornamento in corso')
    expect(html).toContain('Non spegnere il tablet')
    expect(html).toContain('42%')
    expect(html).toContain('2.2.105')
    expect(html).toContain('2.2.108')
  })

  it('non inventa una percentuale quando HA non la riporta', () => {
    const html = renderToStaticMarkup(
      <AddonUpdateScreen phase="updating" percentage={null} />,
    )
    expect(html).toContain('Aggiornamento in corso')
    expect(html).not.toMatch(/\d+%/)
  })

  it('durante il riavvio spiega che il servizio sta tornando, non che è guasto', () => {
    const html = renderToStaticMarkup(
      <AddonUpdateScreen phase="restarting" percentage={null} />,
    )
    expect(html).toContain('Aggiornamento in corso')
    expect(html).toContain('si sta riavviando')
  })

  it('a fine aggiornamento annuncia la ricarica', () => {
    const html = renderToStaticMarkup(
      <AddonUpdateScreen phase="done" percentage={100} />,
    )
    expect(html).toContain('Aggiornamento completato')
    expect(html).toContain('Ricarico la dashboard')
    // Niente barra di avanzamento quando non c'è più nulla da attendere.
    expect(html).not.toContain('100%')
  })
})
