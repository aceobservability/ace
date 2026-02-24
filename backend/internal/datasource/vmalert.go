package datasource

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/janhoon/dash/backend/internal/models"
)

// VMAlertClient wraps HTTP calls to VMAlert's API.
type VMAlertClient struct {
	baseURL    string
	client     *http.Client
	datasource models.DataSource
}

// NewVMAlertClient creates a new VMAlert client from a datasource record.
func NewVMAlertClient(ds models.DataSource) (*VMAlertClient, error) {
	if ds.URL == "" {
		return nil, fmt.Errorf("vmalert datasource URL is required")
	}
	return &VMAlertClient{
		baseURL:    ds.URL,
		client:     &http.Client{Timeout: 30 * time.Second},
		datasource: ds,
	}, nil
}

// VMAlertAlert represents an alert returned by VMAlert.
type VMAlertAlert struct {
	State       string            `json:"state"`
	Name        string            `json:"name"`
	Value       string            `json:"value"`
	Labels      map[string]string `json:"labels"`
	Annotations map[string]string `json:"annotations"`
	ActiveAt    string            `json:"activeAt"`
	Expression  string            `json:"expression,omitempty"`
}

// VMAlertAlertsResponse is the response from /api/v1/alerts.
type VMAlertAlertsResponse struct {
	Status string `json:"status"`
	Data   struct {
		Alerts []VMAlertAlert `json:"alerts"`
	} `json:"data"`
}

// VMAlertRule represents a single rule inside a group.
type VMAlertRule struct {
	State       string            `json:"state"`
	Name        string            `json:"name"`
	Query       string            `json:"query"`
	Duration    float64           `json:"duration"`
	Labels      map[string]string `json:"labels"`
	Annotations map[string]string `json:"annotations"`
	LastError   string            `json:"lastError,omitempty"`
	Health      string            `json:"health,omitempty"`
	Type        string            `json:"type"`
	Alerts      []VMAlertAlert    `json:"alerts,omitempty"`
}

// VMAlertRuleGroup represents a rule group.
type VMAlertRuleGroup struct {
	Name     string        `json:"name"`
	File     string        `json:"file"`
	Rules    []VMAlertRule `json:"rules"`
	Interval float64       `json:"interval"`
}

// VMAlertGroupsResponse is the response from /api/v1/groups.
type VMAlertGroupsResponse struct {
	Status string `json:"status"`
	Data   struct {
		Groups []VMAlertRuleGroup `json:"groups"`
	} `json:"data"`
}

// VMAlertRulesResponse is the response from /api/v1/rules.
type VMAlertRulesResponse = VMAlertGroupsResponse

// GetAlerts fetches active alerts from VMAlert.
func (c *VMAlertClient) GetAlerts(ctx context.Context) (*VMAlertAlertsResponse, error) {
	return doVMAlertRequest[VMAlertAlertsResponse](ctx, c, "/api/v1/alerts")
}

// GetGroups fetches rule groups from VMAlert.
func (c *VMAlertClient) GetGroups(ctx context.Context) (*VMAlertGroupsResponse, error) {
	return doVMAlertRequest[VMAlertGroupsResponse](ctx, c, "/api/v1/groups")
}

// GetRules fetches rules from VMAlert.
func (c *VMAlertClient) GetRules(ctx context.Context) (*VMAlertRulesResponse, error) {
	return doVMAlertRequest[VMAlertRulesResponse](ctx, c, "/api/v1/rules")
}

// Health checks VMAlert liveness.
func (c *VMAlertClient) Health(ctx context.Context) error {
	reqURL := c.baseURL + "/health"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create health request: %w", err)
	}
	if err := applyDataSourceAuth(req, c.datasource); err != nil {
		return err
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("health check failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 256))
		return fmt.Errorf("health check returned status %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

func doVMAlertRequest[T any](ctx context.Context, c *VMAlertClient, path string) (*T, error) {
	reqURL := c.baseURL + path
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request for %s: %w", path, err)
	}
	if err := applyDataSourceAuth(req, c.datasource); err != nil {
		return nil, err
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request to %s failed: %w", path, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response from %s: %w", path, err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("%s returned status %d: %s", path, resp.StatusCode, string(body))
	}

	var result T
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response from %s: %w", path, err)
	}
	return &result, nil
}
