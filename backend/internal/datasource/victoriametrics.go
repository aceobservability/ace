package datasource

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/aceobservability/ace/backend/internal/models"
)

// VictoriaMetricsClient queries VictoriaMetrics using PromQL-compatible API
type VictoriaMetricsClient struct {
	datasource models.DataSource
	baseURL    string
	client     *http.Client
	meta       *promqlMetadata
}

func NewVictoriaMetricsClient(ds models.DataSource) (*VictoriaMetricsClient, error) {
	httpClient := newDatasourceHTTPClient(ds, 30*time.Second)
	return &VictoriaMetricsClient{
		datasource: ds,
		baseURL:    ds.URL,
		client:     httpClient,
		meta: &promqlMetadata{
			baseURL: ds.URL,
			client:  httpClient,
		},
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

func (c *VictoriaMetricsClient) MetricNames(ctx context.Context, search string) ([]string, error) {
	return c.meta.MetricNames(ctx, search)
}

func (c *VictoriaMetricsClient) Labels(ctx context.Context, metric string) ([]string, error) {
	return c.meta.Labels(ctx, metric)
}

func (c *VictoriaMetricsClient) LabelValues(ctx context.Context, label string, metric string) ([]string, error) {
	return c.meta.LabelValues(ctx, label, metric)
}
