import { describe, expect, it, vi } from 'vitest'
import { reloadAddonStore } from './supervisor.js'

describe('reloadAddonStore', () => {
  it('senza Supervisor non finge un successo', async () => {
    const fetchImpl = vi.fn()
    expect(await reloadAddonStore(fetchImpl as unknown as typeof fetch, undefined)).toEqual({ ok: false, reason: 'no-supervisor' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('chiede al Supervisor di rileggere il repository col token dell’add-on', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"result":"ok"}', { status: 200 }))
    expect(await reloadAddonStore(fetchImpl as unknown as typeof fetch, 'tok')).toEqual({ ok: true })
    expect(fetchImpl).toHaveBeenCalledWith('http://supervisor/store/reload', expect.objectContaining({
      method: 'POST',
      headers: { Authorization: 'Bearer tok' },
    }))
  })

  it('distingue il permesso mancante da un errore generico', async () => {
    expect(await reloadAddonStore((async () => new Response('', { status: 403 })) as unknown as typeof fetch, 'tok')).toEqual({ ok: false, reason: 'forbidden' })
    expect(await reloadAddonStore((async () => { throw new Error('down') }) as unknown as typeof fetch, 'tok')).toEqual({ ok: false, reason: 'failed' })
  })
})
