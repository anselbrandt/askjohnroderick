import { defineConfig } from 'cf/config'

// The frontend as a Cloudflare Worker with static assets. `cf build` runs
// `vite build` through @cloudflare/vite-plugin (see vite.config.ts); the
// assets are Vite's client build, so there is no directory to name here.
//
// `cf build` and `cf deploy` run `vite build`, not the `build` script, so they
// skip `tsc -b`. Use `npm run deploy`, which typechecks first.
export default defineConfig({
  worker: {
    name: 'askjohnroderick',
    compatibilityDate: '2026-11-01',
    entrypoint: './worker/index.ts',
    // Unknown navigation paths get index.html: the app routes client-side, and
    // /speak is a page as well as an API route on the backend.
    assets: { notFoundHandling: 'single-page-application' },
    domains: ['askjohnroderick.com', 'www.askjohnroderick.com'],
    observability: { enabled: true },
  },
})
