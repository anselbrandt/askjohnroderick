import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, type ProxyOptions } from 'vite'

/**
 * The first address from the backend's ALLOWED_IPS, or ''.
 *
 * The API gates /chat and /compare on CF-Connecting-IP, which only Cloudflare
 * can set -- so a browser talking straight to a local backend is always
 * refused. Rather than loosen that check (production reaches the origin
 * through a tunnel, so it arrives as loopback too, and trusting loopback would
 * open the routes to everyone), the dev server proxies the API and adds the
 * header itself. Nothing here ships: `proxy` applies to `vite dev` only.
 */
function devClientIp(): string {
  try {
    const env = readFileSync('../backend/.env', 'utf8')
    const line = env.split('\n').find((l) => l.startsWith('ALLOWED_IPS='))
    return line?.slice('ALLOWED_IPS='.length).split(',')[0].trim() ?? ''
  } catch {
    return '' // no backend checkout next door; assume an open allowlist
  }
}

const API_TARGET = process.env.VITE_DEV_API ?? 'http://127.0.0.1:8002'
const ROUTES = ['/health', '/chat', '/compare']

const proxied: ProxyOptions = {
  target: API_TARGET,
  changeOrigin: true,
  // Agents answering from the corpus run several searches; the default proxy
  // timeout cuts the stream off mid-answer.
  timeout: 300_000,
  proxyTimeout: 300_000,
  configure: (proxy) => {
    const ip = devClientIp()
    if (ip) {
      proxy.on('proxyReq', (proxyReq) => proxyReq.setHeader('cf-connecting-ip', ip))
    }
  },
}

export default defineConfig({
  plugins: [react()],
  server: { proxy: Object.fromEntries(ROUTES.map((route) => [route, proxied])) },
})
