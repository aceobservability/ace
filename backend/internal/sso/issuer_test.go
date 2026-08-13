package sso

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/aceobservability/ace/backend/internal/ssrf"
)

func TestValidateIssuer_rejectsPrivateAndMetadata(t *testing.T) {
	hosts := []string{
		"10.0.0.1",
		"192.168.1.1",
		"127.0.0.1",
		"169.254.169.254",
		"https://dev-123.okta.com",
		"dev 123.okta.com",
		"",
	}
	for _, host := range hosts {
		t.Run(host, func(t *testing.T) {
			if err := ValidateIssuer(host); err == nil {
				t.Fatalf("ValidateIssuer(%q) succeeded, want reject", host)
			}
		})
	}
}

func TestValidateIssuer_acceptsPublicLiteral(t *testing.T) {
	// 8.8.8.8 is a public literal — ValidateURL does not DNS-lookup literals.
	if err := ValidateIssuer("8.8.8.8"); err != nil {
		t.Fatalf("public literal should pass URL policy: %v", err)
	}
}

func TestTestIssuer_usesInjectedClient(t *testing.T) {
	saw := false
	client := &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		saw = true
		if !strings.Contains(req.URL.String(), "/.well-known/openid-configuration") {
			t.Errorf("expected OIDC discovery URL, got %s", req.URL)
		}
		return nil, errors.New("injected-client")
	})}

	err := New(client).TestIssuer(context.Background(), "8.8.8.8")
	if !saw {
		t.Fatal("TestIssuer did not use the injected client (would have used http.DefaultClient)")
	}
	if err == nil || !strings.Contains(err.Error(), "injected-client") {
		t.Fatalf("expected injected-client error, got %v", err)
	}
}

func TestTestIssuer_safeClientRejectsPrivate(t *testing.T) {
	m := New(ssrf.SafeClient(2 * time.Second))
	err := m.TestIssuer(context.Background(), "10.0.0.1")
	if err == nil {
		t.Fatal("SafeClient TestIssuer must reject RFC1918 IdP hosts")
	}
}

func TestTestIssuer_safeClientRejectsMetadata(t *testing.T) {
	m := New(ssrf.SafeClient(2 * time.Second))
	err := m.TestIssuer(context.Background(), "169.254.169.254")
	if err == nil {
		t.Fatal("SafeClient TestIssuer must reject cloud metadata")
	}
}

func TestNew_panicsOnNilClient(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatal("New(nil) must panic rather than fall back to http.DefaultClient")
		}
	}()
	_ = New(nil)
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}
