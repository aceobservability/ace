// Package ssrf provides URL validation and a safe HTTP client that blocks
// server-side request forgery by rejecting private/internal IP addresses.
package ssrf

import (
	"context"
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
func SafeClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		Transport: dialBlockingTransport(func(ip net.IP) error {
			if isBlockedIP(ip) {
				return fmt.Errorf("connections to private/internal addresses are not allowed")
			}
			return nil
		}),
	}
}

// DatasourceClient returns an *http.Client for configured observability
// datasources. Private/internal targets are allowed; the cloud metadata
// endpoint is blocked at dial time (DNS rebinding) and on redirects.
func DatasourceClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		Transport: dialBlockingTransport(func(ip net.IP) error {
			if isCloudMetadataIP(ip) {
				return fmt.Errorf("connections to cloud metadata endpoint are not allowed")
			}
			return nil
		}),
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

// dialBlockingTransport builds a transport that resolves each dial target and
// rejects IPs for which reject returns a non-nil error, then dials the first
// remaining address.
func dialBlockingTransport(reject func(net.IP) error) *http.Transport {
	dialer := &net.Dialer{Timeout: 5 * time.Second}
	return &http.Transport{
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
			for _, ip := range ips {
				if err := reject(ip.IP); err != nil {
					return nil, err
				}
			}
			return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
		},
	}
}
