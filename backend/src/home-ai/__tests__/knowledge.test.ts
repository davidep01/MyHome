import { describe, expect, it, vi } from 'vitest'
import { KnowledgeFactSchema, type KnowledgeFact } from '../domain/contracts.js'
import { parse } from '../domain/schema.js'
import { createHomeAiRouter } from '../api/routes.js'
import type { HomeAiCore } from '../core.js'
import { selectKnowledge } from '../knowledge/retrieve.js'
import { areaName, tagify } from '../knowledge/generate.js'
import { DEMO_UNTIL, newCore, seededDemo } from './helpers.js'

/**
 * Manuale della casa: base di conoscenza per un futuro modello locale.
 * Si verifica che sia fatta di DATI veri del core (mai inventati), che
 * rispetti privacy e oblio, e che la selezione per il modello sia stabile.
 */

const note = (over: Record<string, unknown> = {}) => ({
  title: 'Il cane', statement: 'Il cane dorme in cucina: niente robot aspirapolvere la notte.', tags: ['cane', 'cucina'],
  entity_ids: [], subject_id: null, valid_from: null, valid_until: null, ...over,
})

function routerFor(core: HomeAiCore, role: 'admin' | 'kiosk' = 'admin') {
  return createHomeAiRouter({
    core: () => core, disabledReason: () => null, role: () => role, authMode: () => 'disabled', haReachable: () => null,
    backups: { list: () => [], create: async () => ({ id: 'x', created_at: '' }), restore: async () => ({ restored_from: 'x', tombstones_reapplied: 0 }), lastRestoreVerifiedAt: () => null },
    candidateEntities: () => [], dashboardEntities: () => [], onConfigChanged: () => undefined,
  })
}

let seq = 0
const send = (router: ReturnType<typeof routerFor>, method: string, path: string, body?: unknown) => router.request(path, {
  method,
  headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `knowledge-${(seq += 1).toString().padStart(6, '0')}` },
  body: body === undefined ? undefined : JSON.stringify(body),
})

