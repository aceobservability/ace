package ssrf

import (
	"context"
	"net"
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
			reject: rejectCloudMetadata,
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

func TestURLPolicyTransport_pinsHostnameOnlyWhenProxied(t *testing.T) {
	t.Parallel()

	proxyURL, err := url.Parse("http://127.0.0.1:18080")
	if err != nil {
		t.Fatalf("parse proxy: %v", err)
	}

	var saw *http.Request
	withProxy := &http.Client{
		Timeout: 2 * time.Second,
		Transport: &urlPolicyTransport{
			base: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				saw = req.Clone(req.Context())
				return &http.Response{StatusCode: http.StatusOK, Body: http.NoBody, Request: req}, nil
			}),
			reject: rejectCloudMetadata,
			proxy:  func(*http.Request) (*url.URL, error) { return proxyURL, nil },
			validate: func(raw string) error {
				_, err := ValidateDatasourceURL(raw)
				return err
			},
		},
	}

	// Proxied hostname: URL.Host rewritten to validated IP; Host keeps DNS authority.
	resp, err := withProxy.Get("http://example.com/metrics")
	if err != nil {
		t.Fatalf("expected proxied hostname pin to succeed: %v", err)
	}
	resp.Body.Close()
	if saw == nil {
		t.Fatal("base transport was not called")
	}
	if ip := net.ParseIP(saw.URL.Hostname()); ip == nil {
		t.Fatalf("proxied URL host should be pinned IP, got %q", saw.URL.Host)
	}
	if saw.URL.Port() != "80" {
		t.Fatalf("pinned URL port = %q, want 80", saw.URL.Port())
	}
	if saw.Host != "example.com" {
		t.Fatalf("Host header should keep original authority, got %q", saw.Host)
	}

	// Proxied literal IP: still normalized with explicit port; Host preserved.
	saw = nil
	resp, err = withProxy.Get("http://127.0.0.1:9/health")
	if err != nil {
		t.Fatalf("expected private literal to pass policy: %v", err)
	}
	resp.Body.Close()
	if saw == nil {
		t.Fatal("base transport was not called")
	}
	if saw.URL.Hostname() != "127.0.0.1" || saw.URL.Port() != "9" {
		t.Fatalf("URL not pinned to validated IP: host=%q", saw.URL.Host)
	}
	if saw.Host != "127.0.0.1:9" {
		t.Fatalf("Host header should keep original authority, got %q", saw.Host)
	}

	// Metadata literal must fail before base transport (even with proxy).
	saw = nil
	resp, err = withProxy.Get("http://169.254.169.254/")
	if err == nil {
		resp.Body.Close()
		t.Fatal("expected metadata pin to fail")
	}
	if saw != nil {
		t.Fatal("base transport must not run after metadata reject")
	}

	// Direct (no proxy): leave hostname unpinned so multi-IP dial fallback works.
	saw = nil
	direct := &http.Client{
		Timeout: 2 * time.Second,
		Transport: &urlPolicyTransport{
			base: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				saw = req.Clone(req.Context())
				return &http.Response{StatusCode: http.StatusOK, Body: http.NoBody, Request: req}, nil
			}),
			reject: rejectCloudMetadata,
			// proxy nil / returns nil => no pin
			proxy: func(*http.Request) (*url.URL, error) { return nil, nil },
			validate: func(raw string) error {
				_, err := ValidateDatasourceURL(raw)
				return err
			},
		},
	}
	resp, err = direct.Get("http://example.com/metrics")
	if err != nil {
		t.Fatalf("expected direct hostname request to succeed: %v", err)
	}
	resp.Body.Close()
	if saw == nil {
		t.Fatal("base transport was not called")
	}
	if saw.URL.Hostname() != "example.com" {
		t.Fatalf("direct dial must not pin hostname, got %q", saw.URL.Host)
	}
}

func TestURLPolicyTransport_reusesTLSTransportPerServerName(t *testing.T) {
	t.Parallel()

	base := &http.Transport{}
	upt := &urlPolicyTransport{base: base}
	tr1 := upt.transportForServerName(base, "metrics.example.com")
	tr2 := upt.transportForServerName(base, "metrics.example.com")
	tr3 := upt.transportForServerName(base, "logs.example.com")
	if tr1 != tr2 {
		t.Fatal("expected cached transport reuse for same ServerName")
	}
	if tr1 == tr3 {
		t.Fatal("expected distinct transports for different ServerNames")
	}
	if tr1.TLSClientConfig == nil || tr1.TLSClientConfig.ServerName != "metrics.example.com" {
		t.Fatalf("ServerName = %v", tr1.TLSClientConfig)
	}
	if tr3.TLSClientConfig == nil || tr3.TLSClientConfig.ServerName != "logs.example.com" {
		t.Fatalf("ServerName = %v", tr3.TLSClientConfig)
	}
}

func TestPinRequestURLToValidatedIP_returnsDNSNameForTLS(t *testing.T) {
	t.Parallel()

	req, err := http.NewRequest(http.MethodGet, "https://example.com/metrics", nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	name, err := pinRequestURLToValidatedIP(req, rejectCloudMetadata)
	if err != nil {
		t.Fatalf("pin: %v", err)
	}
	if name != "example.com" {
		t.Fatalf("tls server name = %q, want example.com", name)
	}
	if ip := net.ParseIP(req.URL.Hostname()); ip == nil {
		t.Fatalf("URL host should be pinned IP, got %q", req.URL.Host)
	}
	if req.Host != "example.com" {
		t.Fatalf("Host header = %q, want example.com", req.Host)
	}

	// Literal HTTPS IP: no DNS name to restore for SNI.
	req, err = http.NewRequest(http.MethodGet, "https://8.8.8.8/", nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	name, err = pinRequestURLToValidatedIP(req, rejectCloudMetadata)
	if err != nil {
		t.Fatalf("pin literal: %v", err)
	}
	if name != "" {
		t.Fatalf("literal IP should not return tls server name, got %q", name)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}
