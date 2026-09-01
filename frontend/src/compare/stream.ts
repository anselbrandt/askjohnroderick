import { postSSE } from '../sse'

/** Which knowledge the arm was allowed: the model alone, or the archive too. */
export type Arm = 'plain' | 'grounded'

export const ARMS: Arm[] = ['plain', 'grounded']

export const ARM_LABEL: Record<Arm, string> = {
  plain: 'Model only',
  grounded: 'Model + archive',
}

export type CompareEvent = {
  arm?: Arm
  delta?: string
  tool?: string
  args?: string
  error?: string
  done?: boolean
}

export function streamCompare(question: string, signal: AbortSignal) {
  return postSSE<CompareEvent>('/compare', { question }, signal)
}
