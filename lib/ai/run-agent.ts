// ─── Agent Runner ─────────────────────────────────────────────────────────────
// Runs a prompt template against Claude with structured financial data.

import { callClaude } from './client'

export interface AgentInput {
  prompt: string
  data: Record<string, unknown>
  maxTokens?: number
}

export interface AgentResult<T = unknown> {
  output: T
  raw: string
  tokens: { input: number; output: number }
}

/**
 * Run a single agent: inject data into prompt, call Claude, parse JSON response.
 */
export async function runAgent<T = unknown>(input: AgentInput): Promise<AgentResult<T>> {
  const dataBlock = JSON.stringify(input.data, null, 2)
  const userMessage = `Here is the user's financial data:\n\n${dataBlock}\n\nAnalyze this data and respond with valid JSON only.`

  const response = await callClaude(input.prompt, [{ role: 'user', content: userMessage }], {
    maxTokens: input.maxTokens ?? 1024,
  })

  let parsed: T
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = response.text.match(/```json\s*([\s\S]*?)```/) ?? response.text.match(/\{[\s\S]*\}/)
    const jsonStr = jsonMatch ? (jsonMatch[1] ?? jsonMatch[0]) : response.text
    parsed = JSON.parse(jsonStr) as T
  } catch {
    throw new Error(`Agent returned non-JSON: ${response.text.slice(0, 200)}`)
  }

  return {
    output: parsed,
    raw: response.text,
    tokens: { input: response.usage.input_tokens, output: response.usage.output_tokens },
  }
}
