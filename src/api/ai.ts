import { request } from './backend'
export interface AIContextEntity {
  entity_id: string
  state: string
  name?: string
}

export interface AITurn {
  role: 'user' | 'model'
  text: string
}

async function postAI(path: string, body: unknown, signal?: AbortSignal): Promise<string> {
  const data = await request<{ text?: string }>(`/ai/${path}`, { method: 'POST', body: JSON.stringify(body), signal })
  return data.text ?? ''
}

export type HAAutomation = Record<string, unknown> & { alias?: string }

async function postJSON<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(`/ai/${path}`, { method: 'POST', body: JSON.stringify(body), signal })
}

export const aiApi = {
  recap: (context: AIContextEntity[], signal?: AbortSignal) => postAI('recap', { context }, signal),
  chat: (prompt: string, context: AIContextEntity[], history: AITurn[] = []) =>
    postAI('chat', { prompt, context, history }),
  suggest: (context: AIContextEntity[]) => postAI('suggest', { context }),
  /** Doorbell face recognition; the backend authorizes the camera and owns all reference data. */
  recognize: (entityId: string, doorbellId: string, signal?: AbortSignal) =>
    postJSON<{ name: string; known?: boolean }>('recognize', { entityId, doorbellId }, signal),
  /** Generate an HA automation config (preview before creating). */
  automation: (prompt: string, context: AIContextEntity[]) =>
    postJSON<{ automation: HAAutomation }>('automation', { prompt, context }),
  health: () => request<{ ok: boolean; model: string; configured: boolean }>('/ai/health'),
}
