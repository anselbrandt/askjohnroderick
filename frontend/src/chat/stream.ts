import { API_URL } from '../api'

export type Turn = { role: 'user' | 'assistant'; content: string }

export type ChatEvent = {
  delta?: string
  done?: boolean
  error?: string
}

/**
 * POST the transcript and yield SSE payloads as they arrive.
 *
 * EventSource can't POST or set headers, so this reads the response body
 * directly. Frames can be split across chunks, so the trailing partial frame
 * is held back rather than parsed.
 */
export async function* streamChat(
  messages: Turn[],
  signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const response = await fetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  })

  if (!response.ok || !response.body) {
    throw new Error(`${response.status} ${response.statusText}`)
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += value
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''

    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        if (line.startsWith('data: ')) {
          yield JSON.parse(line.slice(6)) as ChatEvent
        }
      }
    }
  }
}
