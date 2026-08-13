package datasource

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// promqlMetadata is the PromQL labels/values/metric-names API shared by
// Prometheus and VictoriaMetrics. Paths are /api/v1/labels and
// /api/v1/label/{}/values — not vendor-specific.
type promqlMetadata struct {
	baseURL string
	client  *http.Client
}

type promqlMetadataResponse struct {
	Status string   `json:"status"`
	Data   []string `json:"data"`
	Error  string   `json:"error,omitempty"`
}

// MetricNames returns metric names via GET /api/v1/label/__name__/values,
// optionally filtered by a case-insensitive substring match.
func (m *promqlMetadata) MetricNames(ctx context.Context, search string) ([]string, error) {
	reqURL := fmt.Sprintf("%s/api/v1/label/__name__/values", m.baseURL)
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create metric names request: %w", err)
	}

	resp, err := m.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch metric names: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read metric names response: %w", err)
	}

	var metaResp promqlMetadataResponse
	if err := json.Unmarshal(body, &metaResp); err != nil {
		return nil, fmt.Errorf("failed to parse metric names response: %w", err)
	}

	if metaResp.Status != "success" {
		return nil, fmt.Errorf("metric names query failed: %s", metaResp.Error)
	}

	if search == "" {
		return metaResp.Data, nil
	}

	searchLower := strings.ToLower(search)
	var filtered []string
	for _, name := range metaResp.Data {
		if strings.Contains(strings.ToLower(name), searchLower) {
			filtered = append(filtered, name)
		}
	}
	return filtered, nil
}

// Labels returns label names via GET /api/v1/labels, optionally scoped to a
// metric selector via match[].
func (m *promqlMetadata) Labels(ctx context.Context, metric string) ([]string, error) {
	params := url.Values{}
	if metric != "" {
		params.Set("match[]", metric)
	}

	reqURL := fmt.Sprintf("%s/api/v1/labels", m.baseURL)
	if len(params) > 0 {
		reqURL += "?" + params.Encode()
	}

	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create labels request: %w", err)
	}

	resp, err := m.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch labels: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read labels response: %w", err)
	}

	var metaResp promqlMetadataResponse
	if err := json.Unmarshal(body, &metaResp); err != nil {
		return nil, fmt.Errorf("failed to parse labels response: %w", err)
	}

	if metaResp.Status != "success" {
		return nil, fmt.Errorf("labels query failed: %s", metaResp.Error)
	}

	return metaResp.Data, nil
}

// LabelValues returns values for a label via GET /api/v1/label/{label}/values,
// optionally scoped to a metric selector via match[].
func (m *promqlMetadata) LabelValues(ctx context.Context, label string, metric string) ([]string, error) {
	params := url.Values{}
	if metric != "" {
		params.Set("match[]", metric)
	}

	reqURL := fmt.Sprintf("%s/api/v1/label/%s/values", m.baseURL, url.PathEscape(label))
	if len(params) > 0 {
		reqURL += "?" + params.Encode()
	}

	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create label values request: %w", err)
	}

	resp, err := m.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch label values: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read label values response: %w", err)
	}

	var metaResp promqlMetadataResponse
	if err := json.Unmarshal(body, &metaResp); err != nil {
		return nil, fmt.Errorf("failed to parse label values response: %w", err)
	}

	if metaResp.Status != "success" {
		return nil, fmt.Errorf("label values query failed: %s", metaResp.Error)
	}

	return metaResp.Data, nil
}
