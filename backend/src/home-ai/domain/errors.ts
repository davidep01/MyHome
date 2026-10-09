/**
 * Errori tipizzati del core. Il codice è stabile (API, audit, test); il
 * messaggio è in italiano e non contiene mai dati domestici o segreti.
 */
export type CoreErrorCode =
  | 'VALIDATION_ERROR'
  | 'FORBIDDEN_SCOPE'
  | 'REVISION_CONFLICT'
  | 'STALE_CONTEXT'
  | 'CALENDAR_UNVERIFIED'
  | 'SOURCE_UNAVAILABLE'
  | 'PHYSICAL_EXECUTION_DISABLED'
  | 'REASONER_NOT_CONFIGURED'
  | 'NOT_FOUND'
  | 'STORAGE_UNAVAILABLE'
  | 'CORE_DISABLED'

const STATUS: Record<CoreErrorCode, number> = {
  VALIDATION_ERROR: 400,
  FORBIDDEN_SCOPE: 403,
  REVISION_CONFLICT: 409,
  STALE_CONTEXT: 409,
  CALENDAR_UNVERIFIED: 409,
  SOURCE_UNAVAILABLE: 503,
  PHYSICAL_EXECUTION_DISABLED: 403,
  REASONER_NOT_CONFIGURED: 501,
  NOT_FOUND: 404,
  STORAGE_UNAVAILABLE: 503,
  CORE_DISABLED: 503,
}

export class CoreError extends Error {
  readonly code: CoreErrorCode
  readonly status: number
  readonly details: string[]
  constructor(code: CoreErrorCode, message: string, details: string[] = []) {
    super(message)
    this.name = 'CoreError'
    this.code = code
    this.status = STATUS[code]
    this.details = details.slice(0, 10)
  }
}

export function physicalExecutionDisabled(what: string): CoreError {
  return new CoreError('PHYSICAL_EXECUTION_DISABLED', 'Questa versione non controlla i dispositivi.', [what.slice(0, 120)])
}
