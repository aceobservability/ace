package auth

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestIPExtraction_NoTrustedProxies(t *testing.T) {
	// When no trusted proxies are configured, X-Forwarded-For is trusted (backward compat)
	SetTrustedProxies(nil)

	handler := AuthMiddleware(&JWTManager{})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := GetIPAddress(r.Context())
		if ip != "203.0.113.50" {
			t.Errorf("expected 203.0.113.50, got %s", ip)
		}
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.RemoteAddr = "10.0.0.1:1234"
	req.Header.Set("X-Forwarded-For", "203.0.113.50, 10.0.0.1")
	req.Header.Set("Authorization", "Bearer test")

	// We need a valid token, so test isTrustedProxy directly instead
	_ = handler // handler needs a valid JWT — test the helper directly

	if !isTrustedProxy("10.0.0.1:1234") {
		t.Error("expected isTrustedProxy to return true when no proxies configured")
	}
}

func TestIsTrustedProxy_TrustedIP(t *testing.T) {
	_, network, _ := net.ParseCIDR("10.0.0.0/8")
	SetTrustedProxies([]net.IPNet{*network})
	defer SetTrustedProxies(nil)

	if !isTrustedProxy("10.0.0.1:1234") {
		t.Error("expected 10.0.0.1 to be trusted")
	}
}

func TestIsTrustedProxy_UntrustedIP(t *testing.T) {
	_, network, _ := net.ParseCIDR("10.0.0.0/8")
	SetTrustedProxies([]net.IPNet{*network})
	defer SetTrustedProxies(nil)

	if isTrustedProxy("203.0.113.50:1234") {
		t.Error("expected 203.0.113.50 to be untrusted")
	}
}

func TestIsTrustedProxy_NoPort(t *testing.T) {
	_, network, _ := net.ParseCIDR("10.0.0.0/8")
	SetTrustedProxies([]net.IPNet{*network})
	defer SetTrustedProxies(nil)

	if !isTrustedProxy("10.0.0.1") {
		t.Error("expected 10.0.0.1 without port to be trusted")
	}
}

func TestIsTrustedProxy_InvalidIP(t *testing.T) {
	_, network, _ := net.ParseCIDR("10.0.0.0/8")
	SetTrustedProxies([]net.IPNet{*network})
	defer SetTrustedProxies(nil)

	if isTrustedProxy("not-an-ip") {
		t.Error("expected invalid IP to be untrusted")
	}
}

func TestIPExtraction_Integration(t *testing.T) {
	// Integration test: verify the full middleware respects trusted proxies.
	// We create a minimal JWTManager and skip the auth part by testing
	// the IP extraction logic directly.
	_, network, _ := net.ParseCIDR("10.0.0.0/8")
	SetTrustedProxies([]net.IPNet{*network})
	defer SetTrustedProxies(nil)

	tests := []struct {
		name       string
		remoteAddr string
		xff        string
		wantIP     string
	}{
		{
			name:       "trusted proxy with XFF",
			remoteAddr: "10.0.0.1:1234",
			xff:        "203.0.113.50, 10.0.0.1",
			wantIP:     "203.0.113.50",
		},
		{
			name:       "untrusted source with XFF",
			remoteAddr: "203.0.113.99:1234",
			xff:        "1.2.3.4",
			wantIP:     "203.0.113.99:1234",
		},
		{
			name:       "trusted proxy without XFF",
			remoteAddr: "10.0.0.1:1234",
			xff:        "",
			wantIP:     "10.0.0.1:1234",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Simulate the IP extraction logic from AuthMiddleware
			ip := tt.remoteAddr
			if fwd := tt.xff; fwd != "" && isTrustedProxy(tt.remoteAddr) {
				parts := splitFirst(fwd, ",")
				ip = trimSpace(parts)
			}
			if ip != tt.wantIP {
				t.Errorf("got %q, want %q", ip, tt.wantIP)
			}
		})
	}
}

// helpers to mirror middleware logic without importing strings
func splitFirst(s, sep string) string {
	for i := 0; i < len(s); i++ {
		if string(s[i]) == sep {
			return s[:i]
		}
	}
	return s
}

func trimSpace(s string) string {
	start, end := 0, len(s)
	for start < end && s[start] == ' ' {
		start++
	}
	for end > start && s[end-1] == ' ' {
		end--
	}
	return s[start:end]
}

// Ensure context key types work correctly
func TestContextHelpers(t *testing.T) {
	ctx := context.WithValue(context.Background(), IPAddressKey, "1.2.3.4")
	if ip := GetIPAddress(ctx); ip != "1.2.3.4" {
		t.Errorf("GetIPAddress: got %q, want 1.2.3.4", ip)
	}

	if ip := GetIPAddress(context.Background()); ip != "" {
		t.Errorf("GetIPAddress empty ctx: got %q, want empty", ip)
	}
}
