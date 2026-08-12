package prometheus

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/prometheus/client_golang/api"
	v1 "github.com/prometheus/client_golang/api/prometheus/v1"
	"github.com/prometheus/common/model"

	"github.com/aceobservability/ace/backend/internal/ssrf"
)

// Client wraps the Prometheus API client
type Client struct {
	api v1.API
}

// QueryResult represents the result of a Prometheus query
type QueryResult struct {
	Status string     `json:"status"`
	Data   *QueryData `json:"data,omitempty"`
	Error  string     `json:"error,omitempty"`
}

// QueryData contains the result type and values
type QueryData struct {
	ResultType string         `json:"resultType"`
	Result     []MetricResult `json:"result"`
}

// MetricResult represents a single metric with its values
type MetricResult struct {
	Metric map[string]string `json:"metric"`
	Values [][]interface{}   `json:"values"`
}

// NewClient creates a new Prometheus client with the given URL.
// Outbound requests use ssrf.DatasourceClient (private nets allowed; cloud
// metadata blocked at dial and redirect). An optional HTTP client overrides
// that default (tests).
func NewClient(prometheusURL string, httpClient ...*http.Client) (*Client, error) {
	cfg := api.Config{
		Address: prometheusURL,
	}

	if len(httpClient) > 0 && httpClient[0] != nil {
		cfg.Client = httpClient[0]
	} else {
		cfg.Client = ssrf.DatasourceClient(30 * time.Second)
	}

	client, err := api.NewClient(cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create Prometheus client: %w", err)
	}

	return &Client{
		api: v1.NewAPI(client),
	}, nil
}

// QueryRange executes a range query against Prometheus
func (c *Client) QueryRange(ctx context.Context, query string, start, end time.Time, step time.Duration) (*QueryResult, error) {
	result, warnings, err := c.api.QueryRange(ctx, query, v1.Range{
		Start: start,
		End:   end,
		Step:  step,
	})

	if len(warnings) > 0 {
		// Log warnings but don't fail
		for _, w := range warnings {
			fmt.Printf("Prometheus warning: %s\n", w)
		}
	}

	if err != nil {
		return &QueryResult{
			Status: "error",
			Error:  err.Error(),
		}, nil
	}

	return transformResult(result), nil
}

// Query executes an instant query against Prometheus
func (c *Client) Query(ctx context.Context, query string, ts time.Time) (*QueryResult, error) {
	result, warnings, err := c.api.Query(ctx, query, ts)

	if len(warnings) > 0 {
		for _, w := range warnings {
			fmt.Printf("Prometheus warning: %s\n", w)
		}
	}

	if err != nil {
		return &QueryResult{
			Status: "error",
			Error:  err.Error(),
		}, nil
	}

	return transformResult(result), nil
}

// LabelNames returns all label names from Prometheus
func (c *Client) LabelNames(ctx context.Context) ([]string, error) {
	names, warnings, err := c.api.LabelNames(ctx, nil, time.Now().Add(-24*time.Hour), time.Now())

	if len(warnings) > 0 {
		for _, w := range warnings {
			fmt.Printf("Prometheus warning: %s\n", w)
		}
	}

	if err != nil {
		return nil, fmt.Errorf("failed to get label names: %w", err)
	}

	// Convert model.LabelNames to []string (client_golang >= 1.24)
	result := make([]string, len(names))
	for i, n := range names {
		result[i] = string(n)
	}

	return result, nil
}

// LabelValues returns all values for a given label name from Prometheus
func (c *Client) LabelValues(ctx context.Context, label string) ([]string, error) {
	values, warnings, err := c.api.LabelValues(ctx, label, nil, time.Now().Add(-24*time.Hour), time.Now())

	if len(warnings) > 0 {
		for _, w := range warnings {
			fmt.Printf("Prometheus warning: %s\n", w)
		}
	}

	if err != nil {
		return nil, fmt.Errorf("failed to get label values for %s: %w", label, err)
	}

	// Convert model.LabelValues to []string
	result := make([]string, len(values))
	for i, v := range values {
		result[i] = string(v)
	}

	return result, nil
}

// transformResult converts Prometheus model.Value to our QueryResult format
func transformResult(value model.Value) *QueryResult {
	result := &QueryResult{
		Status: "success",
		Data: &QueryData{
			ResultType: value.Type().String(),
			Result:     []MetricResult{},
		},
	}

	switch v := value.(type) {
	case model.Matrix:
		for _, stream := range v {
			metricResult := MetricResult{
				Metric: make(map[string]string),
				Values: make([][]interface{}, 0, len(stream.Values)),
			}

			// Extract metric labels
			for name, value := range stream.Metric {
				metricResult.Metric[string(name)] = string(value)
			}

			// Extract values as [timestamp, value] pairs
			for _, sample := range stream.Values {
				metricResult.Values = append(metricResult.Values, []interface{}{
					float64(sample.Timestamp) / 1000, // Convert milliseconds to seconds
					sample.Value.String(),
				})
			}

			result.Data.Result = append(result.Data.Result, metricResult)
		}

	case model.Vector:
		for _, sample := range v {
			metricResult := MetricResult{
				Metric: make(map[string]string),
				Values: [][]interface{}{
					{float64(sample.Timestamp) / 1000, sample.Value.String()},
				},
			}

			for name, value := range sample.Metric {
				metricResult.Metric[string(name)] = string(value)
			}

			result.Data.Result = append(result.Data.Result, metricResult)
		}

	case *model.Scalar:
		result.Data.Result = append(result.Data.Result, MetricResult{
			Metric: map[string]string{},
			Values: [][]interface{}{
				{float64(v.Timestamp) / 1000, v.Value.String()},
			},
		})
	}

	return result
}
