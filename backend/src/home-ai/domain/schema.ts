/**
 * Validatori runtime che esportano JSON Schema (draft 2020-12).
 *
 * La specifica chiede che API, persistenza, fixture e test usino UNA sola
 * definizione. Un tipo TypeScript da solo non valida l'input esterno, e una
 * libreria di validazione sarebbe una dipendenza nuova per poche decine di
 * combinatori: qui ogni schema sa sia validare sia descriversi come JSON
 * Schema (`schemas/*.json` è generato da queste definizioni e un test
 * verifica che i file non divergano).
 *
 * Regole comuni, non disattivabili: oggetti chiusi (proprietà non previste =
 * errore), stringhe sempre con lunghezza massima, numeri finiti.
 */

export interface Issue { path: string; message: string }
export type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: Issue[] }
export type JsonSchema = Record<string, unknown>

export interface Schema<T> {
  readonly json: JsonSchema
  /** true se valido; altrimenti aggiunge gli errori a `issues`. */
  check(value: unknown, path: string, issues: Issue[]): boolean
  readonly _type?: T
}

export type Infer<S> = S extends Schema<infer T> ? T : never

const MAX_ISSUES = 20

function push(issues: Issue[], path: string, message: string): false {
  if (issues.length < MAX_ISSUES) issues.push({ path: path || '$', message })
  return false
}

export function parse<T>(schema: Schema<T>, value: unknown): ParseResult<T> {
  const issues: Issue[] = []
  return schema.check(value, '', issues) ? { ok: true, value: value as T } : { ok: false, issues }
}

// ── Formati ──────────────────────────────────────────────────────────────────

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/
const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export function isLocalDate(value: string): boolean {
  const m = LOCAL_DATE.exec(value)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mo < 1 || mo > 12 || d < 1) return false
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  return d <= days
}

export function isInstant(value: string): boolean {
  return RFC3339.test(value) && Number.isFinite(Date.parse(value)) && isLocalDate(value.slice(0, 10))
}

export function isIanaTimezone(value: string): boolean {
  if (!/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(value) && value !== 'UTC') return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

type StringFormat = 'date-time' | 'date' | 'time' | 'iana-timezone'

const FORMAT_CHECK: Record<StringFormat, (value: string) => boolean> = {
  'date-time': isInstant,
  date: isLocalDate,
  time: (value) => LOCAL_TIME.test(value),
  'iana-timezone': isIanaTimezone,
}

// ── Primitive ────────────────────────────────────────────────────────────────

export function str(opts: { min?: number; max: number; pattern?: RegExp; format?: StringFormat }): Schema<string> {
  const json: JsonSchema = { type: 'string', maxLength: opts.max }
  if (opts.min !== undefined) json.minLength = opts.min
  if (opts.pattern) json.pattern = opts.pattern.source
  if (opts.format) json.format = opts.format
  return {
    json,
    check(value, path, issues) {
      if (typeof value !== 'string') return push(issues, path, 'atteso testo')
      if (value.length > opts.max) return push(issues, path, `massimo ${opts.max} caratteri`)
      if (opts.min !== undefined && value.length < opts.min) return push(issues, path, `minimo ${opts.min} caratteri`)
      if (opts.pattern && !opts.pattern.test(value)) return push(issues, path, 'formato non valido')
      if (opts.format && !FORMAT_CHECK[opts.format](value)) return push(issues, path, `formato ${opts.format} non valido`)
      return true
    },
  }
}

export function num(opts: { min?: number; max?: number; integer?: boolean } = {}): Schema<number> {
  const json: JsonSchema = { type: opts.integer ? 'integer' : 'number' }
  if (opts.min !== undefined) json.minimum = opts.min
  if (opts.max !== undefined) json.maximum = opts.max
  return {
    json,
    check(value, path, issues) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return push(issues, path, 'atteso numero finito')
      if (opts.integer && !Number.isInteger(value)) return push(issues, path, 'atteso intero')
      if (opts.min !== undefined && value < opts.min) return push(issues, path, `minimo ${opts.min}`)
      if (opts.max !== undefined && value > opts.max) return push(issues, path, `massimo ${opts.max}`)
      return true
    },
  }
}

export function bool(): Schema<boolean> {
  return {
    json: { type: 'boolean' },
    check: (value, path, issues) => typeof value === 'boolean' || push(issues, path, 'atteso booleano'),
  }
}

export function nul(): Schema<null> {
  return {
    json: { type: 'null' },
    check: (value, path, issues) => value === null || push(issues, path, 'atteso null'),
  }
}

export function lit<const T extends string | number | boolean>(literal: T): Schema<T> {
  return {
    json: { const: literal },
    check: (value, path, issues) => value === literal || push(issues, path, `atteso ${JSON.stringify(literal)}`),
  }
}

export function enm<const T extends readonly string[]>(values: T): Schema<T[number]> {
  return {
    json: { enum: [...values] },
    check: (value, path, issues) =>
      (typeof value === 'string' && values.includes(value)) || push(issues, path, `valori ammessi: ${values.join(', ')}`),
  }
}

export function nullable<T>(schema: Schema<T>): Schema<T | null> {
  return {
    json: { anyOf: [schema.json, { type: 'null' }] },
    check: (value, path, issues) => value === null || schema.check(value, path, issues),
  }
}

export function anyOf<T extends Schema<unknown>[]>(...schemas: T): Schema<Infer<T[number]>> {
  return {
    json: { anyOf: schemas.map((schema) => schema.json) },
    check(value, path, issues) {
      for (const schema of schemas) if (schema.check(value, path, [])) return true
      return push(issues, path, 'nessuna variante corrisponde')
    },
  }
}

