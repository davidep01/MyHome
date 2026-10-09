import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { exportedSchemaFiles } from '../domain/contracts.js'
import { exportJsonSchema } from '../domain/schema.js'
import { CoreConfigSchema, validateCoreConfig } from '../config.js'

/**
 * `schemas/home-ai/` è generata dai contratti runtime: un solo punto di verità.
 * Rigenera con `UPDATE_SCHEMAS=1 npx vitest run backend/src/home-ai/__tests__/schemas.test.ts`.
 */
const DIR = join(process.cwd(), 'schemas/home-ai')

function expected(): Record<string, unknown> {
  return {
    ...exportedSchemaFiles(),
    'core-config.v1.schema.json': exportJsonSchema(CoreConfigSchema, 'urn:home-ai-core:core-config.v1', 'CoreConfig'),
  }
}

describe('schemi JSON esportati', () => {
  it('coincidono con i contratti runtime', () => {
    const files = expected()
    if (process.env.UPDATE_SCHEMAS === '1') {
      mkdirSync(DIR, { recursive: true })
      for (const [name, schema] of Object.entries(files)) writeFileSync(join(DIR, name), `${JSON.stringify(schema, null, 2)}\n`)
    }
    expect(readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()).toEqual(Object.keys(files).sort())
    for (const [name, schema] of Object.entries(files)) {
      expect(JSON.parse(readFileSync(join(DIR, name), 'utf8')), name).toEqual(schema)
    }
  })

  it('dichiarano Draft 2020-12 e un $id stabile', () => {
    for (const [name, schema] of Object.entries(expected()) as [string, Record<string, unknown>][]) {
      expect(schema.$schema, name).toBe('https://json-schema.org/draft/2020-12/schema')
      expect(String(schema.$id), name).toMatch(/^urn:home-ai-core:/)
    }
  })

  it('config.example.json è una configurazione valida e senza effetti reali', () => {
    const example = JSON.parse(readFileSync(join(process.cwd(), 'docs/home-ai/config.example.json'), 'utf8')) as unknown
    const config = validateCoreConfig(example)
    expect(config.runtime.physical_execution).toBe('disabled')
    expect(config.runtime.external_notifications).toBe('disabled')
    expect(config.reasoner.adapter).toBe('disabled')
  })
})
