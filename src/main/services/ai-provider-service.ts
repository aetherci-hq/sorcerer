/**
 * AI Provider Service — Multi-provider abstraction for generating briefings.
 *
 * Supports Anthropic (Claude), OpenAI (GPT), and Google (Gemini).
 * Uses native fetch — no SDK dependencies needed.
 */

export interface AIProviderConfig {
  id: 'anthropic' | 'openai' | 'google'
  name: string
  model: string
}

export const AI_PROVIDERS: AIProviderConfig[] = [
  { id: 'anthropic', name: 'Anthropic (Claude Haiku)', model: 'claude-haiku-4-5-20251001' },
  { id: 'openai', name: 'OpenAI (GPT)', model: 'gpt-4o-mini' },
  { id: 'google', name: 'Google (Gemini)', model: 'gemini-2.0-flash' }
]

export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AIResponse {
  text: string
  provider: string
  model: string
  error?: string
}

async function callAnthropic(apiKey: string, model: string, messages: AIMessage[]): Promise<string> {
  const systemMsg = messages.find((m) => m.role === 'system')
  const userMsgs = messages.filter((m) => m.role !== 'system')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemMsg?.content || '',
      messages: userMsgs.map((m) => ({ role: m.role, content: m.content }))
    })
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Anthropic API error (${res.status}): ${body}`)
  }

  const data = await res.json()
  return data.content?.[0]?.text || ''
}

async function callOpenAI(apiKey: string, model: string, messages: AIMessage[]): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: messages.map((m) => ({ role: m.role, content: m.content }))
    })
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`OpenAI API error (${res.status}): ${body}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

async function callGoogle(apiKey: string, model: string, messages: AIMessage[]): Promise<string> {
  const systemMsg = messages.find((m) => m.role === 'system')
  const userMsgs = messages.filter((m) => m.role !== 'system')

  const contents = userMsgs.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }))

  const body: any = {
    contents,
    generationConfig: { maxOutputTokens: 1024 }
  }

  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg.content }] }
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  )

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Google API error (${res.status}): ${errBody}`)
  }

  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

export async function generateCompletion(
  providerId: string,
  apiKey: string,
  messages: AIMessage[],
  modelOverride?: string
): Promise<AIResponse> {
  const provider = AI_PROVIDERS.find((p) => p.id === providerId)
  if (!provider) {
    return { text: '', provider: providerId, model: '', error: `Unknown provider: ${providerId}` }
  }

  const model = modelOverride || provider.model

  try {
    let text: string
    switch (providerId) {
      case 'anthropic':
        text = await callAnthropic(apiKey, model, messages)
        break
      case 'openai':
        text = await callOpenAI(apiKey, model, messages)
        break
      case 'google':
        text = await callGoogle(apiKey, model, messages)
        break
      default:
        return { text: '', provider: providerId, model, error: `Unsupported provider: ${providerId}` }
    }
    return { text, provider: provider.name, model }
  } catch (err: any) {
    return { text: '', provider: provider.name, model, error: err.message || 'Unknown error' }
  }
}
