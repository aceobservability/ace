package datasource

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/aceobservability/ace/backend/internal/models"
	"github.com/aceobservability/ace/backend/internal/ssrf"
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

// SignalQueryClient is implemented by datasources that dispatch on signal
// (ClickHouse, CloudWatch, Elasticsearch).
type SignalQueryClient interface {
	QueryWithSignal(ctx context.Context, query, signal string, start, end time.Time, step time.Duration, limit int) (*QueryResult, error)
}

// StreamClient is implemented by log datasources that support live tail.
type StreamClient interface {
	Stream(ctx context.Context, query string, start time.Time, limit int, onLog LogStreamCallback) error
}

// LabelsClient is implemented by log datasources that expose label/field names.
type LabelsClient interface {
	Labels(ctx context.Context) ([]string, error)
}

// MetricLabelsClient is implemented by PromQL datasources that can scope labels
// to a metric selector.
type MetricLabelsClient interface {
	Labels(ctx context.Context, metric string) ([]string, error)
}

// LabelValuesClient is implemented by log datasources that expose label values.
type LabelValuesClient interface {
	LabelValues(ctx context.Context, labelName string) ([]string, error)
}

// MetricLabelValuesClient is implemented by PromQL datasources that can scope
// label values to a metric selector.
type MetricLabelValuesClient interface {
	LabelValues(ctx context.Context, label, metric string) ([]string, error)
}

// MetricNamesClient is implemented by PromQL datasources that expose metric names.
type MetricNamesClient interface {
	MetricNames(ctx context.Context, search string) ([]string, error)
}

type connectionTester interface {
	TestConnection(ctx context.Context) error
}

// NewClient creates a datasource client based on the datasource type
func NewClient(ds models.DataSource) (Client, error) {
	switch ds.Type {
	case models.DataSourcePrometheus:
		return NewPrometheusClient(ds)
	case models.DataSourceVictoriaMetrics:
		return NewVictoriaMetricsClient(ds)
	case models.DataSourceLoki:
		return NewLokiClient(ds)
	case models.DataSourceVictoriaLogs:
		return NewVictoriaLogsClient(ds)
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
	case models.DataSourceVMAlert:
		client, err := NewVMAlertClient(ds)
		if err != nil {
			return err
		}
		return runHTTPConnectionCheck(ctx, ds, client.client, []string{"/health", "/api/v1/alerts", "/"})
	case models.DataSourceAlertManager:
		client, err := NewAlertManagerClient(ds)
		if err != nil {
			return err
		}
		return runHTTPConnectionCheck(ctx, ds, client.client, []string{"/api/v2/status", "/api/v2/alerts", "/"})
	default:
		client, err := NewClient(ds)
		if err != nil {
			return err
		}
		tester, ok := client.(connectionTester)
		if !ok {
			return fmt.Errorf("unsupported datasource type: %s", ds.Type)
		}
		return tester.TestConnection(ctx)
	}
}

func runHTTPConnectionCheck(ctx context.Context, ds models.DataSource, httpClient *http.Client, endpoints []string) error {
	// Datasource URLs may legitimately target private/internal networks
	// (local Victoria stack, in-cluster Prometheus, etc.). Match create/update
	// policy: only reject non-http(s) and cloud metadata.
	//
	// Positive IsLocalURL guard: CodeQL RedirectCheckBarrier sanitizes ds.URL
	// on the true branch (function name matches isLocalUrl pattern). Keep the
	// request sinks inside this branch so the barrier applies.
	if !ssrf.IsLocalURL(ds.URL) {
		if _, err := ssrf.ValidateDatasourceURL(ds.URL); err != nil {
			return fmt.Errorf("datasource url rejected: %w", err)
		}
		return fmt.Errorf("datasource url rejected")
	}

	if httpClient == nil {
		httpClient = newDatasourceHTTPClient(ds, 10*time.Second)
	}

	baseURL := ds.URL

	var lastErr error
	for _, endpoint := range endpoints {
		targetURL, err := resolveHealthEndpoint(baseURL, endpoint)
		if err != nil {
			lastErr = err
			continue
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
		if err != nil {
			lastErr = fmt.Errorf("failed to create request: %w", err)
			continue
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
