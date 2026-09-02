import { useCallback, useEffect, useRef, useState } from 'react'
import { API_URL } from '../api'

export type SpeechState = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

const MUTED_KEY = 'ajr.muted'

function storedMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1'
  } catch {
    return false // private window, or site data blocked
  }
}

/**
 * Audio for replies, kept entirely separate from the transcript.
 *
 * The text streams and renders exactly as it did before; nothing here can
 * delay or alter it. Synthesis needs whole sentences, so it happens after a
 * reply finishes, and a failure leaves the reply on screen unread rather than
 * breaking the turn.
 */
export function useSpeech() {
  const [muted, setMuted] = useState(storedMuted)
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const [state, setState] = useState<SpeechState>('idle')

  const audio = useRef<HTMLAudioElement | null>(null)
  const url = useRef<string | null>(null)
  // One synthesis in flight at a time; a new request supersedes the old.
  const request = useRef<AbortController | null>(null)

  const release = useCallback(() => {
    audio.current?.pause()
    audio.current = null
    if (url.current) URL.revokeObjectURL(url.current)
    url.current = null
  }, [])

  const stop = useCallback(() => {
    request.current?.abort()
    request.current = null
    release()
    setSpeakingId(null)
    setState('idle')
  }, [release])

  const speak = useCallback(
    async (id: string, text: string) => {
      if (!text.trim()) return

      // Same message again: toggle rather than re-synthesize.
      if (speakingId === id && audio.current) {
        if (audio.current.paused) {
          await audio.current.play()
          setState('playing')
        } else {
          audio.current.pause()
          setState('paused')
        }
        return
      }

      stop()
      const controller = new AbortController()
      request.current = controller
      setSpeakingId(id)
      setState('loading')

      try {
        const response = await fetch(`${API_URL}/speak`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`${response.status}`)

        const blob = await response.blob()
        if (controller.signal.aborted) return
        const objectUrl = URL.createObjectURL(blob)
        url.current = objectUrl

        const element = new Audio(objectUrl)
        audio.current = element
        element.onended = () => {
          setState('idle')
          setSpeakingId(null)
        }
        element.onerror = () => setState('error')
        await element.play()
        setState('playing')
      } catch {
        // An aborted request is a supersession, not a failure.
        if (!controller.signal.aborted) setState('error')
      } finally {
        if (request.current === controller) request.current = null
      }
    },
    [speakingId, stop],
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

  useEffect(() => () => release(), [release])

  return { muted, toggleMuted, speak, stop, speakingId, state }
}
