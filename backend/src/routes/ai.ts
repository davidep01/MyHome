import { Hono } from 'hono'

export const aiRouter = new Hono()

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

function getConfig() {
  const apiKey = process.env.GEMINI_API_KEY ?? ''
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  return { apiKey, model }
}

const SYSTEM_PROMPT = `Sei l'assistente AI di "MyHome", una dashboard domotica Home Assistant.
Aiuti l'utente a capire lo stato della casa, suggerire automazioni proattive e
proporre azioni. Rispondi in italiano, in modo conciso e pratico.
Quando suggerisci automazioni, sii concreto (trigger → condizione → azione) e
fai riferimento alle entità realmente presenti nel contesto fornito.
Non inventare entità che non esistono.`

interface ChatBody {
  prompt: string
  /** Compact snapshot of current Home Assistant entities (id + state). */
  context?: { entity_id: string; state: string; name?: string }[]
  /** Prior turns for multi-message conversations. */
  history?: { role: 'user' | 'model'; text: string }[]
}

async function callGemini(parts: { role: 'user' | 'model'; text: string }[], systemText: string) {
  const { apiKey, model } = getConfig()
  if (!apiKey) {
    return { ok: false as const, status: 400, error: 'GEMINI_API_KEY mancante nel backend' }
  }

  const res = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemText }] },
      contents: parts.map((p) => ({ role: p.role, parts: [{ text: p.text }] })),
      generationConfig: { temperature: 0.6, maxOutputTokens: 1024 },
    }),
  })

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const message =
      (data?.error as { message?: string } | undefined)?.message ?? `Gemini ha risposto ${res.status}`
    return { ok: false as const, status: res.status, error: message }
  }

  const text =
    (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
      ?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  return { ok: true as const, text }
}

function contextToText(context?: ChatBody['context']) {
  if (!context || context.length === 0) return 'Nessuna entità fornita.'
  return context
    .slice(0, 120)
    .map((e) => `- ${e.entity_id}${e.name ? ` (${e.name})` : ''}: ${e.state}`)
    .join('\n')
}

aiRouter.get('/health', (c) => {
  const { apiKey, model } = getConfig()
  return c.json({ ok: Boolean(apiKey), model, configured: Boolean(apiKey) })
})

// POST /api/ai/chat — natural-language home copilot
aiRouter.post('/chat', async (c) => {
  const body = await c.req.json<ChatBody>().catch(() => null)
  if (!body?.prompt) return c.json({ error: 'prompt mancante' }, 400)

  const systemText = `${SYSTEM_PROMPT}\n\nStato attuale della casa:\n${contextToText(body.context)}`
  const parts = [
    ...(body.history ?? []),
    { role: 'user' as const, text: body.prompt },
  ]

  const result = await callGemini(parts, systemText)
  if (!result.ok) return c.json({ error: result.error }, result.status as 400 | 502)
  return c.json({ text: result.text })
})

// POST /api/ai/suggest — proactive automation suggestions from current state
aiRouter.post('/suggest', async (c) => {
  const body = await c.req.json<{ context?: ChatBody['context'] }>().catch(() => null)
  const systemText = `${SYSTEM_PROMPT}\n\nStato attuale della casa:\n${contextToText(body?.context)}`
  const result = await callGemini(
    [{
      role: 'user',
      text: 'Analizza lo stato della casa e proponi 3 automazioni o azioni proattive utili adesso. Per ciascuna: titolo breve, una frase di motivazione, e le entità coinvolte. Formato elenco puntato.',
    }],
    systemText,
  )
  if (!result.ok) return c.json({ error: result.error }, result.status as 400 | 502)
  return c.json({ text: result.text })
})
