import { useCallback, useEffect, useRef, useState } from 'react'
import { API_URL } from '../api'

export type SpeechState = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

const MUTED_KEY = 'ajr.muted'

// A sentence, plus whatever closing punctuation trails it. Splitting here is
// what lets audio start before the reply is finished: the synthesizer needs a
// whole clause, not a whole answer.
const SENTENCE = /[^.!?\n]+[.!?]+["')\]]*(?=\s|$)/

// Even without punctuation, speak something eventually. A long unbroken run
// would otherwise sit in the buffer until the reply ended, which is the
// behaviour this replaces.
const FLUSH_AT = 320

// The first segment gets a floor the rest do not. Replies often open with
// something like "Oh, Seattle in the nineties." -- about two seconds of
// speech, while the sentence behind it takes longer than that to synthesize,
// so starting on it buys a fast start and then a gap. A couple of sentences
// is enough of a lead for synthesis to stay ahead of playback afterwards.
const MIN_FIRST = 90

// The footnote block. Everything from the first marker line onward is for the
// eye only, so feeding stops there rather than sending it and relying on the
// server to throw it away.
const FOOTNOTE_START = /(^|\n)[⁰¹²³⁴-⁹]/

type Segment = { text: string; url: string | null; failed: boolean }

function storedMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Audio for replies, synthesized a sentence at a time while the text arrives.
 *
 * The transcript is still untouched by any of this: deltas are copied into a
 * buffer on their way past, and nothing here can delay or alter what renders.
 *
 * Synthesis and playback are separate loops over one ordered list. The
 * synthesizer holds a single model and serialises requests anyway, so segments
 * are sent one at a time; while each plays, the next is already being made,
 * which is what keeps the audio ahead of the ear after the first sentence.
 */
export function useSpeech() {
  const [muted, setMuted] = useState(storedMuted)
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const [state, setState] = useState<SpeechState>('idle')

  const segments = useRef<Segment[]>([])
  const buffer = useRef('')
  const stopped = useRef(false)      // feeding finished for this message
  const synthesizing = useRef(false)
  const playIndex = useRef(0)
  const audio = useRef<HTMLAudioElement | null>(null)
  const activeId = useRef<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  const reset = useCallback(() => {
    abort.current?.abort()
    abort.current = null
    audio.current?.pause()
    audio.current = null
    for (const segment of segments.current) {
      if (segment.url) URL.revokeObjectURL(segment.url)
    }
    segments.current = []
    buffer.current = ''
    playIndex.current = 0
    synthesizing.current = false
    stopped.current = false
  }, [])

  const stop = useCallback(() => {
    reset()
    activeId.current = null
    setSpeakingId(null)
    setState('idle')
  }, [reset])

  /** Play the next segment whose audio has arrived, if nothing is playing. */
  const advance = useCallback(() => {
    // Named inner function so the walk past skipped segments can recurse
    // without the callback referring to itself while it is being defined.
    const step = (): void => {
      if (audio.current && !audio.current.paused) return
      const segment = segments.current[playIndex.current]
      if (!segment) {
        // Caught up. Only finished once no more text is coming.
        if (stopped.current) {
          setState('idle')
          setSpeakingId(null)
          activeId.current = null
        }
        return
      }
      if (segment.failed) {
        playIndex.current += 1
        step()
        return
      }
      if (!segment.url) return // still being made; the worker will call back

      const element = new Audio(segment.url)
      audio.current = element
      element.onended = () => {
        playIndex.current += 1
        step()
      }
      element.onerror = () => {
        playIndex.current += 1
        step()
      }
      void element.play().then(
        () => setState('playing'),
        () => setState('error'),
      )
    }
    step()
  }, [])

  /** Synthesize queued segments in order, one at a time. */
  const pump = useCallback(async () => {
    if (synthesizing.current) return
    synthesizing.current = true
    try {
      for (;;) {
        const next = segments.current.find((s) => !s.url && !s.failed)
        if (!next) break
        const controller = new AbortController()
        abort.current = controller
        try {
          const response = await fetch(`${API_URL}/speak`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: next.text }),
            signal: controller.signal,
          })
          if (!response.ok) throw new Error(String(response.status))
          next.url = URL.createObjectURL(await response.blob())
        } catch {
          // A segment that will not synthesize is skipped, not fatal: the
          // rest of the reply is still worth hearing, and the text is on
          // screen regardless.
          next.failed = true
        }
        if (controller.signal.aborted) return
        advance()
      }
    } finally {
      synthesizing.current = false
    }
  }, [advance])

  const enqueue = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      segments.current.push({ text: trimmed, url: null, failed: false })
      void pump()
    },
    [pump],
  )

  /** Take complete sentences out of the buffer and queue them. */
  const drain = useCallback(
    (flush: boolean) => {
      for (;;) {
        const cut = buffer.current.search(FOOTNOTE_START)
        if (cut >= 0) {
          // Footnotes reached: speak what came before and stop feeding.
          enqueue(buffer.current.slice(0, cut))
          buffer.current = ''
          stopped.current = true
          return
        }
        const match = buffer.current.match(SENTENCE)
        if (match && match.index !== undefined) {
          const end = match.index + match[0].length
          if (
            segments.current.length === 0 &&
            end < MIN_FIRST &&
            !flush &&
            buffer.current.length < FLUSH_AT
          ) {
            break // hold the opener until there is enough of a lead
          }
          enqueue(buffer.current.slice(0, end))
          buffer.current = buffer.current.slice(end)
          continue
        }
        if (buffer.current.length >= FLUSH_AT) {
          const space = buffer.current.lastIndexOf(' ', FLUSH_AT)
          const end = space > 0 ? space : FLUSH_AT
          enqueue(buffer.current.slice(0, end))
          buffer.current = buffer.current.slice(end)
          continue
        }
        break
      }
      if (flush) {
        enqueue(buffer.current)
        buffer.current = ''
      }
    },
    [enqueue],
  )

  /** Feed text as it streams. Safe to call on every delta. */
  const feed = useCallback(
    (id: string, delta: string) => {
      if (muted || stopped.current) return
      if (activeId.current !== id) {
        reset()
        activeId.current = id
        setSpeakingId(id)
        setState('loading')
      }
      buffer.current += delta
      drain(false)
    },
    [muted, reset, drain],
  )

  /** No more text is coming for this message. */
  const finish = useCallback(
    (id: string) => {
      if (muted || activeId.current !== id) return
      drain(true)
      stopped.current = true
      advance()
    },
    [muted, drain, advance],
  )

  /** The per-message button: pause, resume, or speak a finished reply. */
  const speak = useCallback(
    async (id: string, text: string) => {
      if (activeId.current === id && segments.current.length) {
        if (audio.current && !audio.current.paused) {
          audio.current.pause()
          setState('paused')
        } else if (audio.current) {
          await audio.current.play()
          setState('playing')
        } else {
          advance()
        }
        return
      }
      reset()
      activeId.current = id
      setSpeakingId(id)
      setState('loading')
      buffer.current = text
      drain(true)
      stopped.current = true
    },
    [reset, drain, advance],
  )

  const toggleMuted = useCallback(() => {
    setMuted((previous) => {
      const next = !previous
      try {
        localStorage.setItem(MUTED_KEY, next ? '1' : '0')
      } catch {
        // not persisting the preference is survivable
      }
      if (next) stop()
      return next
    })
  }, [stop])

  useEffect(() => () => reset(), [reset])

  return { muted, toggleMuted, speak, feed, finish, stop, speakingId, state }
}
