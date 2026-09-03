import { useCallback, useEffect, useRef, useState } from 'react'
import { streamChat, type Turn } from './stream'

export type ChatMessage = Turn & { id: string }
export type ChatStatus = 'idle' | 'streaming' | 'error'

let counter = 0
const nextId = () => `m${(counter += 1)}`

/** Called as the reply streams, so audio can start before it finishes. */
export type ChatHooks = {
  onDelta?: (id: string, delta: string) => void
  onFinish?: (id: string) => void
}

export function useChat(hooks: ChatHooks = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<ChatStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  // Held in a ref so `send` never closes over a stale callback, and so
  // changing the hooks does not rebuild `send` mid-stream.
  const hooksRef = useRef(hooks)
  useEffect(() => {
    hooksRef.current = hooks
  })

  // Mirrors `messages` so `send` can read the transcript without going stale.
  const transcript = useRef<ChatMessage[]>([])
  const abort = useRef<AbortController | null>(null)

  const commit = useCallback((update: (prev: ChatMessage[]) => ChatMessage[]) => {
    transcript.current = update(transcript.current)
    setMessages(transcript.current)
  }, [])

  const send = useCallback(
    async (text: string) => {
      const content = text.trim()
      if (!content || abort.current) return

      const controller = new AbortController()
      abort.current = controller
      setError(null)
      setStatus('streaming')

      const outgoing: Turn[] = [
        ...transcript.current.map(({ role, content }) => ({ role, content })),
        { role: 'user', content },
      ]
      const replyId = nextId()
      commit((prev) => [
        ...prev,
        { id: nextId(), role: 'user', content },
        { id: replyId, role: 'assistant', content: '' },
      ])

      try {
        for await (const event of streamChat(outgoing, controller.signal)) {
          if (event.error) throw new Error(event.error)
          if (event.delta) {
            const delta = event.delta
            // Handed on before the transcript update, so synthesis of the
            // first sentence begins while later ones are still arriving. It
            // cannot affect what renders.
            hooksRef.current.onDelta?.(replyId, delta)
            commit((prev) =>
              prev.map((message) =>
                message.id === replyId
                  ? { ...message, content: message.content + delta }
                  : message,
              ),
            )
          }
        }
        hooksRef.current.onFinish?.(replyId)
        setStatus('idle')
      } catch (caught) {
        if (controller.signal.aborted) {
          setStatus('idle')
        } else {
          setError(caught instanceof Error ? caught.message : String(caught))
          setStatus('error')
        }
      } finally {
        abort.current = null
      }
    },
    [commit],
  )

  const stop = useCallback(() => abort.current?.abort(), [])

  useEffect(() => () => abort.current?.abort(), [])

  return { messages, status, error, send, stop }
}
