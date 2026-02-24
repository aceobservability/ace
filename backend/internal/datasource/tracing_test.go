package datasource

import (
	"context"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"

	"github.com/janhoon/dash/backend/internal/models"
)

func TestParseTrace_JaegerDataFormat(t *testing.T) {
	payload := []byte(`{"data":[{"traceID":"trace-1","spans":[{"traceID":"trace-1","spanID":"root","operationName":"GET /","references":[],"startTime":1700000000000000,"duration":2000,"tags":[{"key":"http.method","value":"GET"}],"logs":[{"timestamp":1700000000000100,"fields":[{"key":"event","value":"start"}]}],"processID":"p1"},{"traceID":"trace-1","spanID":"child","operationName":"SELECT users","references":[{"refType":"CHILD_OF","spanID":"root"}],"startTime":1700000000000500,"duration":500,"tags":[{"key":"error","value":true}],"processID":"p2"}],"processes":{"p1":{"serviceName":"frontend"},"p2":{"serviceName":"postgres"}}}]}`)

	trace, err := parseTrace(payload)
	if err != nil {
		t.Fatalf("parseTrace returned error: %v", err)
	}

	if trace.TraceID != "trace-1" {
		t.Fatalf("expected trace id trace-1, got %q", trace.TraceID)
	}
	if len(trace.Spans) != 2 {
		t.Fatalf("expected 2 spans, got %d", len(trace.Spans))
	}
	if trace.Spans[1].ParentSpanID != "root" {
		t.Fatalf("expected child span parent root, got %q", trace.Spans[1].ParentSpanID)
	}
	if trace.Spans[1].Status != "error" {
		t.Fatalf("expected child span status error, got %q", trace.Spans[1].Status)
	}
	if !slices.Equal(trace.Services, []string{"frontend", "postgres"}) {
		t.Fatalf("expected services [frontend postgres], got %#v", trace.Services)
	}
	if trace.DurationNano <= 0 {
		t.Fatalf("expected positive trace duration, got %d", trace.DurationNano)
	}
}

func TestParseTrace_TempoBatchesFormat(t *testing.T) {
	payload := []byte(`{"batches":[{"processes":{"p1":{"serviceName":"api"}},"spans":[{"traceId":"trace-batch","spanId":"span-1","operationName":"GET /health","processId":"p1","startTimeUnixNano":"1700000000000000000","durationNanos":"3000000"}]}]}`)

	trace, err := parseTrace(payload)
	if err != nil {
		t.Fatalf("parseTrace returned error: %v", err)
	}

	if trace.TraceID != "trace-batch" {
		t.Fatalf("expected trace id trace-batch, got %q", trace.TraceID)
	}
	if len(trace.Spans) != 1 {
		t.Fatalf("expected 1 span, got %d", len(trace.Spans))
	}
	if trace.Spans[0].ServiceName != "api" {
		t.Fatalf("expected service api, got %q", trace.Spans[0].ServiceName)
	}
	if trace.Spans[0].DurationNano != 3000000 {
		t.Fatalf("expected duration 3000000, got %d", trace.Spans[0].DurationNano)
	}
}

func TestParseTrace_TempoBatchesOTLPSpansFormat(t *testing.T) {
	payload := []byte(`{"batches":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"checkout"}}]},"scopeSpans":[{"scope":{"name":"seed"},"spans":[{"traceId":"trace-otlp","spanId":"root","name":"checkout.flow","startTimeUnixNano":"1700000000000000000","endTimeUnixNano":"1700000000009000000","attributes":[{"key":"http.method","value":{"stringValue":"POST"}},{"key":"seed.index","value":{"intValue":"0"}}]},{"traceId":"trace-otlp","spanId":"child","parentSpanId":"root","name":"db.query","startTimeUnixNano":"1700000000002000000","endTimeUnixNano":"1700000000005000000","attributes":[{"key":"db.system","value":{"stringValue":"postgres"}}],"status":{"code":"STATUS_CODE_ERROR"}}]}]}]}`)

	trace, err := parseTrace(payload)
	if err != nil {
		t.Fatalf("parseTrace returned error: %v", err)
	}

	if trace.TraceID != "trace-otlp" {
		t.Fatalf("expected trace id trace-otlp, got %q", trace.TraceID)
	}

	if len(trace.Spans) != 2 {
		t.Fatalf("expected 2 spans, got %d", len(trace.Spans))
	}

	if trace.Spans[0].ServiceName != "checkout" {
		t.Fatalf("expected root service checkout, got %q", trace.Spans[0].ServiceName)
	}

	if trace.Spans[0].OperationName != "checkout.flow" {
		t.Fatalf("expected root operation checkout.flow, got %q", trace.Spans[0].OperationName)
	}

	if trace.Spans[0].Tags["http.method"] != "POST" {
		t.Fatalf("expected root tag http.method=POST, got %q", trace.Spans[0].Tags["http.method"])
	}

	if trace.Spans[1].ParentSpanID != "root" {
		t.Fatalf("expected child parent root, got %q", trace.Spans[1].ParentSpanID)
	}

	if trace.Spans[1].Status != "error" {
		t.Fatalf("expected child status error, got %q", trace.Spans[1].Status)
	}

	if trace.Spans[1].DurationNano != 3000000 {
		t.Fatalf("expected child duration 3000000, got %d", trace.Spans[1].DurationNano)
	}

	if !slices.Equal(trace.Services, []string{"checkout"}) {
		t.Fatalf("expected services [checkout], got %#v", trace.Services)
	}
}

