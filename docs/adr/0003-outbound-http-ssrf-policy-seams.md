---
status: accepted
---

# Outbound HTTP SSRF policy seams

> **Implementation status:** Accepted description of *current* behaviour after
> datasource query/stream wiring ([#377](https://github.com/aceobservability/ace/issues/377) /
> [#374](https://github.com/aceobservability/ace/issues/374)) and org SSO IdP
> HTTP ([#379](https://github.com/aceobservability/ace/issues/379)). Folding AI
> outbound onto `ssrf.SafeClient` / `ssrf.DatasourceClient` is **deferred**
> ([#376](https://github.com/aceobservability/ace/issues/376)); do not treat
> this ADR as permission to change AI HTTP semantics. DatasourceClient
> dial/pin/proxy/TLS is closed — do not retouch it for Grafana or IdP.

Ace has **four** outbound HTTP seams and **three** client implementations.
IdP org-SSO reuses `ssrf.SafeClient`; it is not `DatasourceClient`. Jan
accepted a dedicated datasource client first; AI remains on a config-time URL
check plus Go's default `http.Client`.

## Why four seams

| Seam | Trust model | Typical targets |
|------|-------------|-----------------|
| **Grafana / untrusted URL** | User-supplied URL in a request (import/connect). Must not reach the cluster or cloud metadata. | Public Grafana hosts |
| **Configured datasource** | Operator-configured observability backends. Private/in-cluster URLs are required. | Prometheus, Loki, Victoria*, Tempo, ES, ClickHouse, Alertmanager, … |
| **AI provider** | Org-admin configured OpenAI-compatible `base_url`. Local Ollama on loopback is required; RFC1918 cluster IPs are not the intended default. | `api.openai.com`, `localhost`/`127.0.0.1` Ollama, public gateways |
| **Org SSO identity provider** | Operator-configured public IdP (Google, Microsoft, Okta). Browser redirects to the IdP; Ace's backend then calls token / userinfo / OIDC discovery. On-prem/private Okta is **not** a product need. | `accounts.google.com`, `login.microsoftonline.com`, `*.okta.com` |

A single client cannot satisfy Grafana, datasource, and AI: `SafeClient` would
break in-cluster datasources **and** local Ollama; `DatasourceClient` would
allow AI providers to target arbitrary private networks that `validateBaseURL`
currently rejects at save time.

IdP HTTP **does** share `SafeClient` with Grafana. Mapping IdP onto
`DatasourceClient` would allow RFC1918 IdPs (the old `isValidHostname` check
accepted `10.0.0.1` and `169.254.169.254`). That is rejected.

## Inventory

### 1. `ssrf.SafeClient` + `ValidateURL` / `IsValidRedirectURL`

**Where:** `backend/internal/ssrf/ssrf.go`; call sites
`handlers.GrafanaDiscoveryHandler` and `backend/internal/sso` (injected from
router setup via `sso.New(ssrf.SafeClient(...))`).

**Allows:** `http`/`https` URLs whose hostname (literal or DNS) is **not** in
private/internal ranges.

**Blocks (parse + DNS + dial):**

- Non-http(s), missing host, userinfo
- `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`
- IPv6 `::1/128`, `fc00::/7`, `fe80::/10`

**Client behaviour:**

- Custom `DialContext`: fail-closed if **any** resolved IP is blocked; otherwise
  try remaining addresses
- `urlPolicyTransport` re-validates the request URL on every `RoundTrip`
  (covers redirect hops that Go follows by default)
- **No HTTP proxy** (`useProxy` false); destination hostnames are **not** pinned
  (multi-A/AAAA fallback stays on the dialer)
- Grafana **overrides** `CheckRedirect` to `ErrUseLastResponse` (does not follow)
- IdP keeps the client's default redirect policy (RoundTrip still validates)

### 2. `ssrf.DatasourceClient` + `ValidateDatasourceURL` / `IsLocalURL`

**Where:** `ssrf.go`; wired on query/stream clients in `backend/internal/datasource/*`
and `handlers/prometheus.go`. Non-HTTP: Loki websocket uses `DatasourceDialContext`.

**Allows:** `http`/`https` including private/loopback/link-local **except** the
cloud metadata address.

**Blocks:**

- Non-http(s), missing host, userinfo
- Literal or resolved `169.254.169.254` only (not the rest of `169.254.0.0/16`)

**Client behaviour:**

- Same dial-time reject, but `rejectCloudMetadata` instead of `isBlockedIP`
- Explicit `CheckRedirect`: max 10 hops; each `Location` must pass
  `ValidateDatasourceURL`
- Honors `HTTP(S)_PROXY` / `NO_PROXY`. When a proxy hop is used, destination
  hostnames are resolved and **pinned** to a policy-checked IP before the proxy
  sees the request (closes proxy-side DNS rebinding). Direct dials stay unpinned.

Config-time validation: `handlers/datasource.go` and `datasource/client.go`
(`IsLocalURL` / `ValidateDatasourceURL`) — same policy as the client, not the
Grafana CIDR list.

### 3. `handlers.validateBaseURL` + vanilla `http.Client`

**Where (check):** `backend/internal/handlers/ai_handler.go` —
`validateBaseURL` / `checkDangerousIP`, called on AI provider **create** and
**update** only.

**Where (HTTP):** `backend/internal/handlers/ai_provider.go` —
`OpenAICompatibleProvider` and `CopilotProvider` use `&http.Client{Timeout: …}`
with the default transport (no dial policy, no redirect policy, proxy via
environment as Go default). Copilot also follows `endpoints.api` from GitHub's
token JSON without `validateBaseURL`. Device-flow / OAuth in
`github_copilot.go` uses hardcoded `github.com` URLs and the same default
client.

**Allows:**

- `http`/`https`
- Hostname `localhost` or `127.0.0.1` (early return; DNS not consulted — so
  `localhost` → `::1` is allowed)
- Public addresses

**Blocks (config-time only):**

- Userinfo (`@` in the raw string), fragments (`#`)
- Literal/resolved `169.254.169.254`
- Other loopback (`ip.IsLoopback()`, e.g. `127.0.0.2`, `::1` as a literal)
- RFC1918 / IPv6 ULA (`ip.IsPrivate()`)

**Does not block (unlike `SafeClient`):** the rest of `169.254.0.0/16`, IPv6
link-local `fe80::/10`. DNS lookup failures are ignored (`if err == nil`).

**Does not enforce at request time:** after a provider is saved, outbound
calls do not re-check IPs, do not fail closed on mixed A/AAAA records, and
follow redirects with Go defaults. DNS rebinding after save is out of scope
of `validateBaseURL`.

### 4. Org SSO IdP — `ssrf.SafeClient` (not a fourth client)

**Where:** `backend/internal/sso`. `sso.New(client)` is injected from router
setup (`cmd/api/main.go`) with `ssrf.SafeClient`. Every discovery, token
exchange, userinfo, and `TestIssuer` call attaches that client via
`oauth2.HTTPClient` / `oidc.ClientContext`. There is no `init()` and no
package-level default client.

**Allows / blocks:** same as seam 1 (`ValidateURL` + `SafeClient`).

**Call sites:**

- Google: hardcoded `google.Endpoint` + `www.googleapis.com` userinfo
- Microsoft: hardcoded host `login.microsoftonline.com`; `tenant_id` is a
  **path segment** (GUID / `common`), not a hostname — do not run
  `ValidateURL` on it as a host
- Okta: `tenant_id` **is** an operator hostname. Issuer
  `https://{tenant}` and token `https://{tenant}/oauth2/v1/token` go through
  `ssrf.ValidateURL` **before store** (Configure fail-closed) and through
  SafeClient at exchange / OIDC discovery / TestIssuer. `isValidHostname`
  (syntactic; accepted private IPs) is deleted.

**Does not cover:** GitHub Copilot device-flow / `endpoints.api` (still seam 3).

## Gap statement

| | Grafana | Datasource | AI OpenAI-compatible | Org SSO IdP |
|--|---------|------------|----------------------|-------------|
| Policy function | `ValidateURL` | `ValidateDatasourceURL` | `validateBaseURL` | `ValidateURL` |
| HTTP client | `SafeClient` | `DatasourceClient` | default `http.Client` | `SafeClient` |
| Private networks | blocked | **allowed** | **blocked** except `localhost`/`127.0.0.1` | blocked |
| Cloud metadata `169.254.169.254` | blocked (whole `169.254/16`) | blocked (that IP) | blocked (that IP, save time) | blocked (whole `169.254/16`) |
| Dial-time enforcement | yes | yes | **no** | yes |
| Redirect policy | Grafana: don't follow; client RoundTrip would still validate | metadata check, 10-hop cap | Go default, **no** Ace policy | SafeClient RoundTrip validates |
| Proxy / dest pin | no proxy | pin when proxied | Go default proxy, **no** pin | no proxy (SafeClient) |

**AI outbound is not an instance of either SSRF client.** Mapping it onto
`SafeClient` would reject local Ollama. Mapping it onto `DatasourceClient`
would loosen AI toward any RFC1918 target and still would not match today's
fragment/`localhost` special cases. A correct fold-in is a dedicated AI client
or a parameterized policy (dial + redirect + the AI allow-list), which is
explicitly deferred.

**IdP is not DatasourceClient.** On-prem Okta would require that client (or a
new policy). That is out of product scope; Configure and TestIssuer fail
closed on private and metadata hosts.

## Considered options (this pass)

- **Fold AI onto `DatasourceClient` now** — rejected: changes allow-list
  (private networks become reachable) and request-time behaviour.
- **Fold AI onto `SafeClient` now** — rejected: breaks `localhost`/`127.0.0.1`
  Ollama.
- **Share `parseHTTPURL` into `validateBaseURL`** — skipped: would drop the
  fragment check and add a required-host error; not a no-op.
- **IdP through `DatasourceClient`** — rejected: would allow RFC1918 IdPs.
- **Document the seams and leave clients unchanged** — chosen for AI;
  IdP was a follow-up that reuses `SafeClient`.

## Consequences

- New observability HTTP clients continue to use `DatasourceClient`, not
  `SafeClient` or `validateBaseURL`.
- New Grafana-like untrusted fetches continue to use `SafeClient`.
- New org-SSO IdP HTTP continues to use `SafeClient` via `internal/sso`, not
  `DatasourceClient` and not `http.DefaultClient`.
- AI provider HTTP stays on default clients until a dedicated follow-up
  specifies dial/redirect semantics that preserve local Ollama and do not
  open RFC1918.
- SSO Copilot OAuth to `github.com` is hardcoded and out of the IdP ticket;
  Copilot `endpoints.api` remains an AI outbound URL without
  `validateBaseURL`.
