package datasource

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/janhoon/dash/backend/internal/models"
)

// VictoriaTracesClient is used for trace datasource connectivity checks.
type VictoriaTracesClient struct {
	datasource models.DataSource
	httpClient *http.Client
}

func NewVictoriaTracesClient(ds models.DataSource) (*VictoriaTracesClient, error) {
	if ds.URL == "" {
		return nil, fmt.Errorf("datasource url is required")
	}

	return &VictoriaTracesClient{
		datasource: ds,
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}, nil
}

func (c *VictoriaTracesClient) Query(ctx context.Context, query string, start, end time.Time, step time.Duration, limit int) (*QueryResult, error) {
	_ = ctx
	_ = query
	_ = start
	_ = end
	_ = step
	_ = limit

	return nil, fmt.Errorf("victoriatraces datasource does not support /query; use tracing endpoints")
}

func (c *VictoriaTracesClient) TestConnection(ctx context.Context) error {
	return runHTTPConnectionCheck(ctx, c.datasource, []string{"/health", "/ready", "/"})
}

func (c *VictoriaTracesClient) GetTrace(ctx context.Context, traceID string) (*Trace, error) {
	trimmedTraceID := strings.TrimSpace(traceID)
	if trimmedTraceID == "" {
		return nil, fmt.Errorf("trace id is required")
	}

	endpoints := []string{
		"/select/jaeger/api/traces/" + url.PathEscape(trimmedTraceID),
		"/api/traces/" + url.PathEscape(trimmedTraceID),
	}

	var lastErr error
	for _, endpoint := range endpoints {
		payload, err := doTracingRequest(ctx, c.httpClient, c.datasource, http.MethodGet, endpoint, nil)
		if err != nil {
			lastErr = err
			continue
		}

		trace, err := parseTrace(payload)
		if err != nil {
			lastErr = err
			continue
		}

		return trace, nil
	}

	if lastErr != nil {
		return nil, lastErr
	}

	return nil, fmt.Errorf("failed to fetch trace")
}

func (c *VictoriaTracesClient) SearchTraces(ctx context.Context, req TraceSearchRequest) ([]TraceSummary, error) {
	params := buildTraceSearchParams(req)
	endpoints := []string{
		"/select/jaeger/api/traces?" + params.Encode(),
		"/api/search?" + params.Encode(),
	}

	var lastErr error
	for _, endpoint := range endpoints {
		payload, err := doTracingRequest(ctx, c.httpClient, c.datasource, http.MethodGet, endpoint, nil)
		if err != nil {
			lastErr = err
			continue
		}

		traces, err := parseTraceSearchResponse(payload)
		if err != nil {
			lastErr = err
			continue
		}

		return normalizeTraceSearchResults(traces, req.Limit), nil
	}

	if lastErr != nil {
		return nil, lastErr
	}

	return nil, fmt.Errorf("failed to search traces")
}

func (c *VictoriaTracesClient) Services(ctx context.Context) ([]string, error) {
	endpoints := []string{
		"/select/jaeger/api/services",
		"/api/services",
	}

	var lastErr error
	for _, endpoint := range endpoints {
		payload, err := doTracingRequest(ctx, c.httpClient, c.datasource, http.MethodGet, endpoint, nil)
		if err != nil {
			lastErr = err
			continue
		}

		services, err := parseStringSlicePayload(payload)
		if err != nil {
			lastErr = err
			continue
		}

		return services, nil
	}

	if lastErr != nil {
		return nil, lastErr
	}

	return nil, fmt.Errorf("failed to fetch trace services")
}
