import { useEffect, useRef, useState } from 'react'
import { API_URL } from '../api'
import '../speak/speak.css'
import './compare.css'

type Version = { id: string; name: string; live: string; change: string }
type RowState = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

const DEFAULT_TEXT =
  'Billy has angina, so he took a bow and drove the whole stretch to Regina, Saskatchewan for sourdough.'

function failureFor(status: number): string {
  return status === 403
    ? 'The voice is not open to the public yet.'
    : status === 503
      ? 'The voice is not available right now.'
      : `The voice failed (${status}).`
}

/**
 * The same text in every voice the site has served, for listening side by side.
 *
 * Audio is kept per version for the text it was made from, so going back and
 * forth between two versions replays rather than re-synthesizes; editing the
 * text makes every row play fresh. One row plays at a time.
 */
export function Compare() {
  const [text, setText] = useState(DEFAULT_TEXT)
  const [versions, setVersions] = useState<Version[]>([])
  const [states, setStates] = useState<Record<string, RowState>>({})
  const [error, setError] = useState<string | null>(null)
  const cache = useRef(new Map<string, string>()) // `${id}\n${text}` -> object URL
  const audio = useRef<HTMLAudioElement | null>(null)
  const playingId = useRef<string | null>(null)

  useEffect(() => {
    fetch(`${API_URL}/compare/versions`)
      .then(async (response) => {
        if (!response.ok) throw new Error(failureFor(response.status))
        setVersions(await response.json())
      })
      .catch((exc: Error) => setError(exc.message))
    const urls = cache.current
    return () => {
      audio.current?.pause()
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  const setState = (id: string, state: RowState) =>
    setStates((prev) => ({ ...prev, [id]: state }))

  const stopCurrent = () => {
    if (audio.current && playingId.current) {
      audio.current.pause()
      setState(playingId.current, 'idle')
    }
    audio.current = null
    playingId.current = null
  }

  const toggle = async (id: string) => {
    const spoken = text.trim()
    if (!spoken) return
    const key = `${id}\n${spoken}`

    // The same row with the same text: pause and resume.
    if (
      playingId.current === id &&
      audio.current &&
      cache.current.get(key) === audio.current.src
    ) {
      if (audio.current.paused) {
        void audio.current.play()
        setState(id, 'playing')
      } else {
        audio.current.pause()
        setState(id, 'paused')
      }
      return
    }

    stopCurrent()
    setError(null)
    let url = cache.current.get(key)
    if (!url) {
      setState(id, 'loading')
      try {
        const response = await fetch(`${API_URL}/compare/speak`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: spoken, version: id }),
        })
        if (!response.ok) throw new Error(failureFor(response.status))
        url = URL.createObjectURL(await response.blob())
        cache.current.set(key, url)
      } catch (exc) {
        setState(id, 'error')
        setError((exc as Error).message)
        return
      }
      // Another row may have been started while this one synthesized.
      if (playingId.current !== null) {
        setState(id, 'idle')
        return
      }
    }
    const player = new Audio(url)
    audio.current = player
    playingId.current = id
    player.onended = () => {
      setState(id, 'idle')
      if (playingId.current === id) playingId.current = null
    }
    setState(id, 'playing')
    void player.play()
  }

  return (
    <div className="speak-page compare-page">
      <div className="speak-panel compare-panel">
        <div className="speak-glass" aria-hidden="true" />
        <h1 className="compare-title">Every voice so far</h1>
        <textarea
          value={text}
          placeholder="Give John Roderick something to say…"
          aria-label="Text to speak"
          onChange={(event) => setText(event.target.value)}
        />
        <ol className="compare-list">
          {versions.map((v) => {
            const state = states[v.id] ?? 'idle'
            const playing = state === 'playing'
            return (
              <li key={v.id} className="compare-row">
                <button
                  type="button"
                  disabled={!text.trim()}
                  aria-label={`${playing ? 'Pause' : 'Play'} ${v.name}`}
                  data-state={state}
                  onClick={() => void toggle(v.id)}
                >
                  {state === 'loading' ? (
                    <span className="speak-page-dots" aria-hidden="true" />
                  ) : playing ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                      <rect x="1" width="3.5" height="12" rx="1" fill="currentColor" />
                      <rect
                        x="7.5"
                        width="3.5"
                        height="12"
                        rx="1"
                        fill="currentColor"
                      />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                      <path d="M2.5 1l9 5-9 5z" fill="currentColor" />
                    </svg>
                  )}
                </button>
                <div className="compare-text">
                  <div className="compare-name">
                    <span className="compare-id">{v.id}</span> {v.name}
                    <span className="compare-live">{v.live}</span>
                  </div>
                  <div className="compare-change">{v.change}</div>
                </div>
              </li>
            )
          })}
        </ol>
        <p className="compare-note">
          The first play of each model takes about ten seconds while it loads.
        </p>
        {error && (
          <p className="speak-page-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
