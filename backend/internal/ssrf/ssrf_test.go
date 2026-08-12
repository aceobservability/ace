package ssrf

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"
)

func TestIsValidRedirectURL_rejectsPrivateAndMetadata(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		raw  string
		want bool
	}{
		{name: "empty", raw: "", want: false},
		{name: "not a url", raw: "://", want: false},
		{name: "ftp scheme", raw: "ftp://example.com", want: false},
		{name: "userinfo", raw: "http://user:pass@example.com", want: false},
		{name: "loopback ip", raw: "http://127.0.0.1:3000", want: false},
		{name: "private 10", raw: "http://10.0.0.5/metrics", want: false},
		{name: "private 192", raw: "http://192.168.1.1", want: false},
		{name: "link local metadata", raw: "http://169.254.169.254/latest/meta-data", want: false},
		{name: "public host", raw: "https://example.com", want: true},
		{name: "public host with path", raw: "https://example.com:3000/api", want: true},
		{name: "public ip", raw: "https://8.8.8.8:443/health", want: true},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := IsValidRedirectURL(tc.raw); got != tc.want {
				t.Fatalf("IsValidRedirectURL(%q) = %v, want %v", tc.raw, got, tc.want)
			}
		})
	}
}

func TestIsLocalURL_allowsPrivateBlocksMetadata(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		raw  string
		want bool
	}{
		{name: "empty", raw: "", want: false},
		{name: "ftp scheme", raw: "ftp://10.0.0.1", want: false},
		{name: "userinfo", raw: "http://user@10.0.0.1", want: false},
		{name: "loopback", raw: "http://127.0.0.1:9090", want: true},
		{name: "private 10", raw: "http://10.0.0.5:8428", want: true},
		{name: "private 192", raw: "http://192.168.1.20:3100", want: true},
		{name: "metadata ip", raw: "http://169.254.169.254/", want: false},
		{name: "public host", raw: "https://prometheus.example.com", want: true},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := IsLocalURL(tc.raw); got != tc.want {
				t.Fatalf("IsLocalURL(%q) = %v, want %v", tc.raw, got, tc.want)
			}
		})
	}
}

func TestValidateURL_and_ValidateDatasourceURL_errors(t *testing.T) {
	t.Parallel()

	if _, err := ValidateURL("http://127.0.0.1"); err == nil {
		t.Fatal("ValidateURL should reject loopback")
	}
	if _, err := ValidateDatasourceURL("http://127.0.0.1:9090"); err != nil {
		t.Fatalf("ValidateDatasourceURL should allow loopback: %v", err)
	}
	if _, err := ValidateDatasourceURL("http://169.254.169.254/"); err == nil {
		t.Fatal("ValidateDatasourceURL should reject cloud metadata")
	}
}

func TestSafeClient_blocksPrivateDial(t *testing.T) {
	t.Parallel()

	// Bind a local server; SafeClient must refuse to dial it.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)

	client := SafeClient(2 * time.Second)
	resp, err := client.Get(srv.URL)
	if err == nil {
		resp.Body.Close()
		t.Fatalf("SafeClient should refuse private target %s", srv.URL)
	}
}

func TestDatasourceClient_allowsPrivateBlocksMetadata(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)

	client := DatasourceClient(2 * time.Second)
	resp, err := client.Get(srv.URL)
	if err != nil {
		t.Fatalf("DatasourceClient should allow private target %s: %v", srv.URL, err)
	}
	resp.Body.Close()

	// Literal metadata IP must fail at dial time.
	resp, err = client.Get("http://169.254.169.254/")
	if err == nil {
		resp.Body.Close()
		t.Fatal("DatasourceClient should refuse cloud metadata dial")
	}
}

func TestDatasourceDialContext_allowsPrivateBlocksMetadata(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)

	u, err := url.Parse(srv.URL)
	if err != nil {
		t.Fatalf("parse test server url: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	conn, err := DatasourceDialContext(ctx, "tcp", u.Host)
	if err != nil {
		t.Fatalf("DatasourceDialContext should allow private target %s: %v", u.Host, err)
	}
	_ = conn.Close()

	conn, err = DatasourceDialContext(ctx, "tcp", "169.254.169.254:80")
	if err == nil {
		_ = conn.Close()
		t.Fatal("DatasourceDialContext should refuse cloud metadata dial")
	}
}

func TestDatasourceClient_blocksMetadataRedirect(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "http://169.254.169.254/latest/meta-data", http.StatusFound)
	}))
	t.Cleanup(srv.Close)

	client := DatasourceClient(2 * time.Second)
	resp, err := client.Get(srv.URL)
	if err == nil {
		resp.Body.Close()
		t.Fatal("DatasourceClient should refuse redirect to cloud metadata")
	}
}

func TestDatasourceClient_rejectsMetadataDestinationURL(t *testing.T) {
	t.Parallel()

	// Even if a proxy would dial a different hop, RoundTrip must reject the
	// destination URL before the base transport runs.
	baseCalls := 0
	client := &http.Client{
		Timeout: 2 * time.Second,
		Transport: &urlPolicyTransport{
			base: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				baseCalls++
				return &http.Response{StatusCode: http.StatusOK, Body: http.NoBody, Request: req}, nil
			}),
			validate: func(raw string) error {
				_, err := ValidateDatasourceURL(raw)
				return err
			},
		},
	}

	resp, err := client.Get("http://169.254.169.254/latest/meta-data")
	if err == nil {
		resp.Body.Close()
		t.Fatal("expected metadata destination URL to be rejected")
	}
	if baseCalls != 0 {
		t.Fatalf("base transport should not run for rejected destination, calls=%d", baseCalls)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}
