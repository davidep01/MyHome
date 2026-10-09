import type { KnowledgeFact } from '../domain/contracts.js'
import { tagify } from './generate.js'

/**
 * Selezione dei fatti da dare a un modello locale (puro, deterministico).
 *
 * Un modello piccolo ha poco contesto: riceve solo i fatti pertinenti alla
 * domanda, entro un budget di caratteri, e i limiti del sistema sempre per
 * primi. Nessun embedding in questa release: punteggio additivo su tag (3),
 * titolo (2), testo (1) ed entità (5), con ordinamento stabile (stessa
 * domanda → stessa selezione).
 */

export interface KnowledgeQuery {
  text?: string
  entity_ids?: string[]
  now: Date
  /** Caratteri disponibili per i fatti (titolo + testo). */
  budget_chars?: number
}

export interface ScoredFact extends KnowledgeFact { score: number; pinned: boolean }

export interface KnowledgeSelection {
  facts: ScoredFact[]
  chars: number
  budget: number
  truncated: boolean
  query_tokens: string[]
}

export const DEFAULT_BUDGET_CHARS = 2_000
export const MAX_BUDGET_CHARS = 12_000

/** Il limite di esecuzione accompagna sempre il contesto: il modello deve sapere che non può agire. */
const PINNED_REFS = new Set(['runtime.physical_execution'])

const STOPWORDS = new Set([
  'che', 'chi', 'con', 'come', 'cosa', 'dei', 'del', 'della', 'delle', 'dello', 'degli', 'dal', 'dalla', 'dalle', 'nel', 'nella',
  'nelle', 'sul', 'sulla', 'per', 'tra', 'fra', 'una', 'uno', 'gli', 'le', 'non', 'piu', 'quando', 'quale', 'quali', 'sono', 'sei',
  'hai', 'ho', 'devo', 'deve', 'posso', 'puo', 'mio', 'mia', 'miei', 'mie', 'tuo', 'tua', 'casa', 'oggi', 'domani', 'questa', 'questo',
])

const KIND_PRIORITY: Record<KnowledgeFact['kind'], number> = {
  limit: 0, home: 1, rule: 2, preference: 3, habit: 4, waste: 5, note: 6, room: 7, device: 8,
}

function charsOf(fact: KnowledgeFact): number {
  return fact.title.length + fact.statement.length + 2
}

function isValid(fact: KnowledgeFact, now: number): boolean {
  if (fact.valid_from && Date.parse(fact.valid_from) > now) return false
  if (fact.valid_until && Date.parse(fact.valid_until) < now) return false
  return true
}

export function queryTokens(text: string): string[] {
  return [...new Set(tagify(text).filter((token) => !STOPWORDS.has(token)))].slice(0, 24)
}

export function selectKnowledge(all: KnowledgeFact[], query: KnowledgeQuery): KnowledgeSelection {
  const budget = Math.max(200, Math.min(query.budget_chars ?? DEFAULT_BUDGET_CHARS, MAX_BUDGET_CHARS))
  const tokens = queryTokens(query.text ?? '')
  const wanted = new Set(query.entity_ids ?? [])
  const now = query.now.getTime()
  const open = tokens.length === 0 && wanted.size === 0

  const scored: ScoredFact[] = all.filter((fact) => isValid(fact, now)).map((fact) => {
    const pinned = PINNED_REFS.has(fact.source.ref ?? '')
    const tagTokens = new Set(fact.tags.flatMap((tag) => [tag, ...tagify(tag)]))
    const titleTokens = new Set(tagify(fact.title))
    const textTokens = new Set(tagify(fact.statement))
    let score = 0
    for (const token of tokens) {
      // Pesi additivi: una parola presente nei tag, nel titolo E nel testo indica il fatto più specifico
      // (es. "Prossimo ritiro: Organico" batte il calendario che elenca anche l'organico fra le frazioni).
      if (tagTokens.has(token)) score += 3
      if (titleTokens.has(token)) score += 2
      if (textTokens.has(token)) score += 1
    }
    score += fact.entity_ids.filter((id) => wanted.has(id)).length * 5
    return { ...fact, score, pinned }
  })

  const candidates = scored
    .filter((fact) => fact.pinned || open || fact.score > 0)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.score - a.score
      || KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind] || a.fact_id.localeCompare(b.fact_id))

  const facts: ScoredFact[] = []
  let chars = 0
  let truncated = false
  for (const fact of candidates) {
    const size = charsOf(fact)
    if (chars + size > budget) { truncated = true; continue }
    facts.push(fact)
    chars += size
  }
  return { facts, chars, budget, truncated, query_tokens: tokens }
}
