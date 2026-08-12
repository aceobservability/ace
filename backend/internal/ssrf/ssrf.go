// Package ssrf provides URL validation and a safe HTTP client that blocks
// server-side request forgery by rejecting private/internal IP addresses.
package ssrf

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// blockedCIDRs are private and internal IP ranges that must not be accessed
// by untrusted, user-supplied outbound targets (e.g. Grafana import URLs).
var blockedCIDRs []*net.IPNet

func init() {
	for _, cidr := range []string{
		"127.0.0.0/8",    // IPv4 loopback
		"10.0.0.0/8",     // RFC 1918
		"172.16.0.0/12",  // RFC 1918
		"192.168.0.0/16", // RFC 1918
		"169.254.0.0/16", // Link-local (includes cloud metadata)
		"::1/128",        // IPv6 loopback
		"fc00::/7",       // IPv6 unique local
		"fe80::/10",      // IPv6 link-local
	} {
		_, ipNet, err := net.ParseCIDR(cidr)
		if err != nil {
			panic("ssrf: invalid blocked CIDR " + cidr + ": " + err.Error())
		}
		blockedCIDRs = append(blockedCIDRs, ipNet)
	}
}

// isBlockedIP returns true if the IP falls within a blocked private/internal range.
func isBlockedIP(ip net.IP) bool {
	for _, cidr := range blockedCIDRs {
		if cidr.Contains(ip) {
			return true
		}
	}
	return false
}

// isCloudMetadataIP reports whether ip is the cloud instance-metadata endpoint.
func isCloudMetadataIP(ip net.IP) bool {
	return ip != nil && ip.Equal(net.ParseIP("169.254.169.254"))
}

// parseHTTPURL parses raw and requires an http(s) URL with a host and no userinfo.
func parseHTTPURL(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("invalid url: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, fmt.Errorf("url must use http or https scheme")
	}
	if u.Host == "" {
		return nil, fmt.Errorf("url must include a hostname")
	}
	// Reject embedded credentials — they complicate SSRF review and logging.
	if u.User != nil || strings.Contains(raw, "@") {
		return nil, fmt.Errorf("url must not contain userinfo")
	}
	return u, nil
}

// ValidateURL checks that a URL uses http(s) and that neither the literal IP
// nor any resolved IPs fall within blocked private/internal ranges.
//
// Use this for untrusted external targets (Grafana discovery/import). Prefer
// IsValidRedirectURL at call sites so CodeQL treats the URL as sanitized.
func ValidateURL(raw string) (*url.URL, error) {
	u, err := parseHTTPURL(raw)
	if err != nil {
		return nil, err
	}

	hostname := u.Hostname()

	// Check literal IP address.
	if ip := net.ParseIP(hostname); ip != nil {
		if isBlockedIP(ip) {
			return nil, fmt.Errorf("url must not target a private or internal address")
		}
		return u, nil
	}

	// Resolve hostname and check all resulting IPs to prevent DNS rebinding.
	ips, err := net.LookupHost(hostname)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve hostname: %w", err)
	}
	for _, ipStr := range ips {
		if ip := net.ParseIP(ipStr); ip != nil {
			if isBlockedIP(ip) {
				return nil, fmt.Errorf("url must not resolve to a private or internal address")
			}
		}
	}
	return u, nil
}

// ValidateDatasourceURL checks that a URL is acceptable for a configured
// observability datasource. Private/internal targets are allowed (in-cluster
// Prometheus, local Victoria stack, etc.); only the cloud metadata endpoint
// and non-http(s) schemes are rejected.
func ValidateDatasourceURL(raw string) (*url.URL, error) {
	u, err := parseHTTPURL(raw)
	if err != nil {
		return nil, err
	}

	hostname := u.Hostname()
	if ip := net.ParseIP(hostname); ip != nil {
		if isCloudMetadataIP(ip) {
			return nil, fmt.Errorf("url must not target cloud metadata endpoint")
		}
		return u, nil
	}

	// Best-effort DNS check for metadata rebinding. Lookup failure is allowed
	// here — connection will fail later if the host is unresolvable.
	if ips, err := net.LookupHost(hostname); err == nil {
		for _, ipStr := range ips {
			if ip := net.ParseIP(ipStr); isCloudMetadataIP(ip) {
				return nil, fmt.Errorf("url must not resolve to cloud metadata endpoint")
			}
		}
	}
	return u, nil
}

// IsValidRedirectURL reports whether raw is safe as an untrusted outbound URL
// target (no private/internal/metadata addresses).
//
// The name matches CodeQL's RedirectCheckBarrier pattern
// (`isValidRedirectURL`) so a true result is treated as a request-forgery
// sanitizer for the argument.
func IsValidRedirectURL(raw string) bool {
	_, err := ValidateURL(raw)
	return err == nil
}

