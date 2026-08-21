package mcp

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestQueryGoReusesDataSourceHandler(t *testing.T) {
	src, err := os.ReadFile("query.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(src)
	for _, needle := range []string{
		"datasource.NewClient",
		"datasource.NewTracingClient",
		"datasource.NewPrometheusClient",
		"datasource.NewLokiClient",
		"datasource.NewTempoClient",
	} {
		if strings.Contains(text, needle) {
			t.Errorf("query.go must wrap DataSourceHandler methods, not construct %s", needle)
		}
	}
	for _, needle := range []string{
		"s.ds.GetMetricNames",
		"s.ds.GetLabels",
		"s.ds.GetLabelValues",
		"s.ds.GetTraceServices",
		"s.ds.ExecuteQuery",
		"s.ds.ExecuteTraceSearch",
		"s.ds.FetchTrace",
	} {
		if !strings.Contains(text, needle) {
			t.Errorf("query.go should call %s", needle)
		}
	}
}

func TestQueryToolsOrgACLAndNoSecrets(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	token, userID := insertTestUser(t, "testmcp-query-acl@example.com", "Query ACL")
	orgA := insertTestOrg(t, "MCP Query Org A", "testmcp-query-org-a")
	orgB := insertTestOrg(t, "MCP Query Org B", "testmcp-query-org-b")
	insertMembership(t, orgA, userID, "admin")

	failing := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "upstream unavailable", http.StatusBadGateway)
	}))
	t.Cleanup(failing.Close)

	secretConfig := `{"username":"ace","password":"s3cret-query","token":"tok-query"}`
	dsA := insertQueryDatasource(t, orgA, "A Metrics", "prometheus", failing.URL, "basic", secretConfig)
	dsB := insertQueryDatasource(t, orgB, "B Secret Source", "prometheus", "http://org-b-query.internal:9090", "basic", `{"username":"ace","token":"bbb-query"}`)

	session := connectMCP(t, token)
	defer session.Close()

	for _, tool := range []string{"get_metrics", "get_labels", "run_query"} {
		args := map[string]any{"datasource_id": dsB.String()}
		if tool == "run_query" {
			args["query"] = "up"
		}
		res := callTool(t, session, tool, args)
		if !res.IsError {
			t.Fatalf("%s against another org should fail closed, got %+v", tool, res.StructuredContent)
		}
		blob := toolText(res)
		if strings.Contains(blob, "B Secret Source") || strings.Contains(blob, "org-b-query.internal") || strings.Contains(blob, "bbb-query") {
			t.Errorf("%s leaked foreign datasource: %s", tool, blob)
		}
	}

	listed := callTool(t, session, "get_metrics", map[string]any{"datasource_id": dsA.String()})
	if !listed.IsError {
		t.Fatalf("expected get_metrics to fail against upstream error, got %+v", listed.StructuredContent)
	}
	secretBlob := toolText(listed)
	raw, _ := json.Marshal(listed.StructuredContent)
	combined := secretBlob + string(raw)
	for _, secret := range []string{"s3cret-query", "tok-query", "auth_config", "auth_type", `"url"`, "password"} {
		if strings.Contains(combined, secret) {
			t.Errorf("get_metrics leaked %q in %s", secret, combined)
		}
	}

	foreign := callTool(t, session, "get_metrics", map[string]any{"datasource_id": uuid.New().String()})
	if !foreign.IsError {
		t.Fatalf("missing datasource should fail, got %+v", foreign.StructuredContent)
	}
}

