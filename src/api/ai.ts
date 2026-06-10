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
  /** Doorbell face recognition: snapshot of `entityId` matched against `names`. */
  recognize: (entityId: string, names: string[]) =>
    postJSON<{ name: string }>('recognize', { entityId, names }),
  /** Generate an HA automation config (preview before creating). */
  automation: (prompt: string, context: AIContextEntity[]) =>
    postJSON<{ automation: HAAutomation }>('automation', { prompt, context }),
  /** Write a generated automation into Home Assistant. */
  createAutomation: (automation: HAAutomation) =>
    postJSON<{ ok: boolean; id: string }>('automation/create', { automation }),
  health: async () => {
    const res = await fetch('/api/ai/health')
    return res.json() as Promise<{ ok: boolean; model: string; configured: boolean }>
  },
}