func TestParseTraceSearchResponse_TempoFormat(t *testing.T) {
	payload := []byte(`{"traces":[{"traceID":"trace-tempo","rootServiceName":"frontend","rootTraceName":"GET /api","startTimeUnixNano":"1700000000000000000","durationMs":12.5,"spanSet":[{},{}]}]}`)

	traces, err := parseTraceSearchResponse(payload)
	if err != nil {
		t.Fatalf("parseTraceSearchResponse returned error: %v", err)
	}

	if len(traces) != 1 {
		t.Fatalf("expected 1 trace summary, got %d", len(traces))
	}
	if traces[0].TraceID != "trace-tempo" {
		t.Fatalf("expected trace id trace-tempo, got %q", traces[0].TraceID)
	}
	if traces[0].SpanCount != 2 {
		t.Fatalf("expected span count 2, got %d", traces[0].SpanCount)
	}
	if traces[0].DurationNano <= 0 {
		t.Fatalf("expected positive duration, got %d", traces[0].DurationNano)
	}
}

func TestParseTraceSearchResponse_TempoSpanSetObjectFormat(t *testing.T) {
	payload := []byte(`{"traces":[{"traceID":"trace-live","rootServiceName":"loadgen-service-1","rootTraceName":"http.request","startTimeUnixNano":"1700000000000000000","durationMs":93,"spanSet":{"matched":3,"spans":[{},{},{}]},"serviceStats":{"loadgen-service-1":{"spanCount":3,"errorCount":2}}}]}`)

	traces, err := parseTraceSearchResponse(payload)
	if err != nil {
		t.Fatalf("parseTraceSearchResponse returned error: %v", err)
	}

	if len(traces) != 1 {
		t.Fatalf("expected 1 trace summary, got %d", len(traces))
	}

	if traces[0].TraceID != "trace-live" {
		t.Fatalf("expected trace id trace-live, got %q", traces[0].TraceID)
	}

	if traces[0].SpanCount != 3 {
		t.Fatalf("expected span count 3, got %d", traces[0].SpanCount)
	}

	if traces[0].ServiceCount != 1 {
		t.Fatalf("expected service count 1, got %d", traces[0].ServiceCount)
	}

	if traces[0].ErrorSpanCount != 2 {
		t.Fatalf("expected error span count 2, got %d", traces[0].ErrorSpanCount)
	}
}

func TestParseTraceSearchResponse_JaegerFormat(t *testing.T) {
	payload := []byte(`{"data":[{"traceID":"trace-jaeger","spans":[{"traceID":"trace-jaeger","spanID":"root","operationName":"GET /","references":[],"startTime":1700000000000000,"duration":1000,"tags":[],"processID":"p1"},{"traceID":"trace-jaeger","spanID":"child","operationName":"db","references":[{"refType":"CHILD_OF","spanID":"root"}],"startTime":1700000000000200,"duration":400,"tags":[{"key":"error","value":"true"}],"processID":"p2"}],"processes":{"p1":{"serviceName":"frontend"},"p2":{"serviceName":"postgres"}}}]}`)

	traces, err := parseTraceSearchResponse(payload)
	if err != nil {
		t.Fatalf("parseTraceSearchResponse returned error: %v", err)
	}

	if len(traces) != 1 {
		t.Fatalf("expected 1 trace summary, got %d", len(traces))
	}
	if traces[0].RootServiceName != "frontend" {
		t.Fatalf("expected root service frontend, got %q", traces[0].RootServiceName)
	}
	if traces[0].ErrorSpanCount != 1 {
		t.Fatalf("expected 1 error span, got %d", traces[0].ErrorSpanCount)
	}
}

