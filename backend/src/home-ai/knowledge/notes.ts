import { KnowledgeNoteInputSchema, type KnowledgeFact, type KnowledgeNoteInput } from '../domain/contracts.js'
import { CoreError } from '../domain/errors.js'
import { newId } from '../domain/ids.js'
import { looksLikeSecret } from '../domain/secret-patterns.js'
import { parse } from '../domain/schema.js'
import type { Clock } from '../domain/time.js'
import { CoreStore, json } from '../storage/db.js'

/**
 * Manuale della casa — note scritte dall'utente: ciò che i sensori non
 * possono sapere ("il cane dorme in cucina", "a luglio siamo via").
 *
 * - Testo trattato come dato: niente markup interpretato, niente controlli.
 * - Niente credenziali: una nota che sembra contenere un token o una password
 *   viene rifiutata, non "ripulita" in silenzio.
 * - Scope personale solo con il consenso ai profili personali.
 * - Demo e casa reale separate; l'oblio "tutto" e quello per persona le
 *   cancellano (privacy/service.ts).
 */

export const MAX_NOTES = 200

const SECRET_HINT = /\b(token|password|passwd|pwd|api[\s_-]?key|secret|bearer)\b\s*[:=]/i

export interface StoredNote extends KnowledgeNoteInput { note_id: string; revision: number; demo: boolean; created_at: string; updated_at: string }

function clean(text: string): string {
  return text.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim()
}

export class KnowledgeNotes {
  constructor(private readonly store: CoreStore, private readonly clock: Clock) {}

  private validate(raw: unknown, personalAllowed: boolean): KnowledgeNoteInput {
    const parsed = parse(KnowledgeNoteInputSchema, raw)
    if (!parsed.ok) throw new CoreError('VALIDATION_ERROR', 'Nota non valida.', parsed.issues.map((issue) => `${issue.path}: ${issue.message}`))
    const input = { ...parsed.value, title: clean(parsed.value.title), statement: clean(parsed.value.statement) }
    if (!input.title || !input.statement) throw new CoreError('VALIDATION_ERROR', 'Titolo e testo non possono essere vuoti.')
    for (const text of [input.title, input.statement]) {
      if (SECRET_HINT.test(text) || looksLikeSecret(text)) {
        throw new CoreError('VALIDATION_ERROR', 'La nota sembra contenere una credenziale: il manuale non deve mai contenerne.')
      }
    }
    if (input.subject_id && !personalAllowed) {
      throw new CoreError('FORBIDDEN_SCOPE', 'Le note su una persona richiedono il consenso ai profili personali.')
    }
    if (input.valid_from && input.valid_until && Date.parse(input.valid_until) <= Date.parse(input.valid_from)) {
      throw new CoreError('VALIDATION_ERROR', 'La fine della validità deve venire dopo l’inizio.')
    }
    return input
  }

  list(opts: { demo: boolean; includePersonal: boolean }): StoredNote[] {
    return this.store.all('SELECT body FROM knowledge_notes WHERE demo = ? ORDER BY created_at, note_id', opts.demo ? 1 : 0)
      .map((row) => json<StoredNote>(row.body))
      .filter((note) => opts.includePersonal || !note.subject_id)
  }

  get(noteId: string): StoredNote | null {
    const row = this.store.get('SELECT body FROM knowledge_notes WHERE note_id = ?', noteId)
    return row ? json<StoredNote>(row.body) : null
  }

  create(raw: unknown, opts: { demo: boolean; personalAllowed: boolean }): StoredNote {
    const input = this.validate(raw, opts.personalAllowed)
    const count = Number(this.store.get('SELECT COUNT(*) AS n FROM knowledge_notes WHERE demo = ?', opts.demo ? 1 : 0)?.n ?? 0)
    if (count >= MAX_NOTES) throw new CoreError('VALIDATION_ERROR', `Massimo ${MAX_NOTES} note nel manuale.`)
    const at = this.clock.now().toISOString()
    const note: StoredNote = { ...input, note_id: newId('note'), revision: 1, demo: opts.demo, created_at: at, updated_at: at }
    this.store.run('INSERT INTO knowledge_notes (note_id, revision, subject_id, demo, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      note.note_id, note.revision, note.subject_id, note.demo ? 1 : 0, JSON.stringify(note), at, at)
    return note
  }

  update(noteId: string, raw: unknown, expectedRevision: number, opts: { personalAllowed: boolean }): StoredNote {
    const current = this.get(noteId)
    if (!current) throw new CoreError('NOT_FOUND', 'Nota non trovata.')
    if (current.revision !== expectedRevision) throw new CoreError('REVISION_CONFLICT', 'La nota è stata modificata nel frattempo: ricarica.')
    if (current.subject_id && !opts.personalAllowed) throw new CoreError('FORBIDDEN_SCOPE', 'Nota personale non modificabile senza il consenso ai profili personali.')
    const input = this.validate(raw, opts.personalAllowed)
    const at = this.clock.now().toISOString()
    const next: StoredNote = { ...current, ...input, revision: current.revision + 1, updated_at: at }
    this.store.run('UPDATE knowledge_notes SET revision = ?, subject_id = ?, body = ?, updated_at = ? WHERE note_id = ?',
      next.revision, next.subject_id, JSON.stringify(next), at, noteId)
    return next
  }

  remove(noteId: string, opts: { personalAllowed: boolean }): void {
    const current = this.get(noteId)
    if (!current) throw new CoreError('NOT_FOUND', 'Nota non trovata.')
    if (current.subject_id && !opts.personalAllowed) throw new CoreError('FORBIDDEN_SCOPE', 'Nota personale non eliminabile senza il consenso ai profili personali.')
    this.store.run('DELETE FROM knowledge_notes WHERE note_id = ?', noteId)
  }
}

/** Una nota diventa un fatto del manuale come gli altri, con origine "user". */
export function noteToFact(note: StoredNote): KnowledgeFact {
  return {
    schema_version: 1,
    fact_id: note.note_id,
    kind: 'note',
    origin: 'user',
    source: { module: 'user', ref: note.note_id },
    title: note.title,
    statement: note.statement,
    tags: note.tags,
    entity_ids: note.entity_ids,
    scope: note.subject_id ? { kind: 'person', subject_id: note.subject_id } : { kind: 'household', subject_id: null },
    confidence: 'declared',
    valid_from: note.valid_from,
    valid_until: note.valid_until,
    updated_at: note.updated_at,
    revision: note.revision,
    demo: note.demo,
  }
}
