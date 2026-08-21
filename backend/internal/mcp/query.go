package mcp

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/aceobservability/ace/backend/internal/auth"
	"github.com/aceobservability/ace/backend/internal/datasource"
	"github.com/aceobservability/ace/backend/internal/handlers"
)

const (
	queryToolTimeout = 30 * time.Second
	discoverTimeout  = 15 * time.Second
	defaultListCap   = 200
	defaultSeriesCap = 100
	defaultLogsCap   = 200
	defaultTracesCap = 50
	defaultSpansCap  = 200
)

func registerQueryTools(mcpServer *mcp.Server, s *server) {
	mcp.AddTool(mcpServer, &mcp.Tool{
		Name:        "get_metrics",
		Title:       "Get metrics",
		Description: "List available metric names from an org datasource. Use this to discover what metrics exist before writing a query. Same path as GET /api/datasources/{id}/metric-names.",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true, Title: "Get metrics"},
	}, s.getMetrics)
	mcp.AddTool(mcpServer, &mcp.Tool{
		Name:        "get_labels",
		Title:       "Get labels",
		Description: "List available label names from an org datasource. Optionally filter to labels for a specific metric. Same path as GET /api/datasources/{id}/labels.",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true, Title: "Get labels"},
	}, s.getLabels)
	mcp.AddTool(mcpServer, &mcp.Tool{
		Name:        "get_label_values",
		Title:       "Get label values",
		Description: "List values for a specific label from an org datasource. Optionally filter to values for a specific metric. Same path as GET /api/datasources/{id}/labels/{name}/values.",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true, Title: "Get label values"},
	}, s.getLabelValues)
	mcp.AddTool(mcpServer, &mcp.Tool{
		Name:        "get_trace_services",
		Title:       "Get trace services",
		Description: "List service names from a tracing datasource. Same path as GET /api/datasources/{id}/traces/services.",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true, Title: "Get trace services"},
	}, s.getTraceServices)
	mcp.AddTool(mcpServer, &mcp.Tool{
		Name:        "run_query",
		Title:       "Run query",
		Description: "Execute a query against an org datasource. Same body as POST /api/datasources/{id}/query (query/expr, start, end, step, signal, limit). Supports metrics (range/instant), logs, and traces. Tempo/VictoriaTraces searches use POST /traces/search; a hex trace id uses GET /traces/{traceId}.",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true, Title: "Run query"},
	}, s.runQuery)
}

type datasourceIDInput struct {
	DatasourceID string `json:"datasource_id" jsonschema:"Datasource ID from list_datasources"`
}

type getMetricsInput struct {
	DatasourceID string `json:"datasource_id" jsonschema:"Datasource ID from list_datasources"`
	Search       string `json:"search,omitempty" jsonschema:"Optional search filter to narrow down metric names"`
}

type getLabelsInput struct {
	DatasourceID string `json:"datasource_id" jsonschema:"Datasource ID from list_datasources"`
	Metric       string `json:"metric,omitempty" jsonschema:"Optional metric name to filter labels for"`
}

type getLabelValuesInput struct {
	DatasourceID string `json:"datasource_id" jsonschema:"Datasource ID from list_datasources"`
	Label        string `json:"label" jsonschema:"The label name to get values for"`
	Metric       string `json:"metric,omitempty" jsonschema:"Optional metric name to filter label values for"`
}

type runQueryInput struct {
	DatasourceID string `json:"datasource_id" jsonschema:"Datasource ID from list_datasources"`
	Query        string `json:"query,omitempty" jsonschema:"Query expression (PromQL/MetricsQL, LogQL, TraceQL). Alias of expr."`
	Expr         string `json:"expr,omitempty" jsonschema:"Query expression. Alias of query."`
	Signal       string `json:"signal,omitempty" jsonschema:"Signal type: metrics, logs, or traces"`
	Start        int64  `json:"start,omitempty" jsonschema:"Unix timestamp in seconds. Defaults to 1 hour ago."`
	End          int64  `json:"end,omitempty" jsonschema:"Unix timestamp in seconds. Defaults to now."`
	Step         int64  `json:"step,omitempty" jsonschema:"Step interval in seconds for range queries. Defaults to 15."`
	Limit        int    `json:"limit,omitempty" jsonschema:"Max results for log and trace queries"`
	Service      string `json:"service,omitempty" jsonschema:"Optional service name filter for trace search"`
}

