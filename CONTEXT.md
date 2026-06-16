# Context — Ace deployment vocabulary

A glossary of the language we use when talking about how Ace is packaged and
deployed. Conceptual only — no implementation details.

## Terms

### Combined image
A single container image that bundles the **frontend** and the **backend**
together, fronted by one web server that serves the SPA and forwards API
traffic to the backend in the same container. The datastores (Postgres,
Valkey) are **not** part of it — they are external. Intended for simple
single-host deployments (e.g. a low-power VM) where running and wiring several
images is undesirable. Published as the *standalone* image
(`ace-standalone`).

### Frontend-only image
A container image that serves just the SPA. It can forward API traffic to a
**backend** that lives elsewhere (another container or host), with that
backend's address supplied at run time rather than baked in at build time.
This is the image used in Kubernetes, where path routing to the backend is
handled outside the image.

### Backend upstream (`ACE_BACKEND_URL`)
The address the web server forwards API traffic to. It is the *upstream the
proxy points at*, not an address the browser ever contacts directly. When
unset, no forwarding is configured and API routing is assumed to be handled by
the surrounding infrastructure (e.g. an ingress).

### Same-origin API
The default contract: the browser sends API calls to the same origin that
served the page. Whatever resolves those calls — an ingress, the combined
image's web server, or a configured frontend-only image — is a deployment
concern invisible to the browser.
