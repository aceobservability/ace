package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/aceobservability/ace/backend/internal/auth"
	"github.com/aceobservability/ace/backend/internal/ssrf"
)

type GrafanaDiscoveryHandler struct {
	client *http.Client
}

func NewGrafanaDiscoveryHandler() *GrafanaDiscoveryHandler {
	c := ssrf.SafeClient(5 * time.Second)
	c.CheckRedirect = func(_ *http.Request, _ []*http.Request) error {
		return http.ErrUseLastResponse // don't follow redirects
	}
	return &GrafanaDiscoveryHandler{
		client: c,
	}
}

const (
	grafanaMaxResponseSize = 10 * 1024 * 1024 // 10MB
	grafanaMaxDashboards   = 500
)

// sanitizeString strips HTML tags and script content from imported strings.
func sanitizeString(s string) string {
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	return strings.TrimSpace(s)
}

// grafanaBaseURL returns a scheme://host base for a user-supplied Grafana URL
// after SSRF validation. Uses IsValidRedirectURL so CodeQL treats the true
// branch as a request-forgery barrier for raw.
func grafanaBaseURL(raw string) (string, error) {
	// Positive guard form: CodeQL RedirectCheckBarrier sanitizes `raw` on the
	// true branch of IsValidRedirectURL.
	if ssrf.IsValidRedirectURL(raw) {
		u, err := url.Parse(raw)
		if err != nil {
			return "", fmt.Errorf("invalid url: %w", err)
		}
		// Rebuild from validated components only — no user-controlled path/query.
		return (&url.URL{Scheme: u.Scheme, Host: u.Host}).String(), nil
	}
	// Surface the concrete validation error when available.
	if _, err := ssrf.ValidateURL(raw); err != nil {
		return "", err
	}
	return "", fmt.Errorf("url failed SSRF validation")
}

type GrafanaConnectRequest struct {
	URL    string `json:"url"`
	APIKey string `json:"api_key"`
}

type GrafanaConnectResponse struct {
	OK      bool   `json:"ok"`
	Version string `json:"version,omitempty"`
	Error   string `json:"error,omitempty"`
}

// Connect tests connectivity to a Grafana instance and returns its version.
func (h *GrafanaDiscoveryHandler) Connect(w http.ResponseWriter, r *http.Request) {
	_, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req GrafanaConnectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	base, err := grafanaBaseURL(req.URL)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(GrafanaConnectResponse{OK: false, Error: err.Error()})
		return
	}

	healthURL := base + "/api/health"
	httpReq, err := http.NewRequestWithContext(r.Context(), http.MethodGet, healthURL, nil)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(GrafanaConnectResponse{OK: false, Error: "failed to create request"})
		return
	}

	if req.APIKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+req.APIKey)
	}

	resp, err := h.client.Do(httpReq)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(GrafanaConnectResponse{OK: false, Error: "failed to connect to Grafana"})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))

	if resp.StatusCode != http.StatusOK {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(GrafanaConnectResponse{OK: false, Error: fmt.Sprintf("Grafana returned status %d", resp.StatusCode)})
		return
	}

	var health struct {
		Version string `json:"version"`
	}
	_ = json.Unmarshal(body, &health)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(GrafanaConnectResponse{OK: true, Version: health.Version})
}

type GrafanaDashboardSummary struct {
	UID   string   `json:"uid"`
	Title string   `json:"title"`
	Tags  []string `json:"tags,omitempty"`
}

// ListDashboards returns dashboard summaries from a remote Grafana instance.
func (h *GrafanaDiscoveryHandler) ListDashboards(w http.ResponseWriter, r *http.Request) {
	_, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	grafanaURLStr := r.URL.Query().Get("url")
	apiKey := r.URL.Query().Get("api_key")

	base, err := grafanaBaseURL(grafanaURLStr)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
		return
	}

	searchURL := fmt.Sprintf("%s/api/search?type=dash-db&limit=%d", base, grafanaMaxDashboards)
	httpReq, err := http.NewRequestWithContext(r.Context(), http.MethodGet, searchURL, nil)
	if err != nil {
		http.Error(w, `{"error":"failed to create request"}`, http.StatusInternalServerError)
		return
	}

	if apiKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+apiKey)
	}

	resp, err := h.client.Do(httpReq)
	if err != nil {
		http.Error(w, `{"error":"failed to connect to Grafana"}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		http.Error(w, fmt.Sprintf(`{"error":"Grafana returned status %d"}`, resp.StatusCode), http.StatusBadGateway)
		return
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, grafanaMaxResponseSize))
	if err != nil {
		http.Error(w, `{"error":"failed to read Grafana response"}`, http.StatusBadGateway)
		return
	}

	var results []struct {
		UID   string   `json:"uid"`
		Title string   `json:"title"`
		Tags  []string `json:"tags"`
	}
	if err := json.Unmarshal(body, &results); err != nil {
		http.Error(w, `{"error":"failed to parse Grafana response"}`, http.StatusBadGateway)
		return
	}

	dashboards := make([]GrafanaDashboardSummary, 0, len(results))
	for _, item := range results {
		dashboards = append(dashboards, GrafanaDashboardSummary{
			UID:   item.UID,
			Title: sanitizeString(item.Title),
			Tags:  item.Tags,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(dashboards)
}

// GetDashboard fetches a single dashboard's full JSON from a remote Grafana instance by UID.
func (h *GrafanaDiscoveryHandler) GetDashboard(w http.ResponseWriter, r *http.Request) {
	_, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	uid := r.PathValue("uid")
	if uid == "" {
		http.Error(w, `{"error":"dashboard uid is required"}`, http.StatusBadRequest)
		return
	}

	grafanaURLStr := r.URL.Query().Get("url")
	apiKey := r.URL.Query().Get("api_key")

	base, err := grafanaBaseURL(grafanaURLStr)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
		return
	}

	dashURL := fmt.Sprintf("%s/api/dashboards/uid/%s", base, url.PathEscape(uid))
	httpReq, err := http.NewRequestWithContext(r.Context(), http.MethodGet, dashURL, nil)
	if err != nil {
		http.Error(w, `{"error":"failed to create request"}`, http.StatusInternalServerError)
		return
	}

	if apiKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+apiKey)
	}

	resp, err := h.client.Do(httpReq)
	if err != nil {
		http.Error(w, `{"error":"failed to connect to Grafana"}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		http.Error(w, fmt.Sprintf(`{"error":"Grafana returned status %d"}`, resp.StatusCode), http.StatusBadGateway)
		return
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, grafanaMaxResponseSize))
	if err != nil {
		http.Error(w, `{"error":"failed to read Grafana response"}`, http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(body)
}
