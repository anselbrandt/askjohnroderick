import { postSSE } from '../sse'

export type Turn = { role: 'user' | 'assistant'; content: string }

export type ChatEvent = {
  delta?: string
  done?: boolean
  error?: string
}

export function streamChat(messages: Turn[], signal: AbortSignal) {
  return postSSE<ChatEvent>('/chat', { messages }, signal)
}
