package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/janhoon/dash/backend/internal/auth"
)

type GrafanaDiscoveryHandler struct {
	client *http.Client
}

func NewGrafanaDiscoveryHandler() *GrafanaDiscoveryHandler {
	return &GrafanaDiscoveryHandler{
		client: &http.Client{
			Timeout: 5 * time.Second,
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
				return http.ErrUseLastResponse // don't follow redirects
			},
		},
	}
}

const (
	grafanaMaxResponseSize = 10 * 1024 * 1024 // 10MB
	grafanaMaxDashboards   = 500
)

// validateGrafanaURL applies strict SSRF protection: block private networks,
// loopback, link-local, and cloud metadata endpoints.
func validateGrafanaURL(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("invalid url: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, fmt.Errorf("url must use http or https scheme")
	}
	hostname := u.Hostname()
	if hostname == "" {
		return nil, fmt.Errorf("url must include a hostname")
	}

	// Check direct IP
	if ip := net.ParseIP(hostname); ip != nil {
		if err := checkGrafanaIP(ip); err != nil {
			return nil, err
		}
		return u, nil
	}

	// Resolve hostname to check all IPs
	ips, err := net.LookupHost(hostname)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve hostname: %w", err)
	}
	for _, ipStr := range ips {
		if ip := net.ParseIP(ipStr); ip != nil {
			if err := checkGrafanaIP(ip); err != nil {
				return nil, err
			}
		}
	}
	return u, nil
}

func checkGrafanaIP(ip net.IP) error {
	if ip.Equal(net.ParseIP("169.254.169.254")) {
		return fmt.Errorf("url must not target cloud metadata endpoint")
	}
	if ip.IsLoopback() {
		return fmt.Errorf("url must not target loopback address")
	}
	if ip.IsPrivate() {
		return fmt.Errorf("url must not target private network address")
	}
	if ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
		return fmt.Errorf("url must not target link-local address")
	}
	return nil
}

// sanitizeString strips HTML tags and script content from imported strings.
func sanitizeString(s string) string {
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	return strings.TrimSpace(s)
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

	grafanaURL, err := validateGrafanaURL(req.URL)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(GrafanaConnectResponse{OK: false, Error: err.Error()})
		return
	}

	healthURL := fmt.Sprintf("%s://%s/api/health", grafanaURL.Scheme, grafanaURL.Host)
	httpReq, err := http.NewRequestWithContext(r.Context(), "GET", healthURL, nil)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(GrafanaConnectResponse{OK: false, Error: "failed to create request"})
		return
	}

	if req.APIKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+req.APIKey)
	}

	resp, err := h.client.Do(httpReq)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(GrafanaConnectResponse{OK: false, Error: "failed to connect to Grafana"})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))

	if resp.StatusCode != http.StatusOK {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(GrafanaConnectResponse{OK: false, Error: fmt.Sprintf("Grafana returned status %d", resp.StatusCode)})
		return
	}

	var health struct {
		Version string `json:"version"`
	}
	json.Unmarshal(body, &health)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(GrafanaConnectResponse{OK: true, Version: health.Version})
}

type GrafanaDashboardSummary struct {
	UID   string   `json:"uid"`
	Title string   `json:"title"`
	Tags  []string `json:"tags,omitempty"`
}

func (h *GrafanaDiscoveryHandler) ListDashboards(w http.ResponseWriter, r *http.Request) {
	_, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	grafanaURLStr := r.URL.Query().Get("url")
	apiKey := r.URL.Query().Get("api_key")

	grafanaURL, err := validateGrafanaURL(grafanaURLStr)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
		return
	}

	searchURL := fmt.Sprintf("%s://%s/api/search?type=dash-db&limit=%d", grafanaURL.Scheme, grafanaURL.Host, grafanaMaxDashboards)
	httpReq, err := http.NewRequestWithContext(r.Context(), "GET", searchURL, nil)
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
	for _, r := range results {
		dashboards = append(dashboards, GrafanaDashboardSummary{
			UID:   r.UID,
			Title: sanitizeString(r.Title),
			Tags:  r.Tags,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dashboards)
}

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

	grafanaURL, err := validateGrafanaURL(grafanaURLStr)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
		return
	}

	dashURL := fmt.Sprintf("%s://%s/api/dashboards/uid/%s", grafanaURL.Scheme, grafanaURL.Host, url.PathEscape(uid))
	httpReq, err := http.NewRequestWithContext(r.Context(), "GET", dashURL, nil)
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
	w.Write(body)
}
