// Requests reach this Worker only when no static asset matches them. With
// `notFoundHandling: 'single-page-application'`, navigations to app routes are
// answered with index.html before getting here, so what is left is a miss for
// a file (a stale hashed bundle, a mistyped asset path), and that is a 404.
//
// The API is not proxied through here: the app calls ajr.anselbrandt.net
// directly (src/api.ts).
export default {
  fetch(): Response {
    return new Response('Not found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  },
}
