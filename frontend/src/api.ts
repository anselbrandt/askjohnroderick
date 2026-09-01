/**
 * Same-origin in dev, so requests go through the vite proxy: it adds the
 * CF-Connecting-IP header that /chat is gated on, which a
 * browser cannot set for itself.
 */
export const API_URL =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.DEV ? '' : 'https://ajr.anselbrandt.net')
