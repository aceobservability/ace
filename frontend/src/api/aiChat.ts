import { API_BASE } from '@/api/base'

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export type ChatRequestMessage =
  | { role: 'user' | 'assistant' | 'system'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export type SendAiChatParams = {
  orgId: string
  providerId?: string
  model?: string
  datasourceType: string
  datasourceName: string
  messages: ChatRequestMessage[]
  tools?: ToolDefinition[]
  signal?: AbortSignal
}

export type SendAiChatResult = {
  content: string | null
  toolCalls: ToolCall[]
}

async function parseSseStream(
  response: Response,
  signal?: AbortSignal,
): Promise<SendAiChatResult> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response stream')

  const decoder = new TextDecoder()
  let buffer = ''
  let fullContent = ''

  while (true) {
    if (signal?.aborted) {
      await reader.cancel().catch(() => undefined)
      throw new DOMException('Aborted', 'AbortError')
    }

    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed === 'data: [DONE]') continue
      if (!trimmed.startsWith('data: ')) continue
      try {
        const json = JSON.parse(trimmed.slice(6)) as {
          choices?: Array<{ delta?: { content?: string } }>
        }
        const content = json.choices?.[0]?.delta?.content
        if (content) fullContent += content
      } catch {
        // skip malformed SSE chunks
      }
    }
  }

  return { content: fullContent, toolCalls: [] }
}

function parseJsonChatResponse(data: {
  choices?: Array<{
    message?: {
      content?: string | null
      tool_calls?: ToolCall[]
    }
  }>
  error?: string
}): SendAiChatResult {
  const choices = data.choices
  if (!choices || choices.length === 0) throw new Error('No response from model')

  let content: string | null = null
  let toolCalls: ToolCall[] = []
  for (const choice of choices) {
    if (choice.message?.content && !content) {
      content = choice.message.content
    }
    if (choice.message?.tool_calls?.length) {
      toolCalls = choice.message.tool_calls
    }
  }

  return { content, toolCalls }
}

/**
 * Pure AI chat transport: JSON tool-calling responses and optional SSE streams.
 * Retries once on HTTP 429.
 */
export async function sendAiChat(params: SendAiChatParams): Promise<SendAiChatResult> {
  const {
    orgId,
    providerId,
    model,
    datasourceType,
    datasourceName,
    messages,
    tools,
    signal,
  } = params

  const body: Record<string, unknown> = {
    provider_id: providerId || undefined,
    model: model || undefined,
    datasource_type: datasourceType,
    datasource_name: datasourceName,
    messages,
  }
  if (tools && tools.length > 0) {
    body.tools = tools
    body.stream = false
  }

  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  }

  let response = await fetch(`${API_BASE}/api/orgs/${orgId}/ai/chat`, fetchOptions)

  if (response.status === 429) {
    await Promise.race([
      new Promise(resolve => setTimeout(resolve, 2000)),
      ...(signal
        ? [
            new Promise<never>((_, reject) =>
              signal.addEventListener(
                'abort',
                () => reject(new DOMException('Aborted', 'AbortError')),
                { once: true },
              ),
            ),
          ]
        : []),
    ])
    response = await fetch(`${API_BASE}/api/orgs/${orgId}/ai/chat`, fetchOptions)
  }

  if (!response.ok) {
    const errData = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(errData.error || `AI request failed (${response.status})`)
  }

  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('text/event-stream')) {
    return parseSseStream(response, signal)
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null
        tool_calls?: ToolCall[]
      }
    }>
    error?: string
  }
  return parseJsonChatResponse(data)
}
