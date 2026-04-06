package datasource

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/aceobservability/ace/backend/internal/models"
)

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
