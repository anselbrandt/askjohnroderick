import { useEffect, useRef, useState } from 'react'
import { useChat } from './useChat'
import './chat.css'

const STICK_THRESHOLD = 96

export function Chat() {
  const { messages, status, error, send, stop } = useChat()
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLOListElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const stick = useRef(true)

  const streaming = status === 'streaming'
  const active = messages.length > 0

  // Autoscroll only when the reader is already at the bottom. `stick` is
  // updated on scroll, before new content changes the measurement.
  useEffect(() => {
    const list = listRef.current
    if (list && stick.current) list.scrollTop = list.scrollHeight
  }, [messages])

  const onScroll = () => {
    const list = listRef.current
    if (!list) return
    stick.current =
      list.scrollHeight - list.scrollTop - list.clientHeight < STICK_THRESHOLD
  }

  const grow = (element: HTMLTextAreaElement) => {
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 140)}px`
  }

  const submit = () => {
    if (!draft.trim() || streaming) return
    stick.current = true
    send(draft)
    setDraft('')
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }
  }

  return (
    <div className="chat" data-active={active}>
      <div className="chat-glass" aria-hidden="true" />

      <div className="chat-body">
        {active && (
          <ol className="chat-list" ref={listRef} onScroll={onScroll}>
            {messages.map((message) => (
              <li
                key={message.id}
                className={`msg msg-${message.role}`}
                aria-live={message.role === 'assistant' ? 'polite' : undefined}
              >
                {message.content ? (
                  message.content
                ) : (
                  <span className="typing" aria-label="thinking">
                    <span />
                    <span />
                    <span />
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}

        {error && <p className="chat-error">{error}</p>}

        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            placeholder="Ask John Roderick…"
            onChange={(event) => {
              setDraft(event.target.value)
              grow(event.target)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submit()
              }
            }}
          />
          <button
            type={streaming ? 'button' : 'submit'}
            onClick={streaming ? stop : undefined}
            disabled={!streaming && !draft.trim()}
            aria-label={streaming ? 'Stop' : 'Send'}
          >
            {streaming ? (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <rect width="12" height="12" rx="2" fill="currentColor" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M8 13V3M8 3 3.5 7.5M8 3l4.5 4.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
