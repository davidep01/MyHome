import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppConfig } from '../api/backend'

const harness = vi.hoisted(() => ({
  config: undefined as AppConfig | undefined,
  update: vi.fn(),
  invalidate: vi.fn(),
}))
vi.mock('../api/backend', () => ({ configApi: { update: harness.update } }))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    cancelQueries: async () => {},
    getQueryData: () => harness.config,
    setQueryData: (_key: unknown, updater: (value: AppConfig | undefined) => AppConfig | undefined) => { harness.config = updater(harness.config) },
    invalidateQueries: harness.invalidate,
  }),
  useMutation: (options: unknown) => options,
  useQuery: () => {},
}))
import { useUpdateConfig } from './useDashboardConfig'

type Context = { prev?: AppConfig; optimistic?: AppConfig; keys: (keyof AppConfig)[] }
function mutation() {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- React hooks are replaced by the deterministic mutation harness above.
  return useUpdateConfig() as unknown as {
    onMutate: (data: Partial<AppConfig>) => Promise<Context>
    mutationFn: (data: Partial<AppConfig>) => Promise<unknown>
    onError: (error: unknown, data: Partial<AppConfig>, context: Context) => void
    onSettled: () => void
  }
}
beforeEach(() => {
  vi.clearAllMocks()
  harness.config = { configVersion: 1, userName: 'Davide', dashboardName: 'Casa', kiosk: { homeMode: 'composer' } } as AppConfig
})
describe('configuration optimistic write queue', () => {
  it('sends the rendered revision and preserves a newer pending value during rollback', async () => {
    const first = mutation()
    const oldForm = mutation()
    const a: Partial<AppConfig> = { userName: 'Primo' }
    const b: Partial<AppConfig> = { userName: 'Secondo' }
    const contextA = await first.onMutate(a)
    const contextB = await oldForm.onMutate(b)
    expect(a.configVersion).toBe(1)
    expect(b.configVersion).toBe(1)
    first.onError(new Error('offline'), a, contextA)
    expect(harness.config?.userName).toBe('Secondo')
    harness.update.mockRejectedValue(new Error('conflict'))
    await expect(first.mutationFn(a)).rejects.toThrow()
    await expect(oldForm.mutationFn(b)).rejects.toThrow()
    oldForm.onError(new Error('conflict'), b, contextB)
    expect(harness.config?.userName).toBe('Davide')
    oldForm.onSettled()
    expect(harness.invalidate).toHaveBeenCalled()
  })
  it('serializes writes and refetches only when all pending writes settle', async () => {
    const first = mutation()
    const a: Partial<AppConfig> = { userName: 'Primo' }
    await first.onMutate(a)
    const second = mutation()
    const b: Partial<AppConfig> = { dashboardName: 'Nuova casa' }
    await second.onMutate(b)
    let finish!: () => void
    harness.update.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve })).mockResolvedValueOnce({ ok: true })
    const one = first.mutationFn(a)
    const two = second.mutationFn(b)
    await Promise.resolve()
    expect(harness.update).toHaveBeenCalledTimes(1)
    finish()
    await one
    first.onSettled()
    expect(harness.invalidate).not.toHaveBeenCalled()
    await two
    second.onSettled()
    expect(b.configVersion).toBe(2)
    expect(harness.invalidate).toHaveBeenCalledOnce()
  })
})
