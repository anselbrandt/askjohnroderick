import { useEffect, useRef, useState } from 'react'
import { useChat } from './useChat'
import { useSpeech } from './useSpeech'
import './chat.css'

const STICK_THRESHOLD = 96

export function Chat() {
  const { messages, status, error, send, stop } = useChat()
  const speech = useSpeech()
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

  // Speak a reply once it is complete. Streaming is untouched: the text is
  // already on screen by the time this runs, and audio never gates it.
  const spoken = useRef<string | null>(null)
  useEffect(() => {
    if (speech.muted || streaming) return
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'assistant' || !last.content) return
    if (spoken.current === last.id) return
    spoken.current = last.id
    speech.speak(last.id, last.content)
  }, [messages, streaming, speech])

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

      <button
        className="mute"
        onClick={speech.toggleMuted}
        aria-pressed={speech.muted}
        aria-label={speech.muted ? 'Unmute replies' : 'Mute replies'}
        title={speech.muted ? 'Replies are silent' : 'Replies are spoken'}
      >
        {speech.muted ? (
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M3 6.5h3L10 3v12L6 11.5H3z" fill="currentColor" />
            <path d="M12 6.5l4 5M16 6.5l-4 5" stroke="currentColor" strokeWidth="1.6"
                  strokeLinecap="round" fill="none" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M3 6.5h3L10 3v12L6 11.5H3z" fill="currentColor" />
            <path d="M12.5 6a4 4 0 010 6M14.5 4a7 7 0 010 10" stroke="currentColor"
                  strokeWidth="1.5" strokeLinecap="round" fill="none" />
          </svg>
        )}
      </button>

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
                  <>
                    {message.content}
                    {message.role === 'assistant' && (
                      <button
                        className="speak"
                        onClick={() => speech.speak(message.id, message.content)}
                        aria-label={
                          speech.speakingId === message.id && speech.state === 'playing'
                            ? 'Pause'
                            : 'Play'
                        }
                        data-state={
                          speech.speakingId === message.id ? speech.state : 'idle'
                        }
                      >
                        {speech.speakingId === message.id &&
                        speech.state === 'loading' ? (
                          <span className="speak-dots" aria-hidden="true" />
                        ) : speech.speakingId === message.id &&
                          speech.state === 'playing' ? (
                          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                            <rect x="1" width="3.5" height="12" rx="1" fill="currentColor" />
                            <rect x="7.5" width="3.5" height="12" rx="1" fill="currentColor" />
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                            <path d="M2 1l9 5-9 5z" fill="currentColor" />
                          </svg>
                        )}
                      </button>
                    )}
                  </>
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
