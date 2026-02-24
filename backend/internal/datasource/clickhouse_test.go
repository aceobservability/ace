package datasource

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/janhoon/dash/backend/internal/models"
)

func TestNormaliseToLogs(t *testing.T) {
	rows := []map[string]interface{}{
		{
			"timestamp": "2026-02-18T10:00:00Z",
			"message":   "request failed",
			"severity":  "ERROR",
			"service":   "api",
		},
	}

	logs := NormaliseToLogs(rows)
	if len(logs) != 1 {
		t.Fatalf("expected 1 log entry, got %d", len(logs))
	}

	entry := logs[0]
	if entry.Timestamp != "2026-02-18T10:00:00Z" {
		t.Fatalf("expected timestamp 2026-02-18T10:00:00Z, got %q", entry.Timestamp)
	}
	if entry.Line != "request failed" {
		t.Fatalf("expected line request failed, got %q", entry.Line)
	}
	if entry.Level != "error" {
		t.Fatalf("expected level error, got %q", entry.Level)
	}
	if entry.Labels["service"] != "api" {
		t.Fatalf("expected service label api, got %q", entry.Labels["service"])
	}
}

func TestNormaliseToMetrics(t *testing.T) {
	rows := []map[string]interface{}{
		{"timestamp": 1700000000, "value": 2.5, "host": "a", "metric_name": "cpu_usage"},
		{"timestamp": 1700000060, "value": 2.8, "host": "a", "metric_name": "cpu_usage"},
		{"timestamp": 1700000000, "value": 3.1, "host": "b", "metric_name": "cpu_usage"},
	}

	metrics := NormaliseToMetrics(rows)
	if len(metrics) != 2 {
		t.Fatalf("expected 2 metric series, got %d", len(metrics))
	}

	seriesByHost := map[string]MetricResult{}
	for _, series := range metrics {
		seriesByHost[series.Metric["host"]] = series
	}

	seriesA, ok := seriesByHost["a"]
	if !ok {
		t.Fatalf("expected host=a series to exist")
	}
	if len(seriesA.Values) != 2 {
		t.Fatalf("expected host=a to have 2 values, got %d", len(seriesA.Values))
	}
	if seriesA.Metric["__name__"] != "cpu_usage" {
		t.Fatalf("expected metric name cpu_usage, got %q", seriesA.Metric["__name__"])
	}

	firstTimestamp, ok := parseClickHouseFloat(seriesA.Values[0][0])
	if !ok || firstTimestamp != 1700000000 {
		t.Fatalf("expected first timestamp 1700000000, got %v", seriesA.Values[0][0])
	}
}

func TestNormaliseToTraces(t *testing.T) {
	rows := []map[string]interface{}{
		{
			"span_id":              "span-1",
			"parent_span_id":       "root",
			"operation_name":       "GET /health",
			"service_name":         "api",
			"start_time_unix_nano": int64(1700000000000000000),
			"duration_ns":          int64(5000000),
			"status_code":          "ERROR",
			"attributes": map[string]interface{}{
				"http.method": "GET",
			},
		},
		{
			"operation_name": "missing span id",
		},
	}

	spans := NormaliseToTraces(rows)
	if len(spans) != 1 {
		t.Fatalf("expected 1 trace span, got %d", len(spans))
	}

	span := spans[0]
	if span.SpanID != "span-1" {
		t.Fatalf("expected span id span-1, got %q", span.SpanID)
	}
	if span.ParentSpanID != "root" {
		t.Fatalf("expected parent span id root, got %q", span.ParentSpanID)
	}
	if span.ServiceName != "api" {
		t.Fatalf("expected service api, got %q", span.ServiceName)
	}
	if span.OperationName != "GET /health" {
		t.Fatalf("expected operation GET /health, got %q", span.OperationName)
	}
	if span.StartTimeUnixNano != 1700000000000000000 {
		t.Fatalf("expected start_time_unix_nano 1700000000000000000, got %d", span.StartTimeUnixNano)
	}
	if span.DurationNano != 5000000 {
		t.Fatalf("expected duration 5000000, got %d", span.DurationNano)
	}
	if span.Status != "ERROR" {
		t.Fatalf("expected status ERROR, got %q", span.Status)
	}
	if span.Tags["http.method"] != "GET" {
		t.Fatalf("expected tag http.method=GET, got %q", span.Tags["http.method"])
	}
}

func TestClickHouseClient_QueryWithSignal_UsesDatabaseAndBasicAuth(t *testing.T) {
	start := time.Unix(1700000000, 0)
	end := start.Add(5 * time.Minute)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("expected POST method, got %s", r.Method)
		}

		if r.URL.Query().Get("database") != "analytics" {
			t.Fatalf("expected database query param analytics, got %q", r.URL.Query().Get("database"))
		}

		username, password, ok := r.BasicAuth()
		if !ok {
			t.Fatal("expected basic auth to be set")
		}
		if username != "alice" || password != "secret" {
			t.Fatalf("unexpected basic auth credentials: %s/%s", username, password)
		}

		payload, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("failed to read request body: %v", err)
		}

		body := string(payload)
		if !strings.Contains(body, "FORMAT JSON") {
			t.Fatalf("expected request body to contain FORMAT JSON, got %q", body)
		}
		if !strings.Contains(body, "1700000000") {
			t.Fatalf("expected placeholder substitution with start timestamp, got %q", body)
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"timestamp":"2026-02-18T10:00:00Z","message":"ok","level":"info"}]}`))
	}))
	defer server.Close()

	client, err := NewClickHouseClient(models.DataSource{
		Type:     models.DataSourceClickHouse,
		URL:      server.URL,
		AuthType: "basic",
		AuthConfig: []byte(`{
			"username":"alice",
			"password":"secret",
			"database":"analytics"
		}`),
	})
	if err != nil {
		t.Fatalf("failed to create clickhouse client: %v", err)
	}

	result, err := client.QueryWithSignal(
		context.Background(),
		"SELECT {start} AS start",
		"logs",
		start,
		end,
		15*time.Second,
		0,
	)
	if err != nil {
		t.Fatalf("unexpected query error: %v", err)
	}

	if result.ResultType != "logs" {
		t.Fatalf("expected result type logs, got %q", result.ResultType)
	}
	if result.Data == nil || len(result.Data.Logs) != 1 {
		t.Fatalf("expected 1 log result, got %+v", result.Data)
	}
}
