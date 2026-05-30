export interface AIContextEntity {
  entity_id: string
  state: string
  name?: string
}

export interface AITurn {
  role: 'user' | 'model'
  text: string
}

async function postAI(path: string, body: unknown): Promise<string> {
  const res = await fetch(`/api/ai/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string }
  if (!res.ok) throw new Error(data.error ?? `Errore AI (${res.status})`)
  return data.text ?? ''
}

export const aiApi = {
  chat: (prompt: string, context: AIContextEntity[], history: AITurn[] = []) =>
    postAI('chat', { prompt, context, history }),
  suggest: (context: AIContextEntity[]) => postAI('suggest', { context }),
  health: async () => {
    const res = await fetch('/api/ai/health')
    return res.json() as Promise<{ ok: boolean; model: string; configured: boolean }>
  },
}
