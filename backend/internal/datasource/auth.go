package datasource

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/aceobservability/ace/backend/internal/models"
	"github.com/aceobservability/ace/backend/internal/ssrf"
)

// dataSourceAuthRoundTripper stamps stored datasource credentials onto every
// outbound request while leaving the inner DatasourceClient dial/pin/proxy/TLS
// policy untouched.
type dataSourceAuthRoundTripper struct {
	base http.RoundTripper
	ds   models.DataSource
}

func (t *dataSourceAuthRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	cloned := req.Clone(req.Context())
	if err := applyDataSourceAuth(cloned, t.ds); err != nil {
		return nil, err
	}
	return t.base.RoundTrip(cloned)
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