describe('manuale della casa — fatti generati', () => {
  it('nasce dai dati del core: casa, stanze, dispositivi, abitudine confermata, raccolta, regole e limiti', async () => {
    const { core } = await seededDemo()
    const facts = core.knowledgeFacts({ includePersonal: false })
    for (const fact of facts) expect(parse(KnowledgeFactSchema, fact).ok, fact.fact_id).toBe(true)
    const kinds = new Set(facts.map((fact) => fact.kind))
    for (const kind of ['home', 'room', 'device', 'habit', 'waste', 'rule', 'limit'] as const) expect(kinds.has(kind), kind).toBe(true)

    const habit = facts.find((fact) => fact.kind === 'habit')!
    expect(habit.statement).toMatch(/in 8 dei 10 rientri serali osservabili/)
    expect(habit.confidence).toBe('observed')
    expect(habit.entity_ids).toEqual(expect.arrayContaining(['light.demo_ingresso', 'light.demo_soggiorno', 'climate.demo_soggiorno']))

    // T22 visto dal manuale: il prossimo organico è martedì 13 ottobre, esposizione dal lunedì sera.
    const organico = facts.find((fact) => fact.title === 'Prossimo ritiro: Organico')!
    expect(organico.statement).toMatch(/martedì 13 ottobre/)
    expect(organico.statement).toMatch(/lunedì 12 ottobre/)
    expect(facts.find((fact) => fact.title === 'Calendario della raccolta')!.statement).toMatch(/dimostrativo/)

    expect(facts.every((fact) => fact.demo)).toBe(true)
    expect(facts.find((fact) => fact.source.ref === 'runtime.physical_execution')!.statement).toMatch(/non comanda dispositivi/)
  }, 60_000)

  it('ID stabili: due generazioni producono gli stessi fatti', async () => {
    const { core } = await seededDemo()
    const a = core.knowledgeFacts({ includePersonal: false }).map((fact) => [fact.fact_id, fact.statement])
    const b = core.knowledgeFacts({ includePersonal: false }).map((fact) => [fact.fact_id, fact.statement])
    expect(b).toEqual(a)
  }, 60_000)

  it('le ipotesi non confermate non entrano; l’abitudine dimenticata sparisce anche dal manuale', async () => {
    const { core } = await seededDemo()
    const supported = core.patterns.list({ demo: true }).filter((p) => p.state === 'supported')
    const candidates = core.patterns.list({ demo: true }).filter((p) => p.state === 'candidate')
    const habitRefs = core.knowledgeFacts({ includePersonal: false }).filter((fact) => fact.kind === 'habit').map((fact) => fact.source.ref)
    expect(habitRefs.sort()).toEqual(supported.map((p) => p.pattern_id).sort())
    for (const candidate of candidates) expect(habitRefs).not.toContain(candidate.pattern_id)

    core.privacy.requestDeletion({ entity_ids: [], subject_id: null, pattern_id: supported[0].pattern_id, before: null, all: false }, 'test')
    core.refreshPatterns()
    expect(core.knowledgeFacts({ includePersonal: false }).some((fact) => fact.source.ref === supported[0].pattern_id)).toBe(false)
  }, 60_000)

  it('una preferenza esplicita diventa un fatto "dichiarato" e sparisce quando la revochi', async () => {
    const { core } = await seededDemo((config) => { config.runtime.mode = 'suggest' })
    const proposal = core.proposals.list({ states: ['visible'], includePersonal: true, limit: 50 }).find((p) => p.agent_key === 'weather')!
    const { preference } = core.proposals.feedback(proposal.proposal_id, 'never_suggest', 'device-admin', proposal.scope, null)
    const fact = core.knowledgeFacts({ includePersonal: false }).find((f) => f.source.ref === preference!.preference_id)!
    expect(fact).toMatchObject({ kind: 'preference', confidence: 'declared', title: 'Da non suggerire' })
    core.proposals.revokePreference(preference!.preference_id, preference!.revision)
    expect(core.knowledgeFacts({ includePersonal: false }).some((f) => f.source.ref === preference!.preference_id)).toBe(false)
  }, 60_000)

  it('casa reale senza dati: solo ciò che è certo, niente abitudini o stanze inventate', async () => {
    const { core } = await newCore('2026-10-12T10:00:00Z', (config) => {
      config.runtime.demo = false
      config.sources.fixtures.enabled = false
      config.sources.weather.adapter = 'none'
    })
    const facts = core.knowledgeFacts({ includePersonal: false })
    expect(facts.filter((fact) => ['habit', 'room', 'device', 'waste', 'preference'].includes(fact.kind))).toEqual([])
    expect(facts.find((fact) => fact.kind === 'home')!.statement).toMatch(/osserva 0 entità/)
    expect(facts.some((fact) => fact.demo)).toBe(false)
  })

  it('nomi delle stanze e token di ricerca senza accenti', () => {
    expect(areaName('demo_soggiorno')).toBe('Soggiorno (demo)')
    expect(areaName('cucina_soggiorno')).toBe('Cucina soggiorno')
    expect(tagify('Più umidità in città!')).toEqual(['piu', 'umidita', 'citta'])
  })
})

