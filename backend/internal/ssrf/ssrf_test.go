package ssrf

import (
	"context"
	"fmt"
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

func TestSafeClient_doesNotPinDestination(t *testing.T) {
	t.Parallel()

	client := SafeClient(time.Second)
	ut, ok := client.Transport.(*urlPolicyTransport)
	if !ok {
		t.Fatalf("SafeClient transport type %T, want *urlPolicyTransport", client.Transport)
	}
	if ut.pinDestination {
		t.Fatal("SafeClient must not pin destinations; direct dials need multi-IP fallback")
	}
}

func TestDatasourceClient_enablesConditionalPin(t *testing.T) {
	t.Parallel()

	client := DatasourceClient(time.Second)
	ut, ok := client.Transport.(*urlPolicyTransport)
	if !ok {
		t.Fatalf("DatasourceClient transport type %T, want *urlPolicyTransport", client.Transport)
	}
	if !ut.pinDestination {
		t.Fatal("DatasourceClient should enable pinning when an HTTP(S)_PROXY hop is used")
	}
}

func TestURLPolicyTransport_pinsHostnameToValidatedIP(t *testing.T) {
	t.Parallel()

	allowAll := func(string) error { return nil }

	t.Run("proxy hop pins hostname and preserves Host", func(t *testing.T) {
		t.Parallel()
		var lastProxyReq *http.Request
		dialed := 0
		rt := &urlPolicyTransport{
			base: proxyTransport(func(req *http.Request) (*url.URL, error) {
				lastProxyReq = req
				return &url.URL{Scheme: "http", Host: "127.0.0.1:1"}, nil
			}, func(context.Context, string, string) (net.Conn, error) {
				dialed++
				return nil, fmt.Errorf("test: skip proxy dial")
			}),
			reject:         rejectCloudMetadata,
			pinDestination: true,
			validate:       allowAll,
		}

		req, err := http.NewRequest(http.MethodGet, "http://localhost:9090/health", nil)
		if err != nil {
			t.Fatalf("NewRequest: %v", err)
		}
		resp, err := rt.RoundTrip(req)
		if resp != nil {
			resp.Body.Close()
		}
		if err == nil {
			t.Fatal("expected skip-dial error after pin")
		}
		if lastProxyReq == nil {
			t.Fatal("proxy was not consulted with the pinned request")
		}
		assertPinnedIPPort(t, lastProxyReq.URL.Host, "9090")
		if lastProxyReq.Host != "localhost:9090" {
			t.Fatalf("req.Host should keep original authority, got %q", lastProxyReq.Host)
		}
		if dialed == 0 {
			t.Fatal("expected base transport to dial the proxy after a successful pin")
		}
	})

	t.Run("proxy hop pins literal IP", func(t *testing.T) {
		t.Parallel()
		var lastProxyReq *http.Request
		rt := &urlPolicyTransport{
			base: proxyTransport(func(req *http.Request) (*url.URL, error) {
				lastProxyReq = req
				return &url.URL{Scheme: "http", Host: "127.0.0.1:1"}, nil
			}, func(context.Context, string, string) (net.Conn, error) {
				return nil, fmt.Errorf("test: skip proxy dial")
			}),
			reject:         rejectCloudMetadata,
			pinDestination: true,
			validate:       allowAll,
		}

		req, err := http.NewRequest(http.MethodGet, "http://127.0.0.1:9/health", nil)
		if err != nil {
			t.Fatalf("NewRequest: %v", err)
		}
		resp, err := rt.RoundTrip(req)
		if resp != nil {
			resp.Body.Close()
		}
		if err == nil {
			t.Fatal("expected skip-dial error after pin")
		}
		if lastProxyReq == nil {
			t.Fatal("proxy was not consulted")
		}
		if lastProxyReq.URL.Host != net.JoinHostPort("127.0.0.1", "9") {
			t.Fatalf("URL.Host = %q, want pinned IP:port", lastProxyReq.URL.Host)
		}
		if lastProxyReq.Host != "127.0.0.1:9" {
			t.Fatalf("req.Host should keep original authority, got %q", lastProxyReq.Host)
		}
	})

	t.Run("rejected resolution fails closed before base dial", func(t *testing.T) {
		t.Parallel()
		dialed := 0
		rt := &urlPolicyTransport{
			base: proxyTransport(func(*http.Request) (*url.URL, error) {
				return &url.URL{Scheme: "http", Host: "127.0.0.1:1"}, nil
			}, func(context.Context, string, string) (net.Conn, error) {
				dialed++
				return nil, fmt.Errorf("test: base must not dial")
			}),
			reject:         rejectCloudMetadata,
			pinDestination: true,
			validate:       allowAll,
		}

		req, err := http.NewRequest(http.MethodGet, "http://169.254.169.254/latest/meta-data", nil)
		if err != nil {
			t.Fatalf("NewRequest: %v", err)
		}
		resp, err := rt.RoundTrip(req)
		if resp != nil {
			resp.Body.Close()
		}
		if err == nil {
			t.Fatal("expected metadata pin to fail")
		}
		if dialed != 0 {
			t.Fatalf("base transport must not dial after metadata reject, dials=%d", dialed)
		}
	})

	t.Run("unresolvable hostname fails closed before base dial", func(t *testing.T) {
		t.Parallel()
		dialed := 0
		rt := &urlPolicyTransport{
			base: proxyTransport(func(*http.Request) (*url.URL, error) {
				return &url.URL{Scheme: "http", Host: "127.0.0.1:1"}, nil
			}, func(context.Context, string, string) (net.Conn, error) {
				dialed++
				return nil, fmt.Errorf("test: base must not dial")
			}),
			reject:         rejectCloudMetadata,
			pinDestination: true,
			validate:       allowAll,
		}

		req, err := http.NewRequest(http.MethodGet, "http://no-such-host.invalid/", nil)
		if err != nil {
			t.Fatalf("NewRequest: %v", err)
		}
		resp, err := rt.RoundTrip(req)
		if resp != nil {
			resp.Body.Close()
		}
		if err == nil {
			t.Fatal("expected unresolvable hostname pin to fail")
		}
		if dialed != 0 {
			t.Fatalf("base transport must not dial after resolution reject, dials=%d", dialed)
		}
	})

	t.Run("no proxy leaves hostname for dial fallback", func(t *testing.T) {
		t.Parallel()
		var saw *http.Request
		client := &http.Client{
			Timeout: 2 * time.Second,
			Transport: &urlPolicyTransport{
				base: roundTripFunc(func(req *http.Request) (*http.Response, error) {
					saw = req
					return &http.Response{StatusCode: http.StatusOK, Body: http.NoBody, Request: req}, nil
				}),
				reject:         rejectCloudMetadata,
				pinDestination: true,
				validate:       allowAll,
			},
		}

		resp, err := client.Get("http://localhost:9090/health")
		if err != nil {
			t.Fatalf("expected hostname request to reach base: %v", err)
		}
		resp.Body.Close()
		if saw == nil {
			t.Fatal("base transport was not called")
		}
		if saw.URL.Hostname() != "localhost" || saw.URL.Port() != "9090" {
			t.Fatalf("hostname should be left unpinned without a proxy hop, host=%q", saw.URL.Host)
		}
	})

	t.Run("Proxy returning nil leaves hostname for dial fallback", func(t *testing.T) {
		t.Parallel()
		var dialAddr string
		rt := &urlPolicyTransport{
			base: proxyTransport(func(*http.Request) (*url.URL, error) {
				return nil, nil
			}, func(_ context.Context, _, addr string) (net.Conn, error) {
				dialAddr = addr
				return nil, fmt.Errorf("test: skip direct dial")
			}),
			reject:         rejectCloudMetadata,
			pinDestination: true,
			validate:       allowAll,
		}

		req, err := http.NewRequest(http.MethodGet, "http://localhost:9090/health", nil)
		if err != nil {
			t.Fatalf("NewRequest: %v", err)
		}
		resp, err := rt.RoundTrip(req)
		if resp != nil {
			resp.Body.Close()
		}
		if err == nil {
			t.Fatal("expected skip-dial error")
		}
		host, port, err := net.SplitHostPort(dialAddr)
		if err != nil {
			t.Fatalf("dial addr %q: %v", dialAddr, err)
		}
		if host != "localhost" || port != "9090" {
			t.Fatalf("direct dial should keep hostname for multi-IP fallback, got %q", dialAddr)
		}
	})

	t.Run("pinDestination false leaves hostname even with proxy", func(t *testing.T) {
		t.Parallel()
		var lastProxyReq *http.Request
		rt := &urlPolicyTransport{
			base: proxyTransport(func(req *http.Request) (*url.URL, error) {
				lastProxyReq = req
				return &url.URL{Scheme: "http", Host: "127.0.0.1:1"}, nil
			}, func(context.Context, string, string) (net.Conn, error) {
				return nil, fmt.Errorf("test: skip proxy dial")
			}),
			reject:         rejectCloudMetadata,
			pinDestination: false,
			validate:       allowAll,
		}

		req, err := http.NewRequest(http.MethodGet, "http://localhost:9090/health", nil)
		if err != nil {
			t.Fatalf("NewRequest: %v", err)
		}
		resp, err := rt.RoundTrip(req)
		if resp != nil {
			resp.Body.Close()
		}
		if err == nil {
			t.Fatal("expected skip-dial error")
		}
		if lastProxyReq == nil {
			t.Fatal("proxy was not consulted")
		}
		if lastProxyReq.URL.Hostname() != "localhost" || lastProxyReq.URL.Port() != "9090" {
			t.Fatalf("pinDestination false must not rewrite hostname, host=%q", lastProxyReq.URL.Host)
		}
	})
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
	assertPinnedIPPort(t, req.URL.Host, "443")
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

func proxyTransport(proxy func(*http.Request) (*url.URL, error), dial func(context.Context, string, string) (net.Conn, error)) *http.Transport {
	return &http.Transport{
		Proxy:       proxy,
		DialContext: dial,
	}
}

func assertPinnedIPPort(t *testing.T, hostport, wantPort string) {
	t.Helper()
	host, port, err := net.SplitHostPort(hostport)
	if err != nil {
		t.Fatalf("URL.Host should be JoinHostPort IP:port, got %q: %v", hostport, err)
	}
	if port != wantPort {
		t.Fatalf("pinned port = %q, want %q", port, wantPort)
	}
	if net.ParseIP(host) == nil {
		t.Fatalf("URL.Host should be an IP literal, got %q", host)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}
