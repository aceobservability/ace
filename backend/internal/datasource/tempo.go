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

// TempoClient is used for trace datasource connectivity checks.
type TempoClient struct {
	datasource models.DataSource
	httpClient *http.Client
}

func NewTempoClient(ds models.DataSource) (*TempoClient, error) {
	if ds.URL == "" {
		return nil, fmt.Errorf("datasource url is required")
	}

	return &TempoClient{
		datasource: ds,
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}, nil
}

func (c *TempoClient) Query(ctx context.Context, query string, start, end time.Time, step time.Duration, limit int) (*QueryResult, error) {
	_ = ctx
	_ = query
	_ = start
	_ = end
	_ = step
	_ = limit

	return nil, fmt.Errorf("tempo datasource does not support /query; use tracing endpoints")
}

func (c *TempoClient) TestConnection(ctx context.Context) error {
	return runHTTPConnectionCheck(ctx, c.datasource, []string{"/ready", "/api/search?limit=1", "/"})
}

func (c *TempoClient) GetTrace(ctx context.Context, traceID string) (*Trace, error) {
	trimmedTraceID := strings.TrimSpace(traceID)
	if trimmedTraceID == "" {
		return nil, fmt.Errorf("trace id is required")
	}

	payload, err := doTracingRequest(ctx, c.httpClient, c.datasource, http.MethodGet, "/api/traces/"+url.PathEscape(trimmedTraceID), nil)
	if err != nil {
		return nil, err
	}

	return parseTrace(payload)
}

func (c *TempoClient) SearchTraces(ctx context.Context, req TraceSearchRequest) ([]TraceSummary, error) {
	params := buildTempoTraceSearchParams(req)
	payload, err := doTracingRequest(ctx, c.httpClient, c.datasource, http.MethodGet, "/api/search?"+params.Encode(), nil)
	if err != nil {
		return nil, err
	}

	traces, err := parseTraceSearchResponse(payload)
	if err != nil {
		return nil, err
	}

	return normalizeTraceSearchResults(traces, req.Limit), nil
}

func buildTempoTraceSearchParams(req TraceSearchRequest) url.Values {
	params := buildTraceSearchParams(req)

	if strings.TrimSpace(req.Query) != "" {
		return params
	}

	traceQLFilters := make([]string, 0, 1)
	if service := strings.TrimSpace(req.Service); service != "" {
		traceQLFilters = append(traceQLFilters, `.service.name = "`+escapeTraceQLString(service)+`"`)
	}

	query := "{}"
	if len(traceQLFilters) > 0 {
		query = "{ " + strings.Join(traceQLFilters, " && ") + " }"
	}

	params.Set("q", query)
	params.Set("query", query)

	return params
}

func escapeTraceQLString(value string) string {
	replacer := strings.NewReplacer(`\\`, `\\\\`, `"`, `\\"`)
	return replacer.Replace(value)
}

func (c *TempoClient) Services(ctx context.Context) ([]string, error) {
	endpoints := []string{
		"/api/search/tags/service.name/values",
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