describe('manuale della casa — note tue', () => {
  it('crea, modifica con revisione attesa, elimina; demo e casa reale restano separate', async () => {
    const { core } = await seededDemo()
    const created = core.notes.create(note(), { demo: true, personalAllowed: false })
    expect(core.knowledgeFacts({ includePersonal: false }).find((fact) => fact.fact_id === created.note_id)).toMatchObject({ kind: 'note', origin: 'user', confidence: 'declared' })
    expect(() => core.notes.update(created.note_id, note({ title: 'Il cane Rex' }), 99, { personalAllowed: false })).toThrow(/modificata nel frattempo/)
    const updated = core.notes.update(created.note_id, note({ title: 'Il cane Rex' }), 1, { personalAllowed: false })
    expect(updated.revision).toBe(2)
    expect(core.notes.list({ demo: false, includePersonal: true })).toEqual([])
    core.notes.remove(created.note_id, { personalAllowed: false })
    expect(core.notes.list({ demo: true, includePersonal: true })).toEqual([])
  }, 60_000)

  it('rifiuta credenziali, testi troppo lunghi, validità invertita e note personali senza consenso', async () => {
    const { core } = await seededDemo()
    const create = (over: Record<string, unknown>, personalAllowed = false) => () => core.notes.create(note(over), { demo: true, personalAllowed })
    expect(create({ statement: 'Wi-Fi ospiti password: casa1234' })).toThrow(/credenziale/)
    expect(create({ statement: 'token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U' })).toThrow(/credenziale/)
    expect(create({ statement: 'x'.repeat(601) })).toThrow(/non valida/)
    expect(create({ tags: ['Con Spazi'] })).toThrow(/non valida/)
    expect(create({ valid_from: '2026-10-20T00:00:00Z', valid_until: '2026-10-10T00:00:00Z' })).toThrow(/dopo l’inizio/)
    expect(create({ subject_id: 'pseudo-1' })).toThrow(/consenso ai profili/)
    const personal = create({ subject_id: 'pseudo-1' }, true)()
    expect(core.knowledgeFacts({ includePersonal: false }).some((fact) => fact.fact_id === personal.note_id)).toBe(false)
    expect(core.knowledgeFacts({ includePersonal: true }).find((fact) => fact.fact_id === personal.note_id)!.scope).toEqual({ kind: 'person', subject_id: 'pseudo-1' })
  }, 60_000)

  it('il testo ostile resta un dato: niente caratteri di controllo, markup non interpretato', async () => {
    const { core } = await seededDemo()
    const saved = core.notes.create(note({ title: 'Nota\u0007 <b>ostile</b>', statement: '<script>alert(1)</script>\u0000 resta testo' }), { demo: true, personalAllowed: false })
    expect(saved.title).toBe('Nota <b>ostile</b>')
    expect(saved.statement).toBe('<script>alert(1)</script> resta testo')
  }, 60_000)

  it('"Dimentica tutto" cancella le note; l’oblio per persona solo quelle di quella persona', async () => {
    const { core } = await seededDemo()
    core.notes.create(note(), { demo: true, personalAllowed: true })
    const personal = core.notes.create(note({ subject_id: 'pseudo-1' }), { demo: true, personalAllowed: true })
    const bySubject = core.privacy.requestDeletion({ entity_ids: [], subject_id: 'pseudo-1', pattern_id: null, before: null, all: false }, 'test')
    expect(bySubject.removed.notes).toBe(1)
    expect(core.notes.get(personal.note_id)).toBeNull()
    const all = core.privacy.requestDeletion({ entity_ids: [], subject_id: null, pattern_id: null, before: null, all: true }, 'test')
    expect(all.removed.notes).toBe(1)
    expect(core.notes.list({ demo: true, includePersonal: true })).toEqual([])
  }, 60_000)

  it('l’export privacy include le note, quelle personali solo con il consenso', async () => {
    const { core } = await seededDemo()
    core.notes.create(note(), { demo: true, personalAllowed: true })
    core.notes.create(note({ subject_id: 'pseudo-1' }), { demo: true, personalAllowed: true })
    expect((core.privacy.export({ includePersonal: false }).knowledge_notes as unknown[]).length).toBe(1)
    expect((core.privacy.export({ includePersonal: true }).knowledge_notes as unknown[]).length).toBe(2)
  }, 60_000)
})