func TestQueryToolsReturnStructuredData(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	var metricHits, labelHits, queryHits, logHits, serviceHits, searchHits, traceHits atomic.Int32
	prom := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.HasSuffix(r.URL.Path, "/api/v1/label/__name__/values"):
			metricHits.Add(1)
			names := []string{"up", "go_goroutines"}
			for i := 0; i < 210; i++ {
				names = append(names, "extra_metric_"+strconv.Itoa(i))
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"status": "success", "data": names})
		case strings.HasSuffix(r.URL.Path, "/api/v1/labels"):
			labelHits.Add(1)
			_ = json.NewEncoder(w).Encode(map[string]any{"status": "success", "data": []string{"__name__", "job"}})
		case strings.Contains(r.URL.Path, "/api/v1/label/") && strings.HasSuffix(r.URL.Path, "/values"):
			_ = json.NewEncoder(w).Encode(map[string]any{"status": "success", "data": []string{"prometheus", "node"}})
		case strings.Contains(r.URL.Path, "/api/v1/query_range"):
			queryHits.Add(1)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status": "success",
				"data": map[string]any{
					"resultType": "matrix",
					"result": []map[string]any{
						{"metric": map[string]string{"__name__": "up", "job": "prom"}, "values": [][]any{{float64(time.Now().Unix()), "1"}}},
					},
				},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(prom.Close)

	loki := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(r.URL.Path, "/loki/api/v1/labels") && !strings.Contains(r.URL.Path, "/values"):
			_ = json.NewEncoder(w).Encode(map[string]any{"status": "success", "data": []string{"job", "level"}})
		case strings.Contains(r.URL.Path, "/loki/api/v1/query_range"):
			logHits.Add(1)
			ts := strconv.FormatInt(time.Now().UnixNano(), 10)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status": "success",
				"data": map[string]any{
					"resultType": "streams",
					"result": []map[string]any{
						{"stream": map[string]string{"job": "ace"}, "values": [][]string{{ts, "hello from loki"}}},
					},
				},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(loki.Close)

	tempo := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.URL.Path == "/api/search/tags/service.name/values":
			serviceHits.Add(1)
			_, _ = w.Write([]byte(`{"data":["frontend","worker"]}`))
		case strings.HasPrefix(r.URL.Path, "/api/search"):
			searchHits.Add(1)
			_, _ = w.Write([]byte(`{"traces":[{"traceID":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","rootServiceName":"frontend","rootTraceName":"GET /","startTimeUnixNano":"1700000000000000000","durationMs":12.5}]}`))
		case strings.HasPrefix(r.URL.Path, "/api/traces/"):
			traceHits.Add(1)
			_, _ = w.Write([]byte(`{"data":[{"traceID":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","spans":[{"traceID":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","spanID":"root","operationName":"GET /","references":[],"startTime":1700000000000000,"duration":1000,"tags":[],"processID":"p1"}],"processes":{"p1":{"serviceName":"frontend"}}}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(tempo.Close)

	token, userID := insertTestUser(t, "testmcp-query-data@example.com", "Query Data")
	orgID := insertTestOrg(t, "MCP Query Data Org", "testmcp-query-data-org")
	insertMembership(t, orgID, userID, "admin")
	promID := insertQueryDatasource(t, orgID, "Prom", "prometheus", prom.URL, "none", `{"password":"never-leak"}`)
	lokiID := insertQueryDatasource(t, orgID, "Loki", "loki", loki.URL, "none", `{"password":"never-leak-loki"}`)
	tempoID := insertQueryDatasource(t, orgID, "Tempo", "tempo", tempo.URL, "none", `{"password":"never-leak-tempo"}`)

	session := connectMCP(t, token)
	defer session.Close()

	metrics := callTool(t, session, "get_metrics", map[string]any{"datasource_id": promID.String()})
	if metrics.IsError {
		t.Fatalf("get_metrics: %s", toolText(metrics))
	}
	var metricsOut metricsOutput
	mustDecodeStructured(t, metrics, &metricsOut)
	if metricsOut.Total <= defaultListCap {
		t.Fatalf("expected truncated metric list, total=%d", metricsOut.Total)
	}
	if !metricsOut.Truncated || len(metricsOut.Metrics) != defaultListCap {
		t.Fatalf("truncated=%v len=%d, want cap %d", metricsOut.Truncated, len(metricsOut.Metrics), defaultListCap)
	}
	if metricHits.Load() == 0 {
		t.Fatal("get_metrics did not hit Prometheus /api/v1/label/__name__/values")
	}

	labels := callTool(t, session, "get_labels", map[string]any{"datasource_id": promID.String(), "metric": "up"})
	if labels.IsError {
		t.Fatalf("get_labels: %s", toolText(labels))
	}
	var labelsOut labelsOutput
	mustDecodeStructured(t, labels, &labelsOut)
	if len(labelsOut.Labels) == 0 {
		t.Fatal("get_labels returned empty")
	}
	if labelHits.Load() == 0 {
		t.Fatal("get_labels did not hit Prometheus /api/v1/labels")
	}

	values := callTool(t, session, "get_label_values", map[string]any{
		"datasource_id": promID.String(),
		"label":         "job",
	})
	if values.IsError {
		t.Fatalf("get_label_values: %s", toolText(values))
	}
	var valuesOut labelValuesOutput
	mustDecodeStructured(t, values, &valuesOut)
	if len(valuesOut.Values) == 0 {
		t.Fatal("get_label_values returned empty")
	}

	end := time.Now().Unix()
	start := end - 3600
	queried := callTool(t, session, "run_query", map[string]any{
		"datasource_id": promID.String(),
		"expr":          "up",
		"signal":        "metrics",
		"start":         start,
		"end":           end,
		"step":          15,
	})
	if queried.IsError {
		t.Fatalf("run_query metrics: %s", toolText(queried))
	}
	var queryOut runQueryOutput
	mustDecodeStructured(t, queried, &queryOut)
	if queryOut.Status != "success" || len(queryOut.Metrics) == 0 {
		t.Fatalf("run_query metrics = %+v", queryOut)
	}
	if queryHits.Load() == 0 {
		t.Fatal("run_query did not hit Prometheus /api/v1/query_range")
	}

	logs := callTool(t, session, "run_query", map[string]any{
		"datasource_id": lokiID.String(),
		"query":         `{job="ace"}`,
		"signal":        "logs",
		"start":         start,
		"end":           end,
		"limit":         50,
	})
	if logs.IsError {
		t.Fatalf("run_query logs: %s", toolText(logs))
	}
	var logsOut runQueryOutput
	mustDecodeStructured(t, logs, &logsOut)
	if logsOut.ResultType != "logs" || len(logsOut.Logs) == 0 {
		t.Fatalf("run_query logs = %+v", logsOut)
	}
	if logHits.Load() == 0 {
		t.Fatal("run_query logs did not hit Loki /loki/api/v1/query_range")
	}

	lokiLabels := callTool(t, session, "get_labels", map[string]any{"datasource_id": lokiID.String()})
	if lokiLabels.IsError {
		t.Fatalf("get_labels loki: %s", toolText(lokiLabels))
	}

	services := callTool(t, session, "get_trace_services", map[string]any{"datasource_id": tempoID.String()})
	if services.IsError {
		t.Fatalf("get_trace_services: %s", toolText(services))
	}
	var servicesOut traceServicesOutput
	mustDecodeStructured(t, services, &servicesOut)
	if len(servicesOut.Services) == 0 {
		t.Fatal("get_trace_services returned empty")
	}
	if serviceHits.Load() == 0 {
		t.Fatal("get_trace_services did not hit Tempo services endpoint")
	}

	traces := callTool(t, session, "run_query", map[string]any{
		"datasource_id": tempoID.String(),
		"query":         `{resource.service.name="frontend"}`,
		"signal":        "traces",
		"start":         start,
		"end":           end,
		"limit":         20,
	})
	if traces.IsError {
		t.Fatalf("run_query traces: %s", toolText(traces))
	}
	var tracesOut runQueryOutput
	mustDecodeStructured(t, traces, &tracesOut)
	if tracesOut.ResultType != "traces" || len(tracesOut.Traces) == 0 {
		t.Fatalf("run_query traces = %+v", tracesOut)
	}
	if searchHits.Load() == 0 {
		t.Fatal("run_query traces did not hit Tempo /api/search")
	}

	got := callTool(t, session, "run_query", map[string]any{
		"datasource_id": tempoID.String(),
		"query":         "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		"signal":        "traces",
	})
	if got.IsError {
		t.Fatalf("run_query get trace: %s", toolText(got))
	}
	var gotOut runQueryOutput
	mustDecodeStructured(t, got, &gotOut)
	if gotOut.Trace == nil || gotOut.Trace.TraceID == "" {
		t.Fatalf("run_query get trace = %+v", gotOut)
	}
	if traceHits.Load() == 0 {
		t.Fatal("run_query hex trace id did not hit Tempo /api/traces/{id}")
	}

	secretBlob := toolText(metrics) + toolText(queried) + toolText(logs) + toolText(traces) + toolText(got)
	raw, _ := json.Marshal(metrics.StructuredContent)
	raw2, _ := json.Marshal(queried.StructuredContent)
	combined := secretBlob + string(raw) + string(raw2)
	for _, secret := range []string{"never-leak", "auth_config", "auth_type"} {
		if strings.Contains(combined, secret) {
			t.Errorf("query tools leaked %q", secret)
		}
	}
}

func insertQueryDatasource(t *testing.T, orgID uuid.UUID, name, dsType, rawURL, authType, authConfig string) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	if err := testPool.QueryRow(context.Background(),
		`INSERT INTO datasources (organization_id, name, type, url, auth_type, auth_config)
		 VALUES ($1, $2, $3, $4, $5, $6::jsonb)
		 RETURNING id`,
		orgID, name, dsType, rawURL, authType, authConfig,
	).Scan(&id); err != nil {
		t.Fatalf("insert datasource: %v", err)
	}
	return id
}

func TestLooksLikeTraceID(t *testing.T) {
	if !looksLikeTraceID("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb") {
		t.Fatal("32 hex should match")
	}
	if !looksLikeTraceID("0123456789abcdef") {
		t.Fatal("16 hex should match")
	}
	if looksLikeTraceID(`{resource.service.name="frontend"}`) {
		t.Fatal("TraceQL should not look like a trace id")
	}
	if looksLikeTraceID("up") {
		t.Fatal("promql should not look like a trace id")
	}
}