func TestParseStringSlicePayload(t *testing.T) {
	fromWrapped, err := parseStringSlicePayload([]byte(`{"data":["api","worker"]}`))
	if err != nil {
		t.Fatalf("parseStringSlicePayload wrapped returned error: %v", err)
	}
	if !slices.Equal(fromWrapped, []string{"api", "worker"}) {
		t.Fatalf("expected wrapped payload to parse, got %#v", fromWrapped)
	}

	fromRaw, err := parseStringSlicePayload([]byte(`["api","worker"]`))
	if err != nil {
		t.Fatalf("parseStringSlicePayload raw returned error: %v", err)
	}
	if !slices.Equal(fromRaw, []string{"api", "worker"}) {
		t.Fatalf("expected raw payload to parse, got %#v", fromRaw)
	}
}

func TestBuildTempoTraceSearchParams_DefaultsToTraceQLMatchAll(t *testing.T) {
	params := buildTempoTraceSearchParams(TraceSearchRequest{Limit: 25})

	if got := params.Get("q"); got != "{}" {
		t.Fatalf("expected q to be {}, got %q", got)
	}

	if got := params.Get("query"); got != "{}" {
		t.Fatalf("expected query to be {}, got %q", got)
	}

	if got := params.Get("limit"); got != "25" {
		t.Fatalf("expected limit to be 25, got %q", got)
	}
}

func TestBuildTempoTraceSearchParams_BuildsServiceTraceQLWhenQueryEmpty(t *testing.T) {
	params := buildTempoTraceSearchParams(TraceSearchRequest{Service: `api"edge`})

	if got := params.Get("q"); got != `{ .service.name = "api\\"edge" }` {
		t.Fatalf("expected escaped service traceql query, got %q", got)
	}

	if got := params.Get("query"); got != `{ .service.name = "api\\"edge" }` {
		t.Fatalf("expected escaped service traceql query alias, got %q", got)
	}
}

func TestNormalizeTraceSearchResults_DeduplicatesSortsAndLimits(t *testing.T) {
	normalized := normalizeTraceSearchResults([]TraceSummary{
		{
			TraceID:           "trace-b",
			StartTimeUnixNano: 300,
			DurationNano:      100,
			SpanCount:         1,
		},
		{
			TraceID:           "trace-a",
			StartTimeUnixNano: 200,
			DurationNano:      80,
			SpanCount:         2,
		},
		{
			TraceID:           " trace-b ",
			StartTimeUnixNano: 350,
			DurationNano:      120,
			SpanCount:         3,
			RootServiceName:   "api",
		},
		{
			TraceID:           "trace-c",
			StartTimeUnixNano: 400,
			DurationNano:      90,
			SpanCount:         2,
		},
		{
			TraceID:           "",
			StartTimeUnixNano: 999,
		},
	}, 2)

	if len(normalized) != 2 {
		t.Fatalf("expected 2 traces after normalization, got %d", len(normalized))
	}

	if normalized[0].TraceID != "trace-c" {
		t.Fatalf("expected latest trace to be trace-c, got %q", normalized[0].TraceID)
	}

	if normalized[1].TraceID != "trace-b" {
		t.Fatalf("expected second trace to be deduplicated trace-b, got %q", normalized[1].TraceID)
	}

	if normalized[1].StartTimeUnixNano != 350 {
		t.Fatalf("expected deduplicated trace-b to keep latest start time 350, got %d", normalized[1].StartTimeUnixNano)
	}
}

func TestNormalizeTraceSearchResults_UsesDefaultLimit(t *testing.T) {
	normalized := normalizeTraceSearchResults([]TraceSummary{
		{TraceID: "trace-1", StartTimeUnixNano: 100},
		{TraceID: "trace-2", StartTimeUnixNano: 99},
		{TraceID: "trace-3", StartTimeUnixNano: 98},
	}, 0)

	if len(normalized) != 3 {
		t.Fatalf("expected all traces under default limit, got %d", len(normalized))
	}

	if normalized[0].TraceID != "trace-1" || normalized[1].TraceID != "trace-2" || normalized[2].TraceID != "trace-3" {
		t.Fatalf("expected traces to remain sorted by start time descending, got %#v", normalized)
	}
}

