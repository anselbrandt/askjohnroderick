import { postSSE } from '../sse'

export type Turn = { role: 'user' | 'assistant'; content: string }

export type ChatEvent = {
  delta?: string
  done?: boolean
  error?: string
}

const SESSION_KEY = 'ajr.session'

/**
 * A stable id for this browser tab's conversation.
 *
 * Groups turns in the server's log so a follow-up can be read as a reaction to
 * the answer before it -- which is where most of the signal is. sessionStorage
 * rather than localStorage: a new tab is a new conversation, and a closed one
 * is over.
 */
function sessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY)
    if (existing) return existing
    const fresh = crypto.randomUUID()
    sessionStorage.setItem(SESSION_KEY, fresh)
    return fresh
  } catch {
    // Private window, or storage blocked. The turn is still logged, just not
    // linked to its neighbours.
    return 'unlinked'
  }
}

export function streamChat(messages: Turn[], signal: AbortSignal) {
  return postSSE<ChatEvent>('/chat', { messages, session_id: sessionId() }, signal)
}
