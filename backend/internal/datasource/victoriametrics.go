package datasource

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/aceobservability/ace/backend/internal/models"
)

// VictoriaMetricsClient queries VictoriaMetrics using PromQL-compatible API
type VictoriaMetricsClient struct {
	datasource models.DataSource
	baseURL    string
	client     *http.Client
}

func NewVictoriaMetricsClient(ds models.DataSource) (*VictoriaMetricsClient, error) {
	return &VictoriaMetricsClient{
		datasource: ds,
		baseURL:    ds.URL,
		client:     newDatasourceHTTPClient(ds, 30*time.Second),
	}, nil
}

func (c *VictoriaMetricsClient) TestConnection(ctx context.Context) error {
	return runHTTPConnectionCheck(ctx, c.datasource, c.client, []string{"/health", "/api/v1/query?query=1", "/"})
}

type vmQueryResponse struct {
	Status string `json:"status"`
	Data   struct {
		ResultType string `json:"resultType"`
		Result     []struct {
			Metric map[string]string `json:"metric"`
			Values [][]interface{}   `json:"values"`
		} `json:"result"`
	} `json:"data"`
	Error string `json:"error,omitempty"`
}

func (c *VictoriaMetricsClient) Query(ctx context.Context, query string, start, end time.Time, step time.Duration, limit int) (*QueryResult, error) {
	params := url.Values{}
	params.Set("query", query)
	params.Set("start", strconv.FormatInt(start.Unix(), 10))
	params.Set("end", strconv.FormatInt(end.Unix(), 10))
	params.Set("step", fmt.Sprintf("%ds", int(step.Seconds())))

	reqURL := fmt.Sprintf("%s/api/v1/query_range?%s", c.baseURL, params.Encode())
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to query VictoriaMetrics: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var vmResp vmQueryResponse
	if err := json.Unmarshal(body, &vmResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	if vmResp.Status != "success" {
		return &QueryResult{
			Status:     "error",
			Error:      vmResp.Error,
			ResultType: "metrics",
		}, nil
	}

	result := &QueryResult{
		Status:     "success",
		ResultType: "metrics",
		Data: &QueryData{
			ResultType: vmResp.Data.ResultType,
			Result:     make([]MetricResult, len(vmResp.Data.Result)),
		},
	}

	for i, r := range vmResp.Data.Result {
		result.Data.Result[i] = MetricResult{
			Metric: r.Metric,
			Values: r.Values,
		}
	}

	return result, nil
}

// vmMetadataResponse represents the standard VictoriaMetrics JSON response
// for metadata endpoints that return string arrays.
type vmMetadataResponse struct {
	Status string   `json:"status"`
	Data   []string `json:"data"`
	Error  string   `json:"error,omitempty"`
}

// MetricNames returns all metric names from VictoriaMetrics, optionally filtered
// by a case-insensitive substring match on the search parameter.
func (c *VictoriaMetricsClient) MetricNames(ctx context.Context, search string) ([]string, error) {
	reqURL := fmt.Sprintf("%s/api/v1/label/__name__/values", c.baseURL)
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create metric names request: %w", err)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch metric names: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read metric names response: %w", err)
	}

	var vmResp vmMetadataResponse
	if err := json.Unmarshal(body, &vmResp); err != nil {
		return nil, fmt.Errorf("failed to parse metric names response: %w", err)
	}

	if vmResp.Status != "success" {
		return nil, fmt.Errorf("metric names query failed: %s", vmResp.Error)
	}

	if search == "" {
		return vmResp.Data, nil
	}

	searchLower := strings.ToLower(search)
	var filtered []string
	for _, name := range vmResp.Data {
		if strings.Contains(strings.ToLower(name), searchLower) {
			filtered = append(filtered, name)
		}
	}
	return filtered, nil
}

// Labels returns all label names from VictoriaMetrics, optionally scoped to a
// specific metric via the match[] query parameter.
func (c *VictoriaMetricsClient) Labels(ctx context.Context, metric string) ([]string, error) {
	params := url.Values{}
	if metric != "" {
		params.Set("match[]", metric)
	}

	reqURL := fmt.Sprintf("%s/api/v1/labels", c.baseURL)
	if len(params) > 0 {
		reqURL += "?" + params.Encode()
	}

	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create labels request: %w", err)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch labels: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read labels response: %w", err)
	}

	var vmResp vmMetadataResponse
	if err := json.Unmarshal(body, &vmResp); err != nil {
		return nil, fmt.Errorf("failed to parse labels response: %w", err)
	}

	if vmResp.Status != "success" {
		return nil, fmt.Errorf("labels query failed: %s", vmResp.Error)
	}

	return vmResp.Data, nil
}

// LabelValues returns all values for a given label from VictoriaMetrics,
// optionally scoped to a specific metric via the match[] query parameter.
func (c *VictoriaMetricsClient) LabelValues(ctx context.Context, label string, metric string) ([]string, error) {
	params := url.Values{}
	if metric != "" {
		params.Set("match[]", metric)
	}

	reqURL := fmt.Sprintf("%s/api/v1/label/%s/values", c.baseURL, url.PathEscape(label))
	if len(params) > 0 {
		reqURL += "?" + params.Encode()
	}

	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create label values request: %w", err)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch label values: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read label values response: %w", err)
	}

	var vmResp vmMetadataResponse
	if err := json.Unmarshal(body, &vmResp); err != nil {
		return nil, fmt.Errorf("failed to parse label values response: %w", err)
	}

	if vmResp.Status != "success" {
		return nil, fmt.Errorf("label values query failed: %s", vmResp.Error)
	}

	return vmResp.Data, nil
}
