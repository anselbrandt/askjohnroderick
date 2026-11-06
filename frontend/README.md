# Frontend

The React app served at `askjohnroderick.com` and `www.askjohnroderick.com`. It
calls the API at `ajr.anselbrandt.net` directly (`src/api.ts`); nothing is
proxied in production.

```bash
npm run dev       # Vite inside the local Workers runtime; proxies /health, /chat, /speak to :8002
npm run check     # oxfmt, oxlint, tsc
npm run build     # tsc -b && cf build
npm run deploy    # tsc -b && cf deploy, needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID
npx cf deploy --dry-run   # builds and validates, sends no API requests
```

## Deploy

The site is the Cloudflare Worker `askjohnroderick`, with static assets. It has
been served that way since 2026-11-06; before that it was the Cloudflare Pages
project `askjohnroderick` (deleted on the same day), which was deployed by the
poller in `~/dev/pages-deploy`. The setup is a copy of `~/dev/okapirank`'s;
its `docs/frontend-deploy.md` has the longer history.

- `cloudflare.config.ts` declares the Worker: name, entrypoint,
  single-page-application not-found handling, the two custom domains,
  observability.
- `worker/index.ts` runs only for requests that match no asset and are not
  navigations (navigations get `index.html`, which is how `/speak` works as a
  page), so it answers 404.
- `vite.config.ts` adds `cloudflare()` from `@cloudflare/vite-plugin`. `cf` and
  the plugin are pinned exactly because both are betas.

Build output goes to `.cloudflare/output/v0/`, not `dist/`.

### On push: Workers Builds

Pushes to `master` that touch `frontend/` build and deploy through Workers
Builds. The trigger lives in Cloudflare, not in this repo:

| Setting             | Value                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------- |
| Repository / branch | `anselbrandt/askjohnroderick`, `master`                                                      |
| Root directory      | `frontend` (required: at `/` there is no `cloudflare.config.ts`, and `cf` would guess wrong) |
| Build command       | empty (`cf deploy` builds)                                                                   |
| Deploy command      | `npm run deploy`, so a type error fails the build                                            |
| Watch paths         | `frontend/*`                                                                                 |

To inspect builds from the shell, run `cf builds …` with
`CLOUDFLARE_API_TOKEN=$CLOUDFLARE_BUILDS_TOKEN`. The Builds API accepts only
user tokens, not the account-owned `CLOUDFLARE_API_TOKEN`.

To roll back, deploy a previous Worker version (`cf workers versions`). There is
no Pages fallback any more.