type metricsOutput struct {
	Metrics   []string `json:"metrics"`
	Truncated bool     `json:"truncated"`
	Total     int      `json:"total"`
}

type labelsOutput struct {
	Labels    []string `json:"labels"`
	Truncated bool     `json:"truncated"`
	Total     int      `json:"total"`
}

type labelValuesOutput struct {
	Label     string   `json:"label"`
	Values    []string `json:"values"`
	Truncated bool     `json:"truncated"`
	Total     int      `json:"total"`
}

type traceServicesOutput struct {
	Services  []string `json:"services"`
	Truncated bool     `json:"truncated"`
	Total     int      `json:"total"`
}

type metricSeriesOut struct {
	Metric map[string]string `json:"metric"`
	Values [][]any           `json:"values"`
}

type logEntryOut struct {
	Timestamp string            `json:"timestamp"`
	Line      string            `json:"line"`
	Labels    map[string]string `json:"labels,omitempty"`
	Level     string            `json:"level,omitempty"`
}

type runQueryOutput struct {
	Status     string                    `json:"status"`
	ResultType string                    `json:"result_type,omitempty"`
	Metrics    []metricSeriesOut         `json:"metrics,omitempty"`
	Logs       []logEntryOut             `json:"logs,omitempty"`
	Traces     []datasource.TraceSummary `json:"traces,omitempty"`
	Trace      *datasource.Trace         `json:"trace,omitempty"`
	Error      string                    `json:"error,omitempty"`
	Truncated  bool                      `json:"truncated,omitempty"`
	Total      int                       `json:"total,omitempty"`
}

func (s *server) getMetrics(ctx context.Context, _ *mcp.CallToolRequest, input getMetricsInput) (*mcp.CallToolResult, metricsOutput, error) {
	userID, dsID, err := parseToolDatasource(ctx, input.DatasourceID)
	if err != nil {
		return nil, metricsOutput{}, err
	}

	ctx, cancel := context.WithTimeout(ctx, discoverTimeout)
	defer cancel()

	names, err := s.ds.GetMetricNames(ctx, userID, dsID, input.Search)
	if err != nil {
		return nil, metricsOutput{}, mapQueryErr(err)
	}
	items, truncated, total := capStrings(names, defaultListCap)
	return nil, metricsOutput{Metrics: items, Truncated: truncated, Total: total}, nil
}

func (s *server) getLabels(ctx context.Context, _ *mcp.CallToolRequest, input getLabelsInput) (*mcp.CallToolResult, labelsOutput, error) {
	userID, dsID, err := parseToolDatasource(ctx, input.DatasourceID)
	if err != nil {
		return nil, labelsOutput{}, err
	}

	ctx, cancel := context.WithTimeout(ctx, discoverTimeout)
	defer cancel()

	names, err := s.ds.GetLabels(ctx, userID, dsID, input.Metric)
	if err != nil {
		return nil, labelsOutput{}, mapQueryErr(err)
	}
	items, truncated, total := capStrings(names, defaultListCap)
	return nil, labelsOutput{Labels: items, Truncated: truncated, Total: total}, nil
}

func (s *server) getLabelValues(ctx context.Context, _ *mcp.CallToolRequest, input getLabelValuesInput) (*mcp.CallToolResult, labelValuesOutput, error) {
	userID, dsID, err := parseToolDatasource(ctx, input.DatasourceID)
	if err != nil {
		return nil, labelValuesOutput{}, err
	}
	if strings.TrimSpace(input.Label) == "" {
		return nil, labelValuesOutput{}, fmt.Errorf("label is required")
	}

	ctx, cancel := context.WithTimeout(ctx, discoverTimeout)
	defer cancel()

	values, err := s.ds.GetLabelValues(ctx, userID, dsID, input.Label, input.Metric)
	if err != nil {
		return nil, labelValuesOutput{}, mapQueryErr(err)
	}
	items, truncated, total := capStrings(values, defaultListCap)
	return nil, labelValuesOutput{Label: input.Label, Values: items, Truncated: truncated, Total: total}, nil
}

