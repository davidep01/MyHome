import { describe, expect, it } from 'vitest'
import { bentoCardSize, bentoLayout, isEntityActive, MAX_SURFACED, rankBentoEntities, settleBentoOrder, SURFACE_RECENT_MS, surfacedEntityIds } from './bentoHome'

describe('bentoLayout', () => {
  it('satura sempre la griglia: area delle tessere = colonne × righe', () => {
    for (let n = 1; n <= 30; n++) {
      const layout = bentoLayout(n)
      expect(layout.spans).toHaveLength(n)
      expect(layout.spans.reduce((a, b) => a + b, 0)).toBe(layout.cols * layout.rows)
      expect(Math.max(...layout.spans)).toBeLessThanOrEqual(layout.cols)
    }
  })

  it('meno card → card più grandi', () => {
    expect(bentoCardSize(1, bentoLayout(1))).toBe('L')
    expect(bentoLayout(2).spans.map((s) => bentoCardSize(s, bentoLayout(2)))).toEqual(['XL', 'XL'])
    const three = bentoLayout(3)
    expect(three.spans.map((s) => bentoCardSize(s, three))).toEqual(['XL', 'M', 'M'])
  })

  it('da 3 card in su la prima (la più pesante) è sempre più grande delle altre', () => {
    for (let n = 3; n <= 20; n++) {
      const layout = bentoLayout(n)
      expect(layout.spans[0]).toBe(2)
      expect(layout.spans.at(-1)).toBe(1)
    }
  })

  it('zero card → griglia vuota', () => {
    expect(bentoLayout(0).spans).toEqual([])
  })
})

describe('rankBentoEntities', () => {
  const names: Record<string, string> = { 'light.b': 'Sala', 'light.a': 'Cucina', 'sensor.t': 'Temp', 'climate.c': 'Clima' }
  const nameOf = (id: string) => names[id]

  it('senza uso né attività ordina per categoria e nome', () => {
    expect(rankBentoEntities(['sensor.t', 'light.b', 'climate.c', 'light.a'], { nameOf }))
      .toEqual(['climate.c', 'light.a', 'light.b', 'sensor.t'])
  })

  it('le card più usate salgono in cima, anche sopra la categoria', () => {
    const usage: Record<string, number> = { 'sensor.t': 3, 'light.b': 1.2 }
    expect(rankBentoEntities(['sensor.t', 'light.b', 'climate.c', 'light.a'], { nameOf, usageOf: (id) => usage[id] ?? 0 }))
      .toEqual(['sensor.t', 'light.b', 'climate.c', 'light.a'])
  })

  it('ciò che è in funzione adesso pesa come un paio di tocchi', () => {
    expect(rankBentoEntities(['climate.c', 'light.b'], { nameOf, activeOf: (id) => id === 'light.b' }))
      .toEqual(['light.b', 'climate.c'])
  })
})

describe('settleBentoOrder', () => {
  it('mentre usi la home non rimescola: tiene il posto e accoda le nuove', () => {
    expect(settleBentoOrder(['a', 'b', 'c'], ['c', 'd', 'a'], false)).toEqual(['a', 'c', 'd'])
  })
  it('a home ferma applica l’ordine calcolato', () => {
    expect(settleBentoOrder(['a', 'b'], ['b', 'a'], true)).toEqual(['b', 'a'])
  })
})

describe('isEntityActive', () => {
  const e = (entity_id: string, state: string, attributes: Record<string, unknown> = {}) => ({ entity_id, state, attributes })
  it('riconosce i dispositivi in funzione e ignora i sensori passivi', () => {
    expect(isEntityActive(e('light.sala', 'on'))).toBe(true)
    expect(isEntityActive(e('media_player.tv', 'playing'))).toBe(true)
    expect(isEntityActive(e('climate.sala', 'heat', { hvac_action: 'idle' }))).toBe(false)
    expect(isEntityActive(e('climate.sala', 'heat', { hvac_action: 'heating' }))).toBe(true)
    expect(isEntityActive(e('sensor.t', 'on'))).toBe(false)
    expect(isEntityActive(e('cover.tenda', 'open'))).toBe(false)
  })
})

describe('surfacedEntityIds — le card si palesano', () => {
  const NOW = 1_000_000_000
  const e = (entity_id: string, state: string, attributes: Record<string, unknown> = {}) => ({ entity_id, state, attributes })
  const base = {
    nowMs: NOW,
    isConfigured: (id: string) => id === 'light.configurata',
    isExcluded: (id: string) => id === 'switch.diagnostico',
    changedAt: () => undefined as number | undefined,
  }

  it('una luce accesa compare anche se non è nel wizard; spenta e mai cambiata no', () => {
    expect(surfacedEntityIds([e('light.sala', 'on'), e('light.cucina', 'off')], base)).toEqual(['light.sala'])
  })

  it('un cambio di stato appena visto la fa comparire anche se ora è spenta, poi esce dopo 10 minuti', () => {
    const changedAt = () => NOW - 60_000
    expect(surfacedEntityIds([e('light.cucina', 'off')], { ...base, changedAt })).toEqual(['light.cucina'])
    const old = () => NOW - SURFACE_RECENT_MS - 1
    expect(surfacedEntityIds([e('light.cucina', 'off')], { ...base, changedAt: old })).toEqual([])
  })

  it('mai sensori, videocamere, entità escluse o già configurate; porte e finestre sì, movimento no', () => {
    const changedAt = () => NOW - 1_000
    const result = surfacedEntityIds([
      e('sensor.potenza', '30'), e('camera.ingresso', 'streaming'), e('switch.diagnostico', 'on'), e('light.configurata', 'on'),
      e('binary_sensor.porta', 'on', { device_class: 'door' }), e('binary_sensor.movimento', 'on', { device_class: 'motion' }),
      e('light.offline', 'unavailable'),
    ], { ...base, changedAt })
    expect(result).toEqual(['binary_sensor.porta'])
  })

  it('prima i più recenti, al massimo 8', () => {
    const many = Array.from({ length: 12 }, (_, i) => e(`light.l${String(i).padStart(2, '0')}`, 'on'))
    const changedAt = (id: string) => NOW - Number(id.slice(-2)) * 1_000
    const result = surfacedEntityIds(many, { ...base, changedAt })
    expect(result).toHaveLength(MAX_SURFACED)
    expect(result[0]).toBe('light.l00')
  })

  it('il clima in idle non conta come acceso; un riavvio di HA (nessun cambio visto) non fa comparire nulla', () => {
    expect(surfacedEntityIds([e('climate.sala', 'heat', { hvac_action: 'idle' })], base)).toEqual([])
    expect(surfacedEntityIds([e('climate.sala', 'heat', { hvac_action: 'heating' })], base)).toEqual(['climate.sala'])
    expect(surfacedEntityIds([e('switch.x', 'off'), e('cover.y', 'closed')], base)).toEqual([])
  })
})
