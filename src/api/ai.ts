export interface AIContextEntity {
  entity_id: string
  state: string
  name?: string
}

export interface AITurn {
  role: 'user' | 'model'
  text: string
}

function clientHeader(): 'desktop' | 'tablet' {
  if (typeof window === 'undefined') return 'desktop'
  return window.matchMedia('(pointer: fine)').matches ? 'desktop' : 'tablet'
}

async function postAI(path: string, body: unknown): Promise<string> {
  const res = await fetch(`/api/ai/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-MyHome-Client': clientHeader() },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string }
  if (!res.ok) throw new Error(data.error ?? `Errore AI (${res.status})`)
  return data.text ?? ''
}

export type HAAutomation = Record<string, unknown> & { alias?: string }

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/ai/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-MyHome-Client': clientHeader() },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Errore AI (${res.status})`)
  return data
}

export const aiApi = {
  chat: (prompt: string, context: AIContextEntity[], history: AITurn[] = []) =>
    postAI('chat', { prompt, context, history }),
  suggest: (context: AIContextEntity[]) => postAI('suggest', { context }),
  /** Doorbell face recognition; the backend authorizes the camera and owns all reference data. */
  recognize: (entityId: string, doorbellId: string) =>
    postJSON<{ name: string; known?: boolean }>('recognize', { entityId, doorbellId }),
  /** Generate an HA automation config (preview before creating). */
  automation: (prompt: string, context: AIContextEntity[]) =>
    postJSON<{ automation: HAAutomation }>('automation', { prompt, context }),
  health: async () => {
    const res = await fetch('/api/ai/health')
    return res.json() as Promise<{ ok: boolean; model: string; configured: boolean }>
  },
}
