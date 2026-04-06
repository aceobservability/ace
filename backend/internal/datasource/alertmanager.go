package datasource

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/aceobservability/ace/backend/internal/models"
)

// AlertManagerClient wraps HTTP calls to AlertManager's v2 API.
type AlertManagerClient struct {
	baseURL    string
	client     *http.Client
	datasource models.DataSource
}

// NewAlertManagerClient creates a new AlertManager client from a datasource record.
func NewAlertManagerClient(ds models.DataSource) (*AlertManagerClient, error) {
	if ds.URL == "" {
		return nil, fmt.Errorf("alertmanager datasource URL is required")
	}
	return &AlertManagerClient{
		baseURL:    ds.URL,
		client:     &http.Client{Timeout: 30 * time.Second},
		datasource: ds,
	}, nil
}

// AMAlert represents an alert returned by AlertManager.
type AMAlert struct {
	Labels       map[string]string `json:"labels"`
	Annotations  map[string]string `json:"annotations"`
	State        string            `json:"state"`
	ActiveAt     time.Time         `json:"activeAt"`
	EndsAt       time.Time         `json:"endsAt"`
	StartsAt     time.Time         `json:"startsAt"`
	GeneratorURL string            `json:"generatorURL"`
	Fingerprint  string            `json:"fingerprint"`
	Status       AMAlertStatus     `json:"status"`
	Receivers    []AMReceiver      `json:"receivers"`
}

// AMAlertStatus represents the status block inside an alert.
type AMAlertStatus struct {
	State       string   `json:"state"`
	SilencedBy  []string `json:"silencedBy"`
	InhibitedBy []string `json:"inhibitedBy"`
}

// AMMatcher represents a silence matcher.
type AMMatcher struct {
	Name    string `json:"name"`
	Value   string `json:"value"`
	IsRegex bool   `json:"isRegex"`
	IsEqual bool   `json:"isEqual"`
}

// AMSilenceStatus represents the status of a silence.
type AMSilenceStatus struct {
	State string `json:"state"`
}

// AMSilence represents a silence returned by AlertManager.
type AMSilence struct {
	ID        string          `json:"id"`
	Matchers  []AMMatcher     `json:"matchers"`
	StartsAt  time.Time       `json:"startsAt"`
	EndsAt    time.Time       `json:"endsAt"`
	CreatedBy string          `json:"createdBy"`
	Comment   string          `json:"comment"`
	Status    AMSilenceStatus `json:"status"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

// AMSilenceCreate is the payload for creating a silence.
type AMSilenceCreate struct {
	Matchers  []AMMatcher `json:"matchers"`
	StartsAt  time.Time   `json:"startsAt"`
	EndsAt    time.Time   `json:"endsAt"`
	CreatedBy string      `json:"createdBy"`
	Comment   string      `json:"comment"`
}

// AMSilenceResponse is the response from POST /api/v2/silences.
type AMSilenceResponse struct {
	SilenceID string `json:"silenceID"`
}

// AMReceiver represents a receiver from AlertManager.
type AMReceiver struct {
	Name string `json:"name"`
}

// AMVersionInfo holds version information from the status endpoint.
type AMVersionInfo struct {
	Version string `json:"version"`
}

// AMClusterStatus holds cluster status info.
type AMClusterStatus struct {
	Status string `json:"status"`
}

// AMStatus represents the status response from AlertManager.
type AMStatus struct {
	Cluster     AMClusterStatus `json:"cluster"`
	VersionInfo AMVersionInfo   `json:"versionInfo"`
	Uptime      time.Time       `json:"uptime"`
}

// GetAlerts fetches alerts from AlertManager.
func (c *AlertManagerClient) GetAlerts(ctx context.Context, active, silenced, inhibited bool) ([]AMAlert, error) {
	path := fmt.Sprintf("/api/v2/alerts?active=%t&silenced=%t&inhibited=%t", active, silenced, inhibited)
	return doAlertManagerRequest[[]AMAlert](ctx, c, http.MethodGet, path, nil)
}

// GetSilences fetches all silences from AlertManager.
func (c *AlertManagerClient) GetSilences(ctx context.Context) ([]AMSilence, error) {
	return doAlertManagerRequest[[]AMSilence](ctx, c, http.MethodGet, "/api/v2/silences", nil)
}

// CreateSilence creates a new silence and returns its ID.
func (c *AlertManagerClient) CreateSilence(ctx context.Context, silence AMSilenceCreate) (string, error) {
	body, err := json.Marshal(silence)
	if err != nil {
		return "", fmt.Errorf("failed to marshal silence: %w", err)
	}

	result, err := doAlertManagerRequest[AMSilenceResponse](ctx, c, http.MethodPost, "/api/v2/silences", body)
	if err != nil {
		return "", err
	}
	return result.SilenceID, nil
}

// ExpireSilence expires (deletes) a silence by ID.
func (c *AlertManagerClient) ExpireSilence(ctx context.Context, id string) error {
	reqURL := c.baseURL + "/api/v2/silence/" + id
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, reqURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create expire silence request: %w", err)
	}
	if err := applyDataSourceAuth(req, c.datasource); err != nil {
		return err
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("expire silence request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 256))
		return fmt.Errorf("expire silence returned status %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

// GetReceivers fetches all receivers from AlertManager.
func (c *AlertManagerClient) GetReceivers(ctx context.Context) ([]AMReceiver, error) {
	return doAlertManagerRequest[[]AMReceiver](ctx, c, http.MethodGet, "/api/v2/receivers", nil)
}

// GetStatus fetches the status of AlertManager (used for health check).
func (c *AlertManagerClient) GetStatus(ctx context.Context) (*AMStatus, error) {
	result, err := doAlertManagerRequest[AMStatus](ctx, c, http.MethodGet, "/api/v2/status", nil)
	if err != nil {
		return nil, err
	}
	return &result, nil
}

func doAlertManagerRequest[T any](ctx context.Context, c *AlertManagerClient, method, path string, body []byte) (T, error) {
	var zero T
	reqURL := c.baseURL + path

	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	}

	req, err := http.NewRequestWithContext(ctx, method, reqURL, bodyReader)
	if err != nil {
		return zero, fmt.Errorf("failed to create request for %s: %w", path, err)
	}

	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	if err := applyDataSourceAuth(req, c.datasource); err != nil {
		return zero, err
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return zero, fmt.Errorf("request to %s failed: %w", path, err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return zero, fmt.Errorf("failed to read response from %s: %w", path, err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return zero, fmt.Errorf("%s returned status %d: %s", path, resp.StatusCode, string(respBody))
	}

	var result T
	if err := json.Unmarshal(respBody, &result); err != nil {
		return zero, fmt.Errorf("failed to parse response from %s: %w", path, err)
	}
	return result, nil
}
