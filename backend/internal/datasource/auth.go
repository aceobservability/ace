package datasource

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/aceobservability/ace/backend/internal/models"
	"github.com/aceobservability/ace/backend/internal/ssrf"
)

// dataSourceAuthRoundTripper stamps stored datasource credentials onto outbound
// requests bound for the configured datasource origin only. Cross-origin
// redirect hops must not regain secrets (net/http reuses the transport, and
// custom API-key headers are not stripped by the default redirect policy).
// Inner DatasourceClient dial/pin/proxy/TLS policy is left untouched.
type dataSourceAuthRoundTripper struct {
	base http.RoundTripper
	ds   models.DataSource
}

func (t *dataSourceAuthRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	cloned := req.Clone(req.Context())
	if sameDatasourceOrigin(cloned, t.ds.URL) {
		if err := applyDataSourceAuth(cloned, t.ds); err != nil {
			return nil, err
		}
	} else {
		// Drop credentials that may have been copied onto a cross-origin hop
		// (especially custom API-key headers Go does not strip on redirect).
		stripDataSourceAuth(cloned, t.ds)
	}
	return t.base.RoundTrip(cloned)
}

// sameDatasourceOrigin reports whether req targets the same host:port as the
// configured datasource URL. req.Host is preferred over URL.Host so IP pinning
// in the SSRF transport (which rewrites URL.Host but keeps the Host header)
// still matches the configured origin.
func sameDatasourceOrigin(req *http.Request, rawURL string) bool {
	configured, err := url.Parse(rawURL)
	if err != nil || strings.TrimSpace(configured.Host) == "" {
		return false
	}
	want := canonicalHostPort(configured.Scheme, configured.Host)

	if host := strings.TrimSpace(req.Host); host != "" {
		scheme := ""
		if req.URL != nil {
			scheme = req.URL.Scheme
		}
		if scheme == "" {
			scheme = configured.Scheme
		}
		if canonicalHostPort(scheme, host) == want {
			return true
		}
	}
	if req.URL != nil && strings.TrimSpace(req.URL.Host) != "" {
		return canonicalHostPort(req.URL.Scheme, req.URL.Host) == want
	}
	return false
}

func canonicalHostPort(scheme, host string) string {
	hostname := host
	port := ""
	if h, p, err := net.SplitHostPort(host); err == nil {
		hostname = h
		port = p
	} else if strings.HasPrefix(host, "[") && strings.HasSuffix(host, "]") {
		// Bracketed IPv6 without an explicit port.
		hostname = strings.TrimSuffix(strings.TrimPrefix(host, "["), "]")
	}
	if port == "" {
		port = defaultPortForScheme(scheme)
	}
	return strings.ToLower(hostname) + ":" + port
}

func defaultPortForScheme(scheme string) string {
	switch strings.ToLower(strings.TrimSpace(scheme)) {
	case "https", "wss":
		return "443"
	default:
		return "80"
	}
}

// stripDataSourceAuth removes credentials applyDataSourceAuth would have set,
// so redirect targets cannot inherit stored secrets via header copy.
func stripDataSourceAuth(req *http.Request, ds models.DataSource) {
	req.Header.Del("Authorization")

	authType := normalizeAuthType(ds.AuthType)
	if authType != "api_key" {
		return
	}
	headerName := "X-API-Key"
	if len(ds.AuthConfig) > 0 {
		var cfg datasourceAuthConfig
		if err := json.Unmarshal(ds.AuthConfig, &cfg); err == nil {
			if name := strings.TrimSpace(cfg.Header); name != "" {
				headerName = name
			}
		}
	}
	req.Header.Del(headerName)
}

// newDatasourceHTTPClient builds ssrf.DatasourceClient(timeout) then wraps it
// with stored-credential auth. Per-type timeouts stay at the call site
// (15s / 30s / stream 0).
func newDatasourceHTTPClient(ds models.DataSource, timeout time.Duration) *http.Client {
	return wrapDatasourceAuth(ssrf.DatasourceClient(timeout), ds)
}

func wrapDatasourceAuth(client *http.Client, ds models.DataSource) *http.Client {
	base := client.Transport
	if base == nil {
		base = http.DefaultTransport
	}
	client.Transport = &dataSourceAuthRoundTripper{base: base, ds: ds}
	return client
}

// dataSourceAuthHeader is the websocket call site for the same credential
// helper used by dataSourceAuthRoundTripper.
func dataSourceAuthHeader(ds models.DataSource) (http.Header, error) {
	req, err := http.NewRequest(http.MethodGet, "http://datasource.invalid", nil)
	if err != nil {
		return nil, err
	}
	if err := applyDataSourceAuth(req, ds); err != nil {
		return nil, err
	}
	return req.Header, nil
}

type datasourceAuthConfig struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Token    string `json:"token"`
	Header   string `json:"header"`
	Value    string `json:"value"`
}

func applyDataSourceAuth(req *http.Request, ds models.DataSource) error {
	authType := normalizeAuthType(ds.AuthType)
	if authType == "none" {
		return nil
	}

	var cfg datasourceAuthConfig
	if len(ds.AuthConfig) > 0 {
		if err := json.Unmarshal(ds.AuthConfig, &cfg); err != nil {
			return fmt.Errorf("invalid auth configuration: %w", err)
		}
	}

	switch authType {
	case "basic":
		if strings.TrimSpace(cfg.Username) == "" {
			return fmt.Errorf("basic auth username is required")
		}
		req.SetBasicAuth(cfg.Username, cfg.Password)
		return nil
	case "bearer":
		token := strings.TrimSpace(cfg.Token)
		if token == "" {
			return fmt.Errorf("bearer token is required")
		}
		req.Header.Set("Authorization", "Bearer "+token)
		return nil
	case "api_key":
		headerName := strings.TrimSpace(cfg.Header)
		if headerName == "" {
			headerName = "X-API-Key"
		}

		value := strings.TrimSpace(cfg.Value)
		if value == "" {
			return fmt.Errorf("api key value is required")
		}

		req.Header.Set(headerName, value)
		return nil
	default:
		return fmt.Errorf("unsupported auth type: %s", ds.AuthType)
	}
}

func normalizeAuthType(authType string) string {
	normalized := strings.ToLower(strings.TrimSpace(authType))
	if normalized == "" {
		return "none"
	}
	return normalized
}
