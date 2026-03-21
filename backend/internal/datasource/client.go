package datasource

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/janhoon/dash/backend/internal/models"
)

// QueryRequest represents a query request body
type QueryRequest struct {
	Query  string `json:"query"`
	Signal string `json:"signal,omitempty"`
	Start  int64  `json:"start"` // Unix timestamp in seconds
	End    int64  `json:"end"`   // Unix timestamp in seconds
	Step   int64  `json:"step"`  // Step interval in seconds
	Limit  int    `json:"limit"` // Max results for log queries
}

// StreamRequest represents a live stream request body
type StreamRequest struct {
	Query string `json:"query"`
	Start int64  `json:"start,omitempty"` // Unix timestamp in seconds for resume cursor
	Limit int    `json:"limit,omitempty"` // Max entries per tail batch
}

// QueryResult is the unified query result format
type QueryResult struct {
	Status     string     `json:"status"`
	Data       *QueryData `json:"data,omitempty"`
	Error      string     `json:"error,omitempty"`
	ResultType string     `json:"resultType"` // "metrics" or "logs"
}

// QueryData contains the result
type QueryData struct {
	ResultType string         `json:"resultType"`
	Result     []MetricResult `json:"result,omitempty"`
	Logs       []LogEntry     `json:"logs,omitempty"`
	Traces     []TraceSpan    `json:"traces,omitempty"`
}

// MetricResult represents a single metric series (for Prometheus/VictoriaMetrics)
type MetricResult struct {
	Metric map[string]string `json:"metric"`
	Values [][]interface{}   `json:"values"`
}

// LogEntry represents a single log line (for Loki/VictoriaLogs)
type LogEntry struct {
	Timestamp string            `json:"timestamp"`
	Line      string            `json:"line"`
	Labels    map[string]string `json:"labels,omitempty"`
	Level     string            `json:"level,omitempty"`
}

type LogStreamCallback func(LogEntry) error

// Client is the interface that all datasource clients implement
type Client interface {
	Query(ctx context.Context, query string, start, end time.Time, step time.Duration, limit int) (*QueryResult, error)
}

// NewClient creates a datasource client based on the datasource type
func NewClient(ds models.DataSource) (Client, error) {
	switch ds.Type {
	case models.DataSourcePrometheus:
		return NewPrometheusClient(ds.URL)
	case models.DataSourceVictoriaMetrics:
		return NewVictoriaMetricsClient(ds.URL)
	case models.DataSourceLoki:
		return NewLokiClient(ds.URL)
	case models.DataSourceVictoriaLogs:
		return NewVictoriaLogsClient(ds.URL)
	case models.DataSourceTempo:
		return NewTempoClient(ds)
	case models.DataSourceVictoriaTraces:
		return NewVictoriaTracesClient(ds)
	case models.DataSourceClickHouse:
		return NewClickHouseClient(ds)
	case models.DataSourceCloudWatch:
		return NewCloudWatchClient(ds)
	case models.DataSourceElasticsearch:
		return NewElasticsearchClient(ds)
	default:
		return nil, fmt.Errorf("unsupported datasource type: %s", ds.Type)
	}
}

func TestConnection(ctx context.Context, ds models.DataSource) error {
	switch ds.Type {
	case models.DataSourcePrometheus:
		return runHTTPConnectionCheck(ctx, ds, []string{"/-/healthy", "/api/v1/query?query=1", "/"})
	case models.DataSourceVictoriaMetrics:
		return runHTTPConnectionCheck(ctx, ds, []string{"/health", "/api/v1/query?query=1", "/"})
	case models.DataSourceLoki:
		return runHTTPConnectionCheck(ctx, ds, []string{"/ready", "/loki/api/v1/labels?limit=1", "/"})
	case models.DataSourceVictoriaLogs:
		return runHTTPConnectionCheck(ctx, ds, []string{"/health", "/select/logsql/field_names?query=*", "/"})
	case models.DataSourceTempo:
		client, err := NewTempoClient(ds)
		if err != nil {
			return err
		}
		return client.TestConnection(ctx)
	case models.DataSourceVictoriaTraces:
		client, err := NewVictoriaTracesClient(ds)
		if err != nil {
			return err
		}
		return client.TestConnection(ctx)
	case models.DataSourceClickHouse:
		return runHTTPConnectionCheck(ctx, ds, []string{"/ping", "/?query=SELECT%201", "/"})
	case models.DataSourceCloudWatch:
		client, err := NewCloudWatchClient(ds)
		if err != nil {
			return err
		}
		return client.TestConnection(ctx)
	case models.DataSourceElasticsearch:
		return runHTTPConnectionCheck(ctx, ds, []string{"/_cluster/health", "/_cat/indices?format=json&h=index&bytes=b", "/"})
	case models.DataSourceVMAlert:
		return runHTTPConnectionCheck(ctx, ds, []string{"/health", "/api/v1/alerts", "/"})
	case models.DataSourceAlertManager:
		return runHTTPConnectionCheck(ctx, ds, []string{"/api/v2/status", "/api/v2/alerts", "/"})
	default:
		return fmt.Errorf("unsupported datasource type: %s", ds.Type)
	}
}

func runHTTPConnectionCheck(ctx context.Context, ds models.DataSource, endpoints []string) error {
	httpClient := &http.Client{Timeout: 10 * time.Second}

	var lastErr error
	for _, endpoint := range endpoints {
		targetURL, err := resolveHealthEndpoint(ds.URL, endpoint)
		if err != nil {
			lastErr = err
			continue
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
		if err != nil {
			lastErr = fmt.Errorf("failed to create request: %w", err)
			continue
		}

		if err := applyDataSourceAuth(req, ds); err != nil {
			return err
		}

		resp, err := httpClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("request failed: %w", err)
			continue
		}

		body, _ := io.ReadAll(io.LimitReader(resp.Body, 256))
		_ = resp.Body.Close()

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return nil
		}

		if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
			return fmt.Errorf("authentication failed with status %d", resp.StatusCode)
		}

		if resp.StatusCode == http.StatusNotFound {
			lastErr = fmt.Errorf("endpoint %s not found", endpoint)
			continue
		}

		message := strings.TrimSpace(string(body))
		if message == "" {
			message = http.StatusText(resp.StatusCode)
		}

		lastErr = fmt.Errorf("endpoint %s returned status %d: %s", endpoint, resp.StatusCode, message)
	}

	if lastErr != nil {
		return lastErr
	}

	return fmt.Errorf("connection test failed")
}

func resolveHealthEndpoint(baseURL, endpoint string) (string, error) {
	parsed, err := url.Parse(baseURL)
	if err != nil {
		return "", fmt.Errorf("invalid datasource url: %w", err)
	}

	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", fmt.Errorf("unsupported datasource url scheme: %q", parsed.Scheme)
	}
	if parsed.Host == "" {
		return "", fmt.Errorf("datasource url has no host")
	}

	resolved, err := url.Parse(endpoint)
	if err != nil {
		return "", fmt.Errorf("invalid health endpoint %q: %w", endpoint, err)
	}

	return parsed.ResolveReference(resolved).String(), nil
}
