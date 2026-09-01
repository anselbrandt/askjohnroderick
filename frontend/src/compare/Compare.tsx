import { type ReactNode, useRef, useState } from 'react'
import { ARM_LABEL, type Arm } from './stream'
import { useCompare, type ArmState } from './useCompare'
// The composer (textarea + button) is shared with the chat view.
import '../chat/chat.css'
import './compare.css'

/** `(rotl-634 @ 45:10)` -- what the grounded arm is asked to append to claims. */
const CITATION = /\(([a-z]+-\d+)\s*@\s*([\d:]+)\)/g

/**
 * Mark citations so they can be counted at a glance.
 *
 * Whether an answer is sourced is the whole question here, and a cited claim
 * reads as prose until you look for the parentheses. Highlighting makes the
 * difference between the two columns visible before either is read.
 */
function withCitations(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(CITATION)) {
    const at = match.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    out.push(
      <cite key={`${at}`} title={`${match[1]} at ${match[2]}`}>
        {match[1]} @ {match[2]}
      </cite>,
    )
    last = at + match[0].length
  }
  out.push(text.slice(last))
  return out
}

function Column({ arm, state, blind }: { arm: Arm; state: ArmState; blind: boolean }) {
  const citations = (state.text.match(CITATION) ?? []).length
  const waiting = !state.text && !state.error && !state.done

  return (
    <section className="col">
      <header className="col-head">
        <h2>{blind ? 'Answer' : ARM_LABEL[arm]}</h2>
        {!blind && citations > 0 && (
          <span className="badge" title="citations in this answer">
            {citations} cited
          </span>
        )}
        {state.done && <span className="tick" aria-label="finished">✓</span>}
      </header>

      {/* Tool calls are the grounded arm showing its work; hidden when blind,
          because they give away which column is which. */}
      {!blind && state.tools.length > 0 && (
        <ol className="tools">
          {state.tools.map((call, i) => (
            <li key={i}>
              <span className="tool-name">{call.name}</span>
              <span className="tool-args">{call.args}</span>
            </li>
          ))}
        </ol>
      )}

      {state.error ? (
        <p className="col-error">{state.error}</p>
      ) : waiting ? (
        <span className="typing" aria-label="thinking">
          <span />
          <span />
          <span />
        </span>
      ) : (
        <div className="col-body">{withCitations(state.text)}</div>
      )}
    </section>
  )
}

export function Compare() {
  const { question, arms, columns, status, error, ask, stop } = useCompare()
  const [draft, setDraft] = useState('')
  const [blind, setBlind] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const streaming = status === 'streaming'
  const hidden = blind && !revealed

  const submit = () => {
    if (!draft.trim() || streaming) return
    // A new question re-rolls which arm is on the left, so the last reveal
    // must not carry over and unmask it.
    setRevealed(false)
    ask(draft, blind)
    setDraft('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
  }

  return (
    <div className="compare">
      <header className="compare-head">
        <h1>Side by side</h1>
        <label className="blind">
          <input
            type="checkbox"
            checked={blind}
            onChange={(event) => setBlind(event.target.checked)}
            disabled={streaming}
          />
          Blind
        </label>
        <a className="nav" href="#">
          ← chat
        </a>
      </header>

      {question && <p className="asked">{question}</p>}

      <div className="cols">
        {columns.map((arm) => (
          <Column key={arm} arm={arm} state={arms[arm]} blind={hidden} />
        ))}
      </div>

      {hidden && question && !streaming && (
        <button className="reveal" onClick={() => setRevealed(true)}>
          Reveal which is which
        </button>
      )}

      {error && <p className="compare-error">{error}</p>}

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
          placeholder="Ask both at once…"
          onChange={(event) => {
            setDraft(event.target.value)
            event.target.style.height = 'auto'
            event.target.style.height = `${Math.min(event.target.scrollHeight, 140)}px`
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
        >
          {streaming ? 'Stop' : 'Ask'}
        </button>
      </form>
    </div>
  )
}