func (s *server) getTraceServices(ctx context.Context, _ *mcp.CallToolRequest, input datasourceIDInput) (*mcp.CallToolResult, traceServicesOutput, error) {
	userID, dsID, err := parseToolDatasource(ctx, input.DatasourceID)
	if err != nil {
		return nil, traceServicesOutput{}, err
	}

	ctx, cancel := context.WithTimeout(ctx, discoverTimeout)
	defer cancel()

	services, err := s.ds.GetTraceServices(ctx, userID, dsID)
	if err != nil {
		return nil, traceServicesOutput{}, mapQueryErr(err)
	}
	items, truncated, total := capStrings(services, defaultListCap)
	return nil, traceServicesOutput{Services: items, Truncated: truncated, Total: total}, nil
}

func (s *server) runQuery(ctx context.Context, _ *mcp.CallToolRequest, input runQueryInput) (*mcp.CallToolResult, runQueryOutput, error) {
	userID, dsID, err := parseToolDatasource(ctx, input.DatasourceID)
	if err != nil {
		return nil, runQueryOutput{}, err
	}

	query := strings.TrimSpace(input.Query)
	if query == "" {
		query = strings.TrimSpace(input.Expr)
	}
	signal := strings.TrimSpace(input.Signal)

	ctx, cancel := context.WithTimeout(ctx, queryToolTimeout)
	defer cancel()

	req := datasource.QueryRequest{
		Query:  query,
		Signal: signal,
		Start:  input.Start,
		End:    input.End,
		Step:   input.Step,
		Limit:  input.Limit,
	}
	result, err := s.ds.ExecuteQuery(ctx, userID, dsID, req)
	if errors.Is(err, handlers.ErrUseTracingEndpoints) {
		if looksLikeTraceID(query) {
			trace, ferr := s.ds.FetchTrace(ctx, userID, dsID, query)
			if ferr != nil {
				return nil, runQueryOutput{}, mapQueryErr(ferr)
			}
			return nil, capTrace(trace), nil
		}
		summaries, serr := s.ds.ExecuteTraceSearch(ctx, userID, dsID, datasource.TraceSearchRequest{
			Query:   query,
			Service: strings.TrimSpace(input.Service),
			Start:   input.Start,
			End:     input.End,
			Limit:   input.Limit,
		})
		if serr != nil {
			return nil, runQueryOutput{}, mapQueryErr(serr)
		}
		return nil, capTraceSummaries(summaries), nil
	}
	if err != nil {
		return nil, runQueryOutput{}, mapQueryErr(err)
	}
	return nil, queryResultToOutput(result), nil
}

func parseToolDatasource(ctx context.Context, rawID string) (uuid.UUID, uuid.UUID, error) {
	userID, ok := auth.GetUserID(ctx)
	if !ok {
		return uuid.Nil, uuid.Nil, fmt.Errorf("unauthorized")
	}
	dsID, err := uuid.Parse(strings.TrimSpace(rawID))
	if err != nil {
		return uuid.Nil, uuid.Nil, fmt.Errorf("invalid datasource_id")
	}
	return userID, dsID, nil
}

func mapQueryErr(err error) error {
	switch {
	case errors.Is(err, handlers.ErrNotOrgMember):
		return fmt.Errorf("not a member of this organization")
	case errors.Is(err, handlers.ErrDatasourceNotFound):
		return fmt.Errorf("datasource not found")
	case errors.Is(err, handlers.ErrQueryRequired):
		return fmt.Errorf("query is required")
	case errors.Is(err, handlers.ErrLabelRequired):
		return fmt.Errorf("label is required")
	case errors.Is(err, handlers.ErrTraceIDRequired):
		return fmt.Errorf("trace id is required")
	case errors.Is(err, handlers.ErrMetricNamesUnsupported):
		return fmt.Errorf("metric name discovery is not supported for this datasource type")
	case errors.Is(err, handlers.ErrLabelsUnsupported):
		return fmt.Errorf("label discovery is not supported for this datasource type")
	case errors.Is(err, handlers.ErrLabelValuesUnsupported):
		return fmt.Errorf("label value discovery is not supported for this datasource type")
	case errors.Is(err, handlers.ErrNotTracingDatasource):
		return fmt.Errorf("trace endpoints are only supported for tracing datasources")
	default:
		return fmt.Errorf("request failed")
	}
}

