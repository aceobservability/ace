// The browser always talks to the same origin that served the page, so every
// API call goes to a relative `/api/...`. Whatever resolves it — an ingress,
// the combined image's nginx, or a configured frontend-only image — is a
// deployment concern invisible here. See CONTEXT.md and
// docs/adr/0001-standalone-image-and-runtime-api-proxy.md.
export const API_BASE = ''
