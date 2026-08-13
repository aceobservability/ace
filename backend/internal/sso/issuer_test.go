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

func TestValidateMicrosoftTenant_acceptsPathSegments(t *testing.T) {
	valid := []string{
		"common",
		"organizations",
		"consumers",
		"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
		"  common  ",
		"tenant-guid-not-a-host",
	}
	for _, in := range valid {
		got, err := ValidateMicrosoftTenant(in)
		if err != nil {
			t.Errorf("ValidateMicrosoftTenant(%q): %v", in, err)
			continue
		}
		want := strings.TrimSpace(in)
		if got != want {
			t.Errorf("ValidateMicrosoftTenant(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestValidateMicrosoftTenant_rejectsUnsafe(t *testing.T) {
	invalid := []string{"", "   ", "foo/bar", "https://evil.com", "a b", "foo@bar", "foo?x=1", "foo#frag", `foo\bar`}
	for _, in := range invalid {
		if _, err := ValidateMicrosoftTenant(in); err == nil {
			t.Errorf("ValidateMicrosoftTenant(%q) succeeded, want reject", in)
		}
	}
}

func TestOAuth2Config_microsoftTenantPathIntegrity(t *testing.T) {
	valid := []string{"common", "organizations", "consumers", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "  common  "}
	for _, tenant := range valid {
		cfg := &providerConfig{clientID: "c", clientSecret: "s", tenantID: tenant}
		oc, err := oauth2Config(ProviderMicrosoft, cfg, "http://localhost/cb")
		if err != nil {
			t.Fatalf("tenant %q: %v", tenant, err)
		}
		trimmed := strings.TrimSpace(tenant)
		wantAuth := "https://login.microsoftonline.com/" + trimmed + "/oauth2/v2.0/authorize"
		wantToken := "https://login.microsoftonline.com/" + trimmed + "/oauth2/v2.0/token"
		if oc.Endpoint.AuthURL != wantAuth {
			t.Errorf("AuthURL=%s want %s", oc.Endpoint.AuthURL, wantAuth)
		}
		if oc.Endpoint.TokenURL != wantToken {
			t.Errorf("TokenURL=%s want %s", oc.Endpoint.TokenURL, wantToken)
		}
		if strings.HasPrefix(oc.Endpoint.AuthURL, "https://"+trimmed) && !strings.Contains(oc.Endpoint.AuthURL, "login.microsoftonline.com") {
			t.Fatalf("tenant %q must not become the IdP host", tenant)
		}
	}

	invalid := []string{"foo/bar", "https://evil.com", "a b"}
	for _, tenant := range invalid {
		cfg := &providerConfig{clientID: "c", clientSecret: "s", tenantID: tenant}
		if _, err := oauth2Config(ProviderMicrosoft, cfg, "http://localhost/cb"); err == nil {
			t.Errorf("oauth2Config microsoft tenant %q should be rejected", tenant)
		}
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