export function arr<T>(item: Schema<T>, opts: { min?: number; max: number; unique?: boolean }): Schema<T[]> {
  const json: JsonSchema = { type: 'array', items: item.json, maxItems: opts.max }
  if (opts.min !== undefined) json.minItems = opts.min
  if (opts.unique) json.uniqueItems = true
  return {
    json,
    check(value, path, issues) {
      if (!Array.isArray(value)) return push(issues, path, 'atteso elenco')
      if (value.length > opts.max) return push(issues, path, `massimo ${opts.max} elementi`)
      if (opts.min !== undefined && value.length < opts.min) return push(issues, path, `minimo ${opts.min} elementi`)
      if (opts.unique && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) {
        return push(issues, path, 'elementi duplicati')
      }
      let ok = true
      value.forEach((entry, index) => { if (!item.check(entry, `${path}[${index}]`, issues)) ok = false })
      return ok
    },
  }
}

/** Valori ammessi in una mappa libera: scalari limitati, mai oggetti annidati. */
export function record<T>(value: Schema<T>, opts: { maxProperties: number; keyMax: number }): Schema<Record<string, T>> {
  return {
    json: {
      type: 'object',
      maxProperties: opts.maxProperties,
      propertyNames: { maxLength: opts.keyMax },
      additionalProperties: value.json,
    },
    check(input, path, issues) {
      if (!isPlainObject(input)) return push(issues, path, 'atteso oggetto')
      const entries = Object.entries(input)
      if (entries.length > opts.maxProperties) return push(issues, path, `massimo ${opts.maxProperties} proprietà`)
      let ok = true
      for (const [key, entry] of entries) {
        if (key.length > opts.keyMax) { push(issues, path, 'chiave troppo lunga'); ok = false; continue }
        if (!value.check(entry, `${path}.${key}`, issues)) ok = false
      }
      return ok
    },
  }
}

// ── Oggetti chiusi ───────────────────────────────────────────────────────────

interface OptionalSchema<T> extends Schema<T> { readonly optional: true }

/** Proprietà facoltativa: può mancare, ma se presente deve essere valida. */
export function opt<T>(schema: Schema<T>): OptionalSchema<T> {
  return { ...schema, optional: true }
}

type Shape = Record<string, Schema<unknown>>
type OptionalKeys<S extends Shape> = { [K in keyof S]: S[K] extends OptionalSchema<unknown> ? K : never }[keyof S]
type RequiredKeys<S extends Shape> = Exclude<keyof S, OptionalKeys<S>>
type Simplify<T> = { [K in keyof T]: T[K] } & {}
export type ObjectOf<S extends Shape> = Simplify<
  { [K in RequiredKeys<S>]: Infer<S[K]> } & { [K in OptionalKeys<S>]?: Infer<S[K]> }
>

export interface ObjectSchema<S extends Shape> extends Schema<ObjectOf<S>> {
  readonly shape: S
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
}

export function obj<S extends Shape>(shape: S, meta: { id?: string; title?: string } = {}): ObjectSchema<S> {
  const required = Object.entries(shape).filter(([, schema]) => !('optional' in schema)).map(([key]) => key)
  const json: JsonSchema = {
    type: 'object',
    additionalProperties: false,
    required,
    properties: Object.fromEntries(Object.entries(shape).map(([key, schema]) => [key, schema.json])),
  }
  if (meta.id) json.$id = meta.id
  if (meta.title) json.title = meta.title
  return {
    shape,
    json,
    check(value, path, issues) {
      if (!isPlainObject(value)) return push(issues, path, 'atteso oggetto')
      let ok = true
      for (const key of Object.keys(value)) {
        // Solo proprietà PROPRIE dello shape: `key in shape` accetterebbe `__proto__`,
        // `constructor`, `toString`… ereditati da Object.prototype.
        if (!Object.hasOwn(shape, key)) { push(issues, `${path}.${key}`, 'proprietà non prevista'); ok = false }
      }
      for (const [key, schema] of Object.entries(shape)) {
        if (!(key in value) || value[key] === undefined) {
          if (!('optional' in schema)) { push(issues, `${path}.${key}`, 'campo obbligatorio'); ok = false }
          continue
        }
        if (!schema.check(value[key], `${path}.${key}`, issues)) ok = false
      }
      return ok
    },
  }
}

/** Unione discriminata su una chiave letterale (es. `kind`). */
export function tagged<K extends string, V extends ObjectSchema<Shape>[]>(key: K, variants: V): Schema<Infer<V[number]>> {
  const byTag = new Map<unknown, ObjectSchema<Shape>>()
  for (const variant of variants) {
    const tag = (variant.shape[key]?.json as { const?: unknown }).const
    if (tag === undefined) throw new Error(`variante senza ${key} letterale`)
    byTag.set(tag, variant)
  }
  return {
    json: { oneOf: variants.map((variant) => variant.json) },
    check(value, path, issues) {
      if (!isPlainObject(value)) return push(issues, path, 'atteso oggetto')
      const variant = byTag.get(value[key])
      if (!variant) return push(issues, `${path}.${key}`, `${key} non riconosciuto`)
      return variant.check(value, path, issues)
    },
  }
}

/** Raffinamento semantico aggiuntivo (es. coerenza fra due date). */
export function refine<T>(schema: Schema<T>, rule: (value: T) => string | null): Schema<T> {
  return {
    json: schema.json,
    check(value, path, issues) {
      if (!schema.check(value, path, issues)) return false
      const message = rule(value as T)
      return message === null || push(issues, path, message)
    },
  }
}

/** JSON Schema completo, pronto per `schemas/<nome>.schema.json`. */
export function exportJsonSchema(schema: Schema<unknown>, id: string, title: string): JsonSchema {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    ...schema.json,
    $id: id,
    title,
  }
}
