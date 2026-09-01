import { useEffect, useState } from 'react'
import { API_URL } from './api'
import { Chat } from './chat/Chat'
import { Compare } from './compare/Compare'

type Health = 'pending' | 'ok' | 'error'

const COLORS: Record<Health, string> = {
  pending: 'transparent',
  ok: '#22c55e',
  error: '#ef4444',
}

/** `#compare` opens the side-by-side view; anything else is the chat. */
function useRoute() {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

function App() {
  const [health, setHealth] = useState<Health>('pending')
  const route = useRoute()

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

      {route === '#compare' ? (
        <Compare />
      ) : (
        <>
          <Chat />
          <a className="to-compare" href="#compare">
            side by side
          </a>
        </>
      )}

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
