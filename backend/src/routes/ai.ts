import { Hono } from 'hono'
import { db } from '../db/client.js'
import { getHAConfig } from '../lib/ha-config.js'
import { desktopOnly } from '../lib/security.js'

export const aiRouter = new Hono()

// Copilot e write-back automazioni restano desktop-only; /health e /recognize
// devono funzionare dal KIOSK: il campanello suona sul tablet a muro.
aiRouter.use('/chat', desktopOnly)
aiRouter.use('/suggest', desktopOnly)
aiRouter.use('/automation', desktopOnly)
aiRouter.use('/automation/*', desktopOnly)

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } }
type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] }

/** Low-level Gemini call accepting raw multimodal parts + optional JSON mode. */
async function geminiGenerate(
  contents: GeminiContent[],
  opts?: { system?: string; generationConfig?: Record<string, unknown> },
) {
  const { apiKey, model } = getConfig()
  if (!apiKey) return { ok: false as const, status: 400, error: 'GEMINI_API_KEY mancante nel backend' }
  const res = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      ...(opts?.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
      contents,
      generationConfig: opts?.generationConfig ?? { temperature: 0.4, maxOutputTokens: 1024 },
    }),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const message = (data?.error as { message?: string } | undefined)?.message ?? `Gemini ha risposto ${res.status}`
    return { ok: false as const, status: res.status, error: message }
  }
  const text = (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
    ?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  return { ok: true as const, text }
}

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

// POST /api/ai/recognize — Gemini Vision on a camera snapshot (doorbell face recognition)
aiRouter.post('/recognize', async (c) => {
  const body = await c.req.json<{ entityId: string; names?: string[] }>().catch(() => null)
  if (!body?.entityId) return c.json({ error: 'entityId mancante' }, 400)
  const { config } = await db.read()
  if (config.ai?.doorbellVision === false) {
    return c.json({ error: 'Riconoscimento AI disattivato dalle Funzioni' }, 400)
  }
  const { haUrl, haToken } = await getHAConfig()
  if (!haToken) return c.json({ error: 'HA token mancante' }, 400)

  let b64: string
  try {
    const r = await fetch(`${haUrl.replace(/\/$/, '')}/api/camera_proxy/${encodeURIComponent(body.entityId)}`, {
      headers: { Authorization: `Bearer ${haToken}` },
    })
    if (!r.ok) return c.json({ error: `Snapshot non disponibile (${r.status})` }, 502)
    b64 = Buffer.from(await r.arrayBuffer()).toString('base64')
  } catch {
    return c.json({ error: 'Snapshot non raggiungibile' }, 502)
  }

  // Volti di riferimento caricati in Funzioni → Campanelli → "Volti conosciuti":
  // Gemini confronta il volto alla porta con queste foto e risponde col nome esatto.
  const faces = (config.ai?.faces ?? []).filter((f) => f.name?.trim() && f.images?.length)
  const refParts: GeminiPart[] = []
  for (const face of faces.slice(0, 8)) {
    for (const img of face.images.slice(0, 3)) {
      const m = /^data:(image\/[a-z.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(img)
      if (!m) continue
      refParts.push({ text: `Foto di riferimento di "${face.name.trim()}":` })
      refParts.push({ inline_data: { mime_type: m[1], data: m[2] } })
    }
  }

  const names = (body.names ?? []).filter(Boolean)
  const knownLine = names.length ? `Altre persone note della famiglia: ${names.join(', ')}.\n` : ''
  const refLine = refParts.length
    ? 'Prima trovi le foto di riferimento delle persone conosciute, poi l\'immagine del videocitofono: confronta i volti con attenzione.\n'
    : ''
  const prompt = `${refLine}L'ULTIMA immagine è quella di un videocitofono/campanello. Identifica CHI o COSA c'è alla porta.
${knownLine}Rispondi con UNA sola etichetta brevissima in italiano, senza punteggiatura:
- il nome ESATTO della persona di riferimento se il volto corrisponde a una delle foto;
- altrimenti una descrizione breve di chi/cosa vedi (es. "un corriere", "una persona sconosciuta", "un gatto", "un pacco");
- "nessuno" se non c'è nessuno e niente di rilevante.
Solo l'etichetta.`

  const result = await geminiGenerate(
    [{
      role: 'user',
      parts: [
        { text: prompt },
        ...refParts,
        { text: 'Immagine del videocitofono:' },
        { inline_data: { mime_type: 'image/jpeg', data: b64 } },
      ],
    }],
    { generationConfig: { temperature: 0, maxOutputTokens: 32 } },
  )
  if (!result.ok) return c.json({ error: result.error }, result.status as 400 | 502)
  const label = result.text.trim().replace(/[."\n\r]/g, '').trim()
  const lower = label.toLowerCase()
  const isKnown = faces.some((f) => f.name.trim().toLowerCase() === lower)
    || names.some((n) => n.toLowerCase() === lower)
  return c.json({ name: label, known: isKnown })
})

// POST /api/ai/automation — generate a valid HA automation config (JSON) for preview
aiRouter.post('/automation', async (c) => {
  const body = await c.req.json<ChatBody>().catch(() => null)
  if (!body?.prompt) return c.json({ error: 'prompt mancante' }, 400)
  const system = `${SYSTEM_PROMPT}\nGenera UNA automazione Home Assistant valida come JSON puro (niente markdown) con i campi: alias (string), trigger (array), condition (array, può essere vuoto), action (array). Usa SOLO entità realmente presenti.\nStato attuale:\n${contextToText(body.context)}`
  const result = await geminiGenerate(
    [{ role: 'user', parts: [{ text: `Crea un'automazione per: ${body.prompt}` }] }],
    { system, generationConfig: { temperature: 0.3, maxOutputTokens: 1024, responseMimeType: 'application/json' } },
  )
  if (!result.ok) return c.json({ error: result.error }, result.status as 400 | 502)
  try {
    return c.json({ automation: JSON.parse(result.text) })
  } catch {
    return c.json({ error: 'Gemini non ha prodotto JSON valido', raw: result.text }, 502)
  }
})

// POST /api/ai/automation/create — write the automation into Home Assistant
aiRouter.post('/automation/create', async (c) => {
  const body = await c.req.json<{ automation: Record<string, unknown> }>().catch(() => null)
  if (!body?.automation) return c.json({ error: 'automation mancante' }, 400)
  const { haUrl, haToken } = await getHAConfig()
  if (!haToken) return c.json({ error: 'HA token mancante' }, 400)
  const id = `myhome_${Date.now()}`
  const base = haUrl.replace(/\/$/, '')
  try {
    const r = await fetch(`${base}/api/config/automation/config/${id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${haToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body.automation),
    })
    if (!r.ok) return c.json({ error: `Home Assistant ha rifiutato l'automazione (${r.status})` }, 502)
    // Reload so it becomes active immediately
    await fetch(`${base}/api/services/automation/reload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${haToken}` },
    }).catch(() => {})
    return c.json({ ok: true, id })
  } catch {
    return c.json({ error: 'Home Assistant non raggiungibile' }, 502)
  }
})
