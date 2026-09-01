import { useCallback, useEffect, useRef, useState } from 'react'
import { ARMS, streamCompare, type Arm, type CompareEvent } from './stream'

export type ToolCall = { name: string; args: string }

export type ArmState = {
  text: string
  tools: ToolCall[]
  error: string | null
  done: boolean
}

export type CompareState = Record<Arm, ArmState>

const empty = (): CompareState => ({
  plain: { text: '', tools: [], error: null, done: false },
  grounded: { text: '', tools: [], error: null, done: false },
})

export type CompareStatus = 'idle' | 'streaming' | 'error'

export function useCompare() {
  const [question, setQuestion] = useState('')
  const [arms, setArms] = useState<CompareState>(empty)
  const [status, setStatus] = useState<CompareStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  // Which arm is drawn on the left. Re-rolled per question so that a reader
  // comparing many answers isn't judging position as well as content.
  const [swapped, setSwapped] = useState(false)

  const abort = useRef<AbortController | null>(null)

  const ask = useCallback(async (text: string, blind: boolean) => {
    const asked = text.trim()
    if (!asked || abort.current) return

    const controller = new AbortController()
    abort.current = controller
    setQuestion(asked)
    setArms(empty())
    setError(null)
    setSwapped(blind ? Math.random() < 0.5 : false)
    setStatus('streaming')

    const patch = (arm: Arm, update: (prev: ArmState) => ArmState) =>
      setArms((prev) => ({ ...prev, [arm]: update(prev[arm]) }))

    try {
      for await (const event of streamCompare(asked, controller.signal)) {
        const arm = event.arm
        if (!arm) continue // the trailing overall {done: true}
        // Captured into locals: TypeScript drops property narrowing inside the
        // `patch` callbacks, and the values are what we want anyway.
        const { error: failed, delta, tool, args } = event as CompareEvent
        if (failed) {
          patch(arm, (p) => ({ ...p, error: failed, done: true }))
        } else if (delta) {
          patch(arm, (p) => ({ ...p, text: p.text + delta }))
        } else if (tool) {
          patch(arm, (p) => ({
            ...p,
            tools: [...p.tools, { name: tool, args: args ?? '' }],
          }))
        } else if (event.done) {
          patch(arm, (p) => ({ ...p, done: true }))
        }
      }
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
  }, [])

  const stop = useCallback(() => abort.current?.abort(), [])

  useEffect(() => () => abort.current?.abort(), [])

  const columns: Arm[] = swapped ? [ARMS[1], ARMS[0]] : ARMS

  return { question, arms, columns, status, error, ask, stop }
}