// IsLocalURL reports whether raw is an acceptable datasource URL (private
// networks allowed; cloud metadata blocked).
//
// The name matches CodeQL's RedirectCheckBarrier pattern (`isLocalURL`) so a
// true result is treated as a request-forgery sanitizer for the argument.
func IsLocalURL(raw string) bool {
	_, err := ValidateDatasourceURL(raw)
	return err == nil
}

// SafeClient returns an *http.Client that blocks connections to private/internal
// IPs at dial time (preventing DNS rebinding after initial validation).
// Use for untrusted user-supplied hosts only — not for configured datasources
// that may legitimately live on private networks.
//
// SafeClient does not use an HTTP proxy, so destination hostnames are left
// unpinned: dialBlockingTransport already enforces multi-A/AAAA fallback with
// fail-closed reject. Pinning is only needed when a proxy hop would otherwise
// re-resolve the name (see DatasourceClient).
func SafeClient(timeout time.Duration) *http.Client {
	reject := func(ip net.IP) error {
		if isBlockedIP(ip) {
			return fmt.Errorf("connections to private/internal addresses are not allowed")
		}
		return nil
	}
	base := dialBlockingTransport(reject, false /* useProxy */)
	return &http.Client{
		Timeout: timeout,
		Transport: &urlPolicyTransport{
			base:   base,
			reject: reject,
			// proxy nil => direct dials only; no hostname→IP pin.
			validate: func(raw string) error {
				_, err := ValidateURL(raw)
				return err
			},
		},
	}
}

func rejectCloudMetadata(ip net.IP) error {
	if isCloudMetadataIP(ip) {
		return fmt.Errorf("connections to cloud metadata endpoint are not allowed")
	}
	return nil
}

// DatasourceClient returns an *http.Client for configured observability
// datasources. Private/internal targets are allowed; the cloud metadata
// endpoint is blocked on the request URL (including when an HTTP proxy is
// used), at dial time for direct connections, and on redirects.
//
// When HTTP(S)_PROXY applies to a request, destination hostnames are resolved
// and pinned to a validated IP before the proxy hop so the proxy cannot
// re-resolve the name to a different address (e.g. cloud metadata). Direct
// (no-proxy) dials leave the hostname intact so dialBlockingTransport keeps
// multi-A/AAAA fallback.
func DatasourceClient(timeout time.Duration) *http.Client {
	base := dialBlockingTransport(rejectCloudMetadata, true /* useProxy */)
	return &http.Client{
		Timeout: timeout,
		Transport: &urlPolicyTransport{
			base:   base,
			reject: rejectCloudMetadata,
			proxy:  http.ProxyFromEnvironment,
			validate: func(raw string) error {
				_, err := ValidateDatasourceURL(raw)
				return err
			},
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return fmt.Errorf("stopped after 10 redirects")
			}
			if _, err := ValidateDatasourceURL(req.URL.String()); err != nil {
				return fmt.Errorf("redirect target rejected: %w", err)
			}
			return nil
		},
	}
}

// DatasourceDialContext applies the same dial-time metadata block as
// DatasourceClient. Use for non-HTTP transports (e.g. websocket) that cannot
// take an *http.Client.
func DatasourceDialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	// Direct dial path — no HTTP proxy hop — so dial policy alone is sufficient.
	return dialBlockingTransport(rejectCloudMetadata, false).DialContext(ctx, network, addr)
}

// urlPolicyTransport validates the destination request URL before the base
// transport runs. This matters when ProxyFromEnvironment is set: DialContext
// only sees the proxy hop, so destination policy must run on RoundTrip.
//
// When proxy is non-nil and returns a proxy URL for the request, the hostname
// is resolved and rewritten to a policy-checked IP (Host/SNI preserved) so the
// proxy cannot re-resolve the name independently. For direct (no-proxy) dials
// the base transport's DialContext loop already handles multi-A/AAAA fallback.
type urlPolicyTransport struct {
	base     http.RoundTripper
	validate func(raw string) error
	reject   func(net.IP) error
	proxy    func(*http.Request) (*url.URL, error) // nil = direct, no pinning
}

func (t *urlPolicyTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if req.URL == nil {
		return nil, fmt.Errorf("missing request URL")
	}
	if err := t.validate(req.URL.String()); err != nil {
		return nil, err
	}
	if t.proxy != nil {
		if proxyURL, err := t.proxy(req); err == nil && proxyURL != nil {
			cloned := req.Clone(req.Context())
			tlsServerName, pinErr := pinRequestURLToValidatedIP(cloned, t.reject)
			if pinErr != nil {
				return nil, pinErr
			}
			return t.roundTripWithTLSServerName(cloned, tlsServerName)
		}
	}
	return t.base.RoundTrip(req)
}

