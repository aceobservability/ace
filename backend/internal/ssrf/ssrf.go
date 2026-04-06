// Package ssrf provides URL validation and a safe HTTP client that blocks
// server-side request forgery by rejecting private/internal IP addresses.
package ssrf

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"time"
)

// blockedCIDRs are private and internal IP ranges that must not be accessed.
var blockedCIDRs []*net.IPNet

func init() {
	for _, cidr := range []string{
		"127.0.0.0/8",    // IPv4 loopback
		"10.0.0.0/8",     // RFC 1918
		"172.16.0.0/12",  // RFC 1918
		"192.168.0.0/16", // RFC 1918
		"169.254.0.0/16", // Link-local
		"::1/128",        // IPv6 loopback
		"fc00::/7",       // IPv6 unique local
		"fe80::/10",      // IPv6 link-local
	} {
		_, ipNet, _ := net.ParseCIDR(cidr)
		blockedCIDRs = append(blockedCIDRs, ipNet)
	}
}

// isBlockedIP returns true if the IP falls within a blocked range.
func isBlockedIP(ip net.IP) bool {
	for _, cidr := range blockedCIDRs {
		if cidr.Contains(ip) {
			return true
		}
	}
	return false
}

// ValidateURL checks that a URL uses http(s) and that neither the literal IP
// nor any resolved IPs fall within blocked ranges.
func ValidateURL(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("invalid url: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, fmt.Errorf("url must use http or https scheme")
	}
	hostname := u.Hostname()
	if hostname == "" {
		return nil, fmt.Errorf("url must include a hostname")
	}

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

// SafeClient returns an *http.Client that blocks connections to private/internal
// IPs at dial time (preventing DNS rebinding after initial validation).
func SafeClient(timeout time.Duration) *http.Client {
	dialer := &net.Dialer{Timeout: 5 * time.Second}
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, fmt.Errorf("invalid address: %w", err)
			}
			ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
			if err != nil {
				return nil, fmt.Errorf("dns resolution failed: %w", err)
			}
			for _, ip := range ips {
				if isBlockedIP(ip.IP) {
					return nil, fmt.Errorf("connections to private/internal addresses are not allowed")
				}
			}
			// Connect to the first allowed IP.
			return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
		},
	}
	return &http.Client{
		Timeout:   timeout,
		Transport: transport,
	}
}
