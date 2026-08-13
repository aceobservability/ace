package datasource

import (
	"net/http"
	"strings"
	"testing"

	"github.com/aceobservability/ace/backend/internal/models"
)

func TestApplyDataSourceAuth_Basic(t *testing.T) {
	ds := models.DataSource{
		AuthType:   "basic",
		AuthConfig: []byte(`{"username":"alice","password":"secret"}`),
	}

	req, err := http.NewRequest(http.MethodGet, "http://localhost", nil)
	if err != nil {
		t.Fatalf("failed to create request: %v", err)
	}

	if err := applyDataSourceAuth(req, ds); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	username, password, ok := req.BasicAuth()
	if !ok {
		t.Fatal("expected basic auth to be set")
	}
	if username != "alice" || password != "secret" {
		t.Fatalf("unexpected basic auth credentials: %s/%s", username, password)
	}
}

func TestApplyDataSourceAuth_Bearer(t *testing.T) {
	ds := models.DataSource{
		AuthType:   "bearer",
		AuthConfig: []byte(`{"token":"abc123"}`),
	}

	req, err := http.NewRequest(http.MethodGet, "http://localhost", nil)
	if err != nil {
		t.Fatalf("failed to create request: %v", err)
	}

	if err := applyDataSourceAuth(req, ds); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if req.Header.Get("Authorization") != "Bearer abc123" {
		t.Fatalf("unexpected authorization header: %s", req.Header.Get("Authorization"))
	}
}

func TestApplyDataSourceAuth_APIKey(t *testing.T) {
	ds := models.DataSource{
		AuthType:   "api_key",
		AuthConfig: []byte(`{"header":"X-Auth-Token","value":"token-1"}`),
	}

	req, err := http.NewRequest(http.MethodGet, "http://localhost", nil)
	if err != nil {
		t.Fatalf("failed to create request: %v", err)
	}

	if err := applyDataSourceAuth(req, ds); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if req.Header.Get("X-Auth-Token") != "token-1" {
		t.Fatalf("unexpected api key header value: %s", req.Header.Get("X-Auth-Token"))
	}
}

func TestApplyDataSourceAuth_None(t *testing.T) {
	ds := models.DataSource{AuthType: "none"}

	req, err := http.NewRequest(http.MethodGet, "http://localhost", nil)
	if err != nil {
		t.Fatalf("failed to create request: %v", err)
	}

	if err := applyDataSourceAuth(req, ds); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestApplyDataSourceAuth_InvalidType(t *testing.T) {
	ds := models.DataSource{AuthType: "digest"}

	req, err := http.NewRequest(http.MethodGet, "http://localhost", nil)
	if err != nil {
		t.Fatalf("failed to create request: %v", err)
	}

	if err := applyDataSourceAuth(req, ds); err == nil {
		t.Fatal("expected error for invalid auth type")
	}
}

func TestDataSourceAuthHeader_Bearer(t *testing.T) {
	ds := models.DataSource{
		AuthType:   "bearer",
		AuthConfig: []byte(`{"token":"ws-token"}`),
	}

	header, err := dataSourceAuthHeader(ds)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if header.Get("Authorization") != "Bearer ws-token" {
		t.Fatalf("unexpected authorization header: %s", header.Get("Authorization"))
	}
}

func TestDataSourceAuthRoundTripper_StampsBearer(t *testing.T) {
	ds := models.DataSource{
		URL:        "http://example.invalid/query",
		AuthType:   "bearer",
		AuthConfig: []byte(`{"token":"rt-token"}`),
	}

	sawAuth := false
	inner := roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		if req.Header.Get("Authorization") != "Bearer rt-token" {
			t.Fatalf("unexpected authorization header: %s", req.Header.Get("Authorization"))
		}
		sawAuth = true
		return &http.Response{StatusCode: http.StatusOK, Body: http.NoBody, Request: req}, nil
	})

	client := wrapDatasourceAuth(&http.Client{Transport: inner}, ds)
	resp, err := client.Get("http://example.invalid/query")
	if err != nil {
		t.Fatalf("round trip failed: %v", err)
	}
	_ = resp.Body.Close()
	if !sawAuth {
		t.Fatal("expected inner transport to observe the request")
	}
}

func TestDataSourceAuthRoundTripper_DoesNotStampCrossOriginRedirect(t *testing.T) {
	ds := models.DataSource{
		URL:        "http://origin.invalid/query",
		AuthType:   "bearer",
		AuthConfig: []byte(`{"token":"secret-token"}`),
	}

	var hops []string
	inner := roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		hops = append(hops, req.URL.Host+":"+req.Header.Get("Authorization"))
		switch req.URL.Host {
		case "origin.invalid":
			return &http.Response{
				StatusCode: http.StatusFound,
				Header:     http.Header{"Location": []string{"http://other.invalid/next"}},
				Body:       http.NoBody,
				Request:    req,
			}, nil
		case "other.invalid":
			return &http.Response{StatusCode: http.StatusOK, Body: http.NoBody, Request: req}, nil
		default:
			t.Fatalf("unexpected host: %s", req.URL.Host)
			return nil, nil
		}
	})

	client := wrapDatasourceAuth(&http.Client{Transport: inner}, ds)
	resp, err := client.Get("http://origin.invalid/query")
	if err != nil {
		t.Fatalf("round trip failed: %v", err)
	}
	_ = resp.Body.Close()

	if len(hops) != 2 {
		t.Fatalf("expected 2 hops, got %v", hops)
	}
	if hops[0] != "origin.invalid:Bearer secret-token" {
		t.Fatalf("origin hop auth = %q", hops[0])
	}
	if hops[1] != "other.invalid:" {
		t.Fatalf("redirect hop must not regain credentials, got %q", hops[1])
	}
}