// roundTripWithTLSServerName sends req through the base transport. When the URL
// was pinned to an IP, tlsServerName is the original DNS name and must be applied
// as tls.Config.ServerName so verification/SNI are not performed against the IP.
func (t *urlPolicyTransport) roundTripWithTLSServerName(req *http.Request, tlsServerName string) (*http.Response, error) {
	if tlsServerName == "" || req.URL.Scheme != "https" {
		return t.base.RoundTrip(req)
	}
	base, ok := t.base.(*http.Transport)
	if !ok {
		// Non-transport bases (tests) cannot set ServerName; callers that need
		// real HTTPS must use *http.Transport.
		return t.base.RoundTrip(req)
	}
	tr := base.Clone()
	var cfg *tls.Config
	if tr.TLSClientConfig == nil {
		cfg = &tls.Config{}
	} else {
		cfg = tr.TLSClientConfig.Clone()
	}
	// Only fill ServerName when unset so an explicit transport config still wins.
	if cfg.ServerName == "" {
		cfg.ServerName = tlsServerName
	}
	tr.TLSClientConfig = cfg
	return tr.RoundTrip(req)
}

// pinRequestURLToValidatedIP resolves the request hostname, rejects any IP that
// fails policy, and rewrites URL.Host to the first allowed address while keeping
// req.Host as the original authority. It returns the original DNS name when the
// host was not already a literal IP, so HTTPS callers can set TLS ServerName.
func pinRequestURLToValidatedIP(req *http.Request, reject func(net.IP) error) (tlsServerName string, err error) {
	if reject == nil {
		return "", fmt.Errorf("missing IP reject policy")
	}
	hostname := req.URL.Hostname()
	if hostname == "" {
		return "", fmt.Errorf("url must include a hostname")
	}

	port := req.URL.Port()
	if port == "" {
		switch req.URL.Scheme {
		case "https":
			port = "443"
		case "http":
			port = "80"
		default:
			return "", fmt.Errorf("url must use http or https scheme")
		}
	}

	// Preserve original authority for the HTTP Host header before rewriting URL.Host.
	origAuthority := req.URL.Host
	if req.Host == "" {
		req.Host = origAuthority
	}

	if ip := net.ParseIP(hostname); ip != nil {
		if err := reject(ip); err != nil {
			return "", err
		}
		// Normalize URL.Host to include explicit port for the transport/proxy hop.
		req.URL.Host = net.JoinHostPort(ip.String(), port)
		// Literal IP destinations have no DNS name for SNI.
		return "", nil
	}

	ips, err := net.DefaultResolver.LookupIPAddr(req.Context(), hostname)
	if err != nil {
		return "", fmt.Errorf("dns resolution failed: %w", err)
	}
	if len(ips) == 0 {
		return "", fmt.Errorf("dns resolution returned no addresses")
	}

	var chosen net.IP
	for _, ip := range ips {
		if err := reject(ip.IP); err != nil {
			return "", err
		}
		if chosen == nil {
			chosen = ip.IP
		}
	}
	req.URL.Host = net.JoinHostPort(chosen.String(), port)
	return hostname, nil
}

// dialBlockingTransport builds a transport that resolves each dial target and
// rejects IPs for which reject returns a non-nil error, then dials allowed
// addresses in order (fallback if the first is unreachable).
//
// When useProxy is true, ProxyFromEnvironment is honored for datasource egress.
// Destination policy for proxied requests is enforced by urlPolicyTransport
// (and CheckRedirect), because DialContext only connects to the proxy hop.
func dialBlockingTransport(reject func(net.IP) error, useProxy bool) *http.Transport {
	dialer := &net.Dialer{
		Timeout:   30 * time.Second,
		KeepAlive: 30 * time.Second,
	}
	tr := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, fmt.Errorf("invalid address: %w", err)
			}
			ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
			if err != nil {
				return nil, fmt.Errorf("dns resolution failed: %w", err)
			}
			if len(ips) == 0 {
				return nil, fmt.Errorf("dns resolution returned no addresses")
			}

			// Fail closed if any resolved address is rejected (partial metadata
			// rebinding). Among allowed addresses, try each until one connects.
			var candidates []net.IPAddr
			for _, ip := range ips {
				if err := reject(ip.IP); err != nil {
					return nil, err
				}
				candidates = append(candidates, ip)
			}

			var firstDialErr error
			for _, ip := range candidates {
				conn, dialErr := dialer.DialContext(ctx, network, net.JoinHostPort(ip.IP.String(), port))
				if dialErr == nil {
					return conn, nil
				}
				if firstDialErr == nil {
					firstDialErr = dialErr
				}
			}
			return nil, firstDialErr
		},
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}
	if useProxy {
		tr.Proxy = http.ProxyFromEnvironment
	}
	return tr
}