func capStrings(in []string, limit int) ([]string, bool, int) {
	if in == nil {
		in = []string{}
	}
	total := len(in)
	if total > limit {
		return in[:limit], true, total
	}
	return in, false, total
}

func looksLikeTraceID(s string) bool {
	if len(s) != 16 && len(s) != 32 {
		return false
	}
	for _, r := range s {
		if !unicode.Is(unicode.ASCII_Hex_Digit, r) {
			return false
		}
	}
	return true
}

func queryResultToOutput(result *datasource.QueryResult) runQueryOutput {
	out := runQueryOutput{Status: "success"}
	if result == nil {
		return out
	}
	out.Status = result.Status
	out.ResultType = result.ResultType
	if result.Error != "" {
		out.Error = "query failed"
	}
	if result.Data == nil {
		return out
	}
	switch {
	case result.ResultType == "logs" || len(result.Data.Logs) > 0:
		out.ResultType = "logs"
		logs := result.Data.Logs
		total := len(logs)
		truncated := false
		if total > defaultLogsCap {
			logs = logs[:defaultLogsCap]
			truncated = true
		}
		out.Logs = make([]logEntryOut, 0, len(logs))
		for _, entry := range logs {
			out.Logs = append(out.Logs, logEntryOut{
				Timestamp: entry.Timestamp,
				Line:      entry.Line,
				Labels:    entry.Labels,
				Level:     entry.Level,
			})
		}
		out.Truncated = truncated
		out.Total = total
	case result.ResultType == "traces" || len(result.Data.Traces) > 0:
		out.ResultType = "traces"
		spans := result.Data.Traces
		total := len(spans)
		truncated := false
		if total > defaultSpansCap {
			spans = spans[:defaultSpansCap]
			truncated = true
		}
		out.Trace = &datasource.Trace{Spans: spans}
		out.Truncated = truncated
		out.Total = total
	default:
		if out.ResultType == "" {
			out.ResultType = "metrics"
		}
		series := result.Data.Result
		total := len(series)
		truncated := false
		if total > defaultSeriesCap {
			series = series[:defaultSeriesCap]
			truncated = true
		}
		out.Metrics = make([]metricSeriesOut, 0, len(series))
		for _, row := range series {
			out.Metrics = append(out.Metrics, metricSeriesOut{
				Metric: row.Metric,
				Values: row.Values,
			})
		}
		out.Truncated = truncated
		out.Total = total
	}
	return out
}

func capTraceSummaries(summaries []datasource.TraceSummary) runQueryOutput {
	if summaries == nil {
		summaries = []datasource.TraceSummary{}
	}
	total := len(summaries)
	truncated := false
	if total > defaultTracesCap {
		summaries = summaries[:defaultTracesCap]
		truncated = true
	}
	return runQueryOutput{
		Status:     "success",
		ResultType: "traces",
		Traces:     summaries,
		Truncated:  truncated,
		Total:      total,
	}
}

func capTrace(trace *datasource.Trace) runQueryOutput {
	out := runQueryOutput{
		Status:     "success",
		ResultType: "trace",
		Trace:      trace,
	}
	if trace == nil {
		return out
	}
	total := len(trace.Spans)
	if total > defaultSpansCap {
		cp := *trace
		cp.Spans = append([]datasource.TraceSpan(nil), trace.Spans[:defaultSpansCap]...)
		out.Trace = &cp
		out.Truncated = true
	}
	out.Total = total
	return out
}
