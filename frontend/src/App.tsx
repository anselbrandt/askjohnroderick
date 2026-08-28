import { useEffect, useState } from 'react'

const API_URL = 'https://ajr.anselbrandt.net'

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
      <img
        src="/john_roderick.jpg"
        alt="John Roderick"
        style={{
          width: '100vw',
          height: '100vh',
          objectFit: 'contain',
          display: 'block',
        }}
      />
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
