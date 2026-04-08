// ─── Anthropic Client ─────────────────────────────────────────────────────────
// Shared Claude client for all AI agents. Uses the same API key as support chat.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AgentResponse {
  text: string
  usage: { input_tokens: number; output_tokens: number }
}

export async function callClaude(
  system: string,
  messages: AgentMessage[],
  options: { maxTokens?: number; model?: string } = {}
): Promise<AgentResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model ?? 'claude-sonnet-4-6',
      max_tokens: options.maxTokens ?? 1024,
      system,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Claude API ${res.status}: ${errText.slice(0, 200)}`)
  }

  const data = await res.json()
  return {
    text: data.content?.[0]?.text ?? '',
    usage: data.usage ?? { input_tokens: 0, output_tokens: 0 },
  }
}