func TestBuildTraceServiceGraph_AggregatesNodesAndEdges(t *testing.T) {
	graph := BuildTraceServiceGraph(&Trace{
		TraceID: "trace-graph-1",
		Spans: []TraceSpan{
			{
				SpanID:            "root",
				OperationName:     "GET /orders",
				ServiceName:       "api",
				StartTimeUnixNano: 100,
				DurationNano:      1200,
			},
			{
				SpanID:            "db",
				ParentSpanID:      "root",
				OperationName:     "SELECT orders",
				ServiceName:       "postgres",
				StartTimeUnixNano: 200,
				DurationNano:      300,
				Status:            "error",
			},
			{
				SpanID:            "cache",
				ParentSpanID:      "root",
				OperationName:     "GET cache",
				ServiceName:       "redis",
				StartTimeUnixNano: 250,
				DurationNano:      200,
			},
		},
	})

	if graph.TotalRequests != 3 {
		t.Fatalf("expected total requests 3, got %d", graph.TotalRequests)
	}
	if graph.TotalErrorCount != 1 {
		t.Fatalf("expected total error count 1, got %d", graph.TotalErrorCount)
	}

	if len(graph.Nodes) != 3 {
		t.Fatalf("expected 3 graph nodes, got %d", len(graph.Nodes))
	}
	if len(graph.Edges) != 2 {
		t.Fatalf("expected 2 graph edges, got %d", len(graph.Edges))
	}

	nodeByName := map[string]TraceServiceNode{}
	for _, node := range graph.Nodes {
		nodeByName[node.ServiceName] = node
	}

	if nodeByName["api"].RequestCount != 1 {
		t.Fatalf("expected api request count 1, got %d", nodeByName["api"].RequestCount)
	}
	if nodeByName["postgres"].ErrorCount != 1 {
		t.Fatalf("expected postgres error count 1, got %d", nodeByName["postgres"].ErrorCount)
	}

	edgeByKey := map[string]TraceServiceEdge{}
	for _, edge := range graph.Edges {
		edgeByKey[edge.Source+"->"+edge.Target] = edge
	}

	postgresEdge, ok := edgeByKey["api->postgres"]
	if !ok {
		t.Fatalf("expected edge api->postgres to exist")
	}
	if postgresEdge.RequestCount != 1 {
		t.Fatalf("expected api->postgres request count 1, got %d", postgresEdge.RequestCount)
	}
	if postgresEdge.ErrorCount != 1 {
		t.Fatalf("expected api->postgres error count 1, got %d", postgresEdge.ErrorCount)
	}
}

func TestBuildTraceServiceGraph_NormalizesUnknownAndSkipsSameServiceEdges(t *testing.T) {
	graph := BuildTraceServiceGraph(&Trace{
		TraceID: "trace-graph-2",
		Spans: []TraceSpan{
			{
				SpanID:        "root",
				ServiceName:   "",
				DurationNano:  500,
				OperationName: "root",
			},
			{
				SpanID:        "child",
				ParentSpanID:  "root",
				ServiceName:   "unknown",
				DurationNano:  250,
				OperationName: "child",
			},
			{
				SpanID:        "api-child",
				ParentSpanID:  "api-root",
				ServiceName:   "api",
				DurationNano:  120,
				OperationName: "api-child",
			},
			{
				SpanID:        "api-root",
				ServiceName:   "api",
				DurationNano:  210,
				OperationName: "api-root",
			},
		},
	})

	if len(graph.Nodes) != 2 {
		t.Fatalf("expected 2 graph nodes, got %d", len(graph.Nodes))
	}
	if len(graph.Edges) != 0 {
		t.Fatalf("expected no cross-service edges, got %d", len(graph.Edges))
	}
}

func TestTempoClient_GetTrace(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/traces/trace-123" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"data":[{"traceID":"trace-123","spans":[{"traceID":"trace-123","spanID":"root","operationName":"GET /","references":[],"startTime":1700000000000000,"duration":1000,"tags":[],"processID":"p1"}],"processes":{"p1":{"serviceName":"frontend"}}}]}`))
	}))
	defer server.Close()

	client, err := NewTempoClient(models.DataSource{Type: models.DataSourceTempo, URL: server.URL})
	if err != nil {
		t.Fatalf("NewTempoClient returned error: %v", err)
	}

	trace, err := client.GetTrace(context.Background(), "trace-123")
	if err != nil {
		t.Fatalf("GetTrace returned error: %v", err)
	}

	if trace.TraceID != "trace-123" {
		t.Fatalf("expected trace id trace-123, got %q", trace.TraceID)
	}
}

func TestVictoriaTracesClient_ServicesFallback(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/select/jaeger/api/services":
			w.WriteHeader(http.StatusNotFound)
		case "/api/services":
			_, _ = w.Write([]byte(`["frontend","worker"]`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()

	client, err := NewVictoriaTracesClient(models.DataSource{Type: models.DataSourceVictoriaTraces, URL: server.URL})
	if err != nil {
		t.Fatalf("NewVictoriaTracesClient returned error: %v", err)
	}

	services, err := client.Services(context.Background())
	if err != nil {
		t.Fatalf("Services returned error: %v", err)
	}

	if !slices.Equal(services, []string{"frontend", "worker"}) {
		t.Fatalf("expected services [frontend worker], got %#v", services)
	}
}
