import { describe, expect, it } from 'vitest'
import {
  applyHysteresis,
  composeHome,
  EMPTY_HYSTERESIS,
  type ComposerEntity,
  type HeroSlot,
} from './composer'

const DAY = new Date('2026-06-10T15:00:00')
const NIGHT = new Date('2026-06-10T23:30:00')

function e(id: string, state: string, attributes: Record<string, unknown> = {}, lastChanged = '2026-06-10T14:00:00Z'): ComposerEntity {
  return { entity_id: id, state, attributes, last_changed: lastChanged }
}

describe('composeHome', () => {
  it('quiet quando non succede niente', () => {
    const out = composeHome([e('light.salotto', 'off'), e('sensor.temp', '21')], { now: DAY })
    expect(out.quiet).toBe(true)
    expect(out.hero).toEqual([])
    expect(out.alerts).toEqual([])
  })

  it('ordina per priorità: allarme > media > clima > robot > luci', () => {
    const out = composeHome([
      e('light.salotto', 'on'),
      e('vacuum.robot', 'cleaning'),
      e('climate.casa', 'heat', { hvac_action: 'heating' }),
      e('media_player.tv', 'playing'),
      e('alarm_control_panel.casa', 'triggered'),
    ], { now: DAY })
    expect(out.hero.map((s) => s.key)).toEqual([
      'alarm_control_panel.casa',
      'media_player.tv',
      'climate.casa',
      'vacuum.robot',
      'light.salotto',
    ])
    expect(out.quiet).toBe(false)
  })

  it('clima fermo (niente hvac_action attiva) non entra nell\'Adesso', () => {
    const out = composeHome([e('climate.casa', 'heat', { hvac_action: 'idle' })], { now: DAY })
    expect(out.hero).toEqual([])
  })

  it('aggrega le luci accese per area in una card-gruppo', () => {
    const areaNameOf = (id: string) => (id.includes('salotto') ? 'Salotto' : undefined)
    const out = composeHome([
      e('light.salotto_1', 'on'),
      e('light.salotto_2', 'on'),
    ], { now: DAY, areaNameOf })
    expect(out.hero).toHaveLength(1)
    expect(out.hero[0].group).toEqual({ label: 'Luci Salotto', entityIds: ['light.salotto_1', 'light.salotto_2'] })
    expect(out.hero[0].reason).toBe('2 luci accese')
  })

  it('una sola luce accesa resta card singola', () => {
    const out = composeHome([e('light.cucina', 'on')], { now: DAY })
    expect(out.hero[0].entityId).toBe('light.cucina')
    expect(out.hero[0].group).toBeUndefined()
  })

  it('serratura sbloccata: warn di giorno, P0+danger di notte', () => {
    const day = composeHome([e('lock.ingresso', 'unlocked')], { now: DAY })
    expect(day.hero).toEqual([]) // di giorno non occupa l'Adesso
    expect(day.alerts[0]).toMatchObject({ id: 'locks', severity: 'warn' })

    const night = composeHome([e('lock.ingresso', 'unlocked')], { now: NIGHT })
    expect(night.hero[0]).toMatchObject({ priority: 0, entityId: 'lock.ingresso' })
    expect(night.alerts[0]).toMatchObject({ id: 'locks', severity: 'danger' })
  })

  it('conta le aperture aperte nelle chip', () => {
    const out = composeHome([
      e('binary_sensor.finestra', 'on', { device_class: 'window' }),
      e('binary_sensor.porta', 'on', { device_class: 'door' }),
      e('binary_sensor.movimento', 'on', { device_class: 'motion' }), // non è un'apertura
    ], { now: DAY })
    expect(out.alerts).toHaveLength(1)
    expect(out.alerts[0]).toMatchObject({ id: 'openings', label: '2 aperture aperte' })
  })

  it('è deterministico: stesso input → stesso output (tie-break per entity_id)', () => {
    const input = [
      e('media_player.b', 'playing', {}, '2026-06-10T14:00:00Z'),
      e('media_player.a', 'playing', {}, '2026-06-10T14:00:00Z'),
    ]
    const a = composeHome(input, { now: DAY })
    const b = composeHome([...input].reverse(), { now: DAY })
    expect(a.hero.map((s) => s.key)).toEqual(b.hero.map((s) => s.key))
    expect(a.hero[0].key).toBe('media_player.a')
  })

  it('rispetta maxHero', () => {
    const many = Array.from({ length: 10 }, (_, i) => e(`media_player.p${i}`, 'playing'))
    const out = composeHome(many, { now: DAY, maxHero: 4 })
    expect(out.hero).toHaveLength(4)
  })
})

describe('applyHysteresis', () => {
  const slot = (key: string, priority: HeroSlot['priority'] = 4): HeroSlot => ({ key, priority, entityId: key, reason: 'test' })
  const T = 1_000_000

  it('una card appena entrata resta anche se la condizione svanisce (dwell 45s)', () => {
    const first = applyHysteresis([], [slot('light.a')], EMPTY_HYSTERESIS, T)
    expect(first.hero.map((s) => s.key)).toEqual(['light.a'])

    // 10s dopo la luce è spenta (sparita dai candidati) → resta visibile
    const second = applyHysteresis(first.hero, [], first.state, T + 10_000)
    expect(second.hero.map((s) => s.key)).toEqual(['light.a'])

    // 50s dopo l'ingresso → può uscire
    const third = applyHysteresis(second.hero, [], second.state, T + 50_000)
    expect(third.hero).toEqual([])
  })

  it('max uno scambio ogni 30s quando la home è piena', () => {
    const full = [slot('a'), slot('b'), slot('c')]
    const st = { enteredAt: { a: 0, b: 0, c: 0 }, lastSwapAt: T - 1000 }
    // home già a 3 card (soglia spazio-libero) e swap recente → 'd' aspetta
    const out = applyHysteresis(full, [...full, slot('d')], st, T)
    expect(out.hero.map((s) => s.key)).toEqual(['a', 'b', 'c'])

    // budget maturato → 'd' entra
    const later = applyHysteresis(full, [...full, slot('d')], st, T + 31_000)
    expect(later.hero.map((s) => s.key)).toContain('d')
  })

  it('la priorità 0 entra subito, sempre', () => {
    const full = [slot('a'), slot('b'), slot('c')]
    const st = { enteredAt: { a: 0, b: 0, c: 0 }, lastSwapAt: T - 1000 }
    const out = applyHysteresis(full, [...full, slot('alarm', 0)], st, T)
    expect(out.hero[0].key).toBe('alarm')
  })

  it('aggiorna i membri di una card che resta (stesso key)', () => {
    const prev = [{ ...slot('lights:Salotto'), group: { label: 'Luci Salotto', entityIds: ['light.a'] }, entityId: undefined }]
    const next = [{ ...slot('lights:Salotto'), group: { label: 'Luci Salotto', entityIds: ['light.a', 'light.b'] }, entityId: undefined }]
    const out = applyHysteresis(prev, next, { enteredAt: { 'lights:Salotto': 0 }, lastSwapAt: 0 }, T)
    expect(out.hero[0].group?.entityIds).toEqual(['light.a', 'light.b'])
  })
})
