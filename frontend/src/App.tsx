import { useEffect } from 'react'

const API_URL = 'https://ajr.anselbrandt.net'

function App() {
  useEffect(() => {
    const controller = new AbortController()

    fetch(`${API_URL}/health`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`)
        }
        return response.json()
      })
      .then((data) => console.log('health:', data))
      .catch((error) => {
        if (error.name !== 'AbortError') {
          console.error('health check failed:', error)
        }
      })

    return () => controller.abort()
  }, [])

  return (
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
  )
}

export default App
