// Tipi minimi del modulo integrato `node:sqlite` (Node ≥ 22.13, runtime Node 24
// nell'immagine). @types/node 20 non li include ancora; sono dichiarati qui
// solo per le API usate dal core.
declare module 'node:sqlite' {
  export type SQLValue = null | number | bigint | string | Uint8Array
  export interface RunResult { changes: number | bigint; lastInsertRowid: number | bigint }
  export class StatementSync {
    run(...params: SQLValue[]): RunResult
    get(...params: SQLValue[]): Record<string, SQLValue> | undefined
    all(...params: SQLValue[]): Record<string, SQLValue>[]
  }
  export class DatabaseSync {
    constructor(path: string, options?: { open?: boolean; readOnly?: boolean; enableForeignKeyConstraints?: boolean })
    exec(sql: string): void
    prepare(sql: string): StatementSync
    close(): void
    readonly isOpen: boolean
  }
}
