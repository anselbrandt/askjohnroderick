import { useState } from 'react'
import { useSpeech } from '../chat/useSpeech'
import './speak.css'

/**
 * Type something and hear it in his voice.
 *
 * The text itself is the speech id. That is what makes editing work without
 * any bookkeeping: unchanged text toggles pause and resume on what is already
 * playing, while changed text no longer matches, so the button reads as play
 * again and pressing it starts over on the new words.
 */
export function Speak() {
  const speech = useSpeech()
  const [text, setText] = useState('')

  const current = speech.speakingId === text
  const state = current ? speech.state : 'idle'
  const playing = state === 'playing'

  const play = () => {
    if (!text.trim()) return
    void speech.speak(text, text)
  }

  return (
    <div className="speak-page">
      <form
        className="speak-panel"
        onSubmit={(event) => {
          event.preventDefault()
          play()
        }}
      >
        <div className="speak-glass" aria-hidden="true" />
        <textarea
          value={text}
          placeholder="Give John Roderick something to say…"
          aria-label="Text to speak"
          autoFocus
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Plain Enter is a newline here: the text is the point, and it
            // may well run to paragraphs.
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              play()
            }
          }}
        />
        <button
          type="submit"
          disabled={!text.trim()}
          aria-label={playing ? 'Pause' : 'Play'}
          title={playing ? 'Pause' : 'Play (Ctrl+Enter)'}
          data-state={state}
        >
          {state === 'loading' ? (
            <span className="speak-page-dots" aria-hidden="true" />
          ) : playing ? (
            <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true">
              <rect x="1" width="3.5" height="12" rx="1" fill="currentColor" />
              <rect x="7.5" width="3.5" height="12" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2.5 1l9 5-9 5z" fill="currentColor" />
            </svg>
          )}
        </button>
        {speech.error && (
          <p className="speak-page-error" role="alert">
            {speech.error}
          </p>
        )}
      </form>
    </div>
  )
}
