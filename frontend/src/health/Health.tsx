import { useEffect, useState } from 'react'
import { API_URL } from '../api'
import './health.css'

type Status = 'ok' | 'loading' | 'down'

type Service = {
  name: string
  label: string
  status: Status
  detail?: string | null
}

type Report = {
  status: 'ok' | 'degraded'
  services: Service[]
}

// Checked again while the page is open, not just once on mount. The outage
// this replaces lasted a week; a reader who left the tab open would have gone
// on seeing whatever was true when they loaded it.
const POLL_MS = 30_000

// A failed fetch is itself a report: the API is what serves /health, so not
// getting an answer says exactly one thing, and it says it about one service.
const UNREACHABLE: Service[] = [
  { name: 'api', label: 'API', status: 'down', detail: 'unreachable' },
]

export function Health() {
  const [services, setServices] = useState<Service[] | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    const check = async () => {
      try {
        const response = await fetch(`${API_URL}/health`, {
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`)
        }
        const report: Report = await response.json()
        setServices(report.services)
      } catch (error) {
        if ((error as Error).name === 'AbortError') return
        console.error('health check failed:', error)
        setServices(UNREACHABLE)
      }
    }

    check()
    const timer = setInterval(check, POLL_MS)

    return () => {
      controller.abort()
      clearInterval(timer)
    }
  }, [])

  // Nothing until the first answer arrives. A placeholder row would either
  // claim a state it has not checked or flash grey on every load.
  if (!services) return null

  return (
    <div className="health">
      {services.map((service) => (
        <div
          key={service.name}
          className="health-service"
          data-status={service.status}
          title={`${service.label}: ${service.status}${
            service.detail ? ` — ${service.detail}` : ''
          }`}
        >
          <span className="health-label">{service.label}</span>
          <span className="health-dot" />
        </div>
      ))}
    </div>
  )
}