describe('manuale della casa — cosa riceverebbe il modello', () => {
  const fact = (id: string, over: Partial<KnowledgeFact>): KnowledgeFact => ({
    schema_version: 1, fact_id: id, kind: 'device', origin: 'generated', source: { module: 'catalog', ref: id }, title: id, statement: 'testo',
    tags: [], entity_ids: [], scope: { kind: 'household', subject_id: null }, confidence: 'certain', valid_from: null, valid_until: null,
    updated_at: '2026-10-12T00:00:00Z', revision: 1, demo: false, ...over,
  })
  const limit = fact('limite', { kind: 'limit', source: { module: 'config', ref: 'runtime.physical_execution' }, title: 'Cosa il sistema non fa', statement: 'Non comanda nulla.' })

  it('i limiti vengono sempre per primi; poi i fatti pertinenti, in ordine stabile', () => {
    const facts = [
      fact('b-luce', { tags: ['luce', 'soggiorno'], title: 'Luce soggiorno' }),
      fact('a-organico', { kind: 'waste', tags: ['organico', 'raccolta'], title: 'Prossimo ritiro: Organico' }),
      fact('c-tv', { tags: ['tv'], title: 'TV' }),
      limit,
    ]
    const now = new Date('2026-10-12T10:00:00Z')
    const first = selectKnowledge(facts, { text: 'Quando passa l’organico?', now })
    expect(first.facts.map((f) => f.fact_id)).toEqual(['limite', 'a-organico'])
    expect(first.query_tokens).toEqual(['passa', 'organico'])
    expect(selectKnowledge([...facts].reverse(), { text: 'Quando passa l’organico?', now }).facts.map((f) => f.fact_id)).toEqual(['limite', 'a-organico'])
    // Un'entità esplicita pesa più di una parola.
    expect(selectKnowledge(facts, { text: 'soggiorno', entity_ids: ['media_player.tv'], now }).facts.map((f) => f.fact_id)).toEqual(['limite', 'b-luce'])
  })

  it('budget rispettato, fatti scaduti o non ancora validi esclusi', () => {
    const now = new Date('2026-10-12T10:00:00Z')
    const long = Array.from({ length: 30 }, (_, i) => fact(`f${String(i).padStart(2, '0')}`, { tags: ['luce'], statement: 'x'.repeat(180) }))
    const expired = fact('scaduto', { tags: ['luce'], valid_until: '2026-10-11T00:00:00Z' })
    const future = fact('futuro', { tags: ['luce'], valid_from: '2026-10-20T00:00:00Z' })
    const selection = selectKnowledge([limit, expired, future, ...long], { text: 'luce', budget_chars: 1_000, now })
    expect(selection.chars).toBeLessThanOrEqual(1_000)
    expect(selection.truncated).toBe(true)
    expect(selection.facts.map((f) => f.fact_id)).not.toContain('scaduto')
    expect(selection.facts.map((f) => f.fact_id)).not.toContain('futuro')
  })

  it('sulla demo: "organico" porta il prossimo ritiro, "soggiorno" luci e clima del soggiorno', async () => {
    const { core } = await seededDemo()
    const waste = core.knowledgeSelection({ text: 'quando devo portare fuori l’organico' }, { includePersonal: false })
    expect(waste.facts[0].source.ref).toBe('runtime.physical_execution')
    expect(waste.facts[1].title).toBe('Prossimo ritiro: Organico')
    const living = core.knowledgeSelection({ text: 'soggiorno' }, { includePersonal: false })
    expect(living.facts.flatMap((f) => f.entity_ids)).toEqual(expect.arrayContaining(['light.demo_soggiorno', 'climate.demo_soggiorno']))
  }, 60_000)
})