func TestDataSourceAuthRoundTripper_StripsAPIKeyOnCrossOriginRedirect(t *testing.T) {
	ds := models.DataSource{
		URL:        "http://origin.invalid/query",
		AuthType:   "api_key",
		AuthConfig: []byte(`{"header":"X-Auth-Token","value":"token-1"}`),
	}

	var hops []string
	inner := roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		hops = append(hops, req.URL.Host+":"+req.Header.Get("X-Auth-Token"))
		switch req.URL.Host {
		case "origin.invalid":
			return &http.Response{
				StatusCode: http.StatusFound,
				Header:     http.Header{"Location": []string{"http://other.invalid/next"}},
				Body:       http.NoBody,
				Request:    req,
			}, nil
		case "other.invalid":
			return &http.Response{StatusCode: http.StatusOK, Body: http.NoBody, Request: req}, nil
		default:
			t.Fatalf("unexpected host: %s", req.URL.Host)
			return nil, nil
		}
	})

	client := wrapDatasourceAuth(&http.Client{Transport: inner}, ds)
	resp, err := client.Get("http://origin.invalid/query")
	if err != nil {
		t.Fatalf("round trip failed: %v", err)
	}
	_ = resp.Body.Close()

	if len(hops) != 2 {
		t.Fatalf("expected 2 hops, got %v", hops)
	}
	if hops[0] != "origin.invalid:token-1" {
		t.Fatalf("origin hop api key = %q", hops[0])
	}
	if hops[1] != "other.invalid:" {
		t.Fatalf("redirect hop must not regain api key, got %q", hops[1])
	}
}

func TestDataSourceAuthRoundTripper_SameOriginRedirectKeepsAuth(t *testing.T) {
	ds := models.DataSource{
		URL:        "http://origin.invalid/query",
		AuthType:   "bearer",
		AuthConfig: []byte(`{"token":"secret-token"}`),
	}

	var hops []string
	inner := roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		hops = append(hops, req.URL.Path+":"+req.Header.Get("Authorization"))
		switch req.URL.Path {
		case "/query":
			return &http.Response{
				StatusCode: http.StatusFound,
				Header:     http.Header{"Location": []string{"http://origin.invalid/next"}},
				Body:       http.NoBody,
				Request:    req,
			}, nil
		case "/next":
			return &http.Response{StatusCode: http.StatusOK, Body: http.NoBody, Request: req}, nil
		default:
			t.Fatalf("unexpected path: %s", req.URL.Path)
			return nil, nil
		}
	})

	client := wrapDatasourceAuth(&http.Client{Transport: inner}, ds)
	resp, err := client.Get("http://origin.invalid/query")
	if err != nil {
		t.Fatalf("round trip failed: %v", err)
	}
	_ = resp.Body.Close()

	if len(hops) != 2 {
		t.Fatalf("expected 2 hops, got %v", hops)
	}
	if hops[0] != "/query:Bearer secret-token" || hops[1] != "/next:Bearer secret-token" {
		t.Fatalf("same-origin hops should keep auth, got %v", hops)
	}
}

func TestSameDatasourceOrigin_UsesHostHeaderWhenURLPinned(t *testing.T) {
	dsURL := "https://metrics.example.com"
	req, err := http.NewRequest(http.MethodGet, "https://203.0.113.10/api/v1/query", nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	// SSRF pin rewrites URL.Host to an IP while keeping Host as the original authority.
	req.Host = "metrics.example.com"
	if !sameDatasourceOrigin(req, dsURL) {
		t.Fatal("expected pinned request with original Host header to match datasource origin")
	}
	req.Host = "other.example.com"
	if sameDatasourceOrigin(req, dsURL) {
		t.Fatal("expected mismatched Host header to fail origin check")
	}
}

func TestWrapDatasourceAuth_NilTransportPanics(t *testing.T) {
	defer func() {
		recovered := recover()
		if recovered == nil {
			t.Fatal("expected panic when Transport is nil")
		}
		msg, ok := recovered.(string)
		if !ok {
			t.Fatalf("panic value type %T, want string", recovered)
		}
		if !strings.Contains(msg, "non-nil Transport") {
			t.Fatalf("panic message %q, want non-nil Transport", msg)
		}
	}()
	_ = wrapDatasourceAuth(&http.Client{}, models.DataSource{})
}

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (f roundTripperFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}
