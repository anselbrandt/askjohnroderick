import { useEffect, useState } from 'react'
import { API_URL } from './api'
import { Chat } from './chat/Chat'

type Health = 'pending' | 'ok' | 'error'

const COLORS: Record<Health, string> = {
  pending: 'transparent',
  ok: '#22c55e',
  error: '#ef4444',
}

function App() {
  const [health, setHealth] = useState<Health>('pending')

  useEffect(() => {
    const controller = new AbortController()

    fetch(`${API_URL}/health`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`)
        }
        return response.json()
      })
      .then((data) => {
        console.log('health:', data)
        setHealth('ok')
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          console.error('health check failed:', error)
          setHealth('error')
        }
      })

    return () => controller.abort()
  }, [])

  return (
    <>
      <img className="backdrop" src="/john_roderick.jpg" alt="John Roderick" />
      <Chat />
      <span
        title={`API health: ${health}`}
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: COLORS[health],
          transition: 'background 200ms ease',
        }}
      />
    </>
  )
}

export default App