describe('manuale della casa — API', () => {
  it('solo la regia: il tablet non legge, non cerca, non esporta e non scrive', async () => {
    const { core } = await seededDemo()
    const kiosk = routerFor(core, 'kiosk')
    for (const [method, path] of [['GET', '/knowledge'], ['GET', '/knowledge/search?q=luce'], ['GET', '/knowledge/export'], ['POST', '/knowledge/notes']] as const) {
      const res = await send(kiosk, method, path, method === 'POST' ? note() : undefined)
      expect(res.status, path).toBe(403)
    }
  }, 60_000)

  it('note via API: creazione idempotente, conflitto di revisione, export senza segreti', async () => {
    const { core } = await seededDemo()
    const router = routerFor(core)
    const key = 'knowledge-same-key-1'
    const once = await router.request('/knowledge/notes', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(note()) })
    const twice = await router.request('/knowledge/notes', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(note()) })
    expect(once.status).toBe(201)
    const created = (await once.json() as { note: { note_id: string } }).note
    expect((await twice.json() as { note: { note_id: string } }).note.note_id).toBe(created.note_id)
    expect(core.notes.list({ demo: true, includePersonal: true })).toHaveLength(1)

    const stale = await send(router, 'PUT', `/knowledge/notes/${created.note_id}`, { note: note({ title: 'Nuovo' }), expected_revision: 7 })
    expect(stale.status).toBe(409)

    vi.stubEnv('HA_TOKEN', 'segreto-ha-di-prova-123456')
    try {
      core.notes.create(note({ title: 'Promemoria', statement: 'Il codice del cancello è nel cassetto (segreto-ha-di-prova-123456 non deve uscire).' }), { demo: true, personalAllowed: false })
    } catch { /* rifiutata come credenziale: comunque non può uscire */ }
    const exported = await routerFor(core).request('/knowledge/export')
    const text = await exported.text()
    vi.unstubAllEnvs()
    expect(exported.status).toBe(200)
    expect(text).not.toContain('segreto-ha-di-prova-123456')
    const body = JSON.parse(text) as { format: string; secrets_included: boolean; facts: KnowledgeFact[] }
    expect(body.format).toBe('home-ai-knowledge/v1')
    expect(body.secrets_included).toBe(false)
    expect(body.facts.some((fact) => fact.fact_id === created.note_id)).toBe(true)
  }, 60_000)

  it('via API una nota con il token HA scritto per errore viene rifiutata', async () => {
    const { core } = await seededDemo()
    vi.stubEnv('HA_TOKEN', 'abcdefghij-token-letterale-ha')
    try {
      const res = await send(routerFor(core), 'POST', '/knowledge/notes', note({ statement: 'Ricorda abcdefghij-token-letterale-ha per il tablet' }))
      expect(res.status).toBe(400)
      expect(core.notes.list({ demo: true, includePersonal: true })).toEqual([])
    } finally {
      vi.unstubAllEnvs()
    }
  }, 60_000)

  it('la ricerca rispetta il budget richiesto e resta entro il massimo', async () => {
    const { core } = await seededDemo()
    const res = await routerFor(core).request('/knowledge/search?q=soggiorno&budget=500')
    const selection = await res.json() as { chars: number; budget: number }
    expect(selection.budget).toBe(500)
    expect(selection.chars).toBeLessThanOrEqual(500)
    const huge = await (await routerFor(core).request('/knowledge/search?q=soggiorno&budget=999999')).json() as { budget: number }
    expect(huge.budget).toBe(12_000)
  }, 60_000)

  it('il manuale non apre nessun percorso verso il modello o verso Home Assistant', async () => {
    const fetchSpy = vi.fn(async () => { throw new Error('rete bloccata') })
    vi.stubGlobal('fetch', fetchSpy)
    try {
      const { core } = await seededDemo()
      const router = routerFor(core)
      await router.request('/knowledge')
      await router.request('/knowledge/search?q=luce')
      await router.request('/knowledge/export')
      await send(router, 'POST', '/knowledge/notes', note())
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(core.reasoner.capabilities().available).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
    expect(DEMO_UNTIL.toISOString()).toBe('2026-10-12T19:00:00.000Z')
  }, 60_000)
})
