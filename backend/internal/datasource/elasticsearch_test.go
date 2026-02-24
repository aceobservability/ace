package datasource

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/janhoon/dash/backend/internal/models"
)

func TestElasticsearchClient_QueryWithSignal_Logs(t *testing.T) {
	start := time.Unix(1_700_000_000, 0)
	end := start.Add(15 * time.Minute)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("expected POST method, got %s", r.Method)
		}
		if r.URL.Path != "/logs-*/_search" {
			t.Fatalf("expected /logs-*/_search path, got %s", r.URL.Path)
		}

		username, password, ok := r.BasicAuth()
		if !ok {
			t.Fatal("expected basic auth to be set")
		}
		if username != "elastic" || password != "secret" {
			t.Fatalf("unexpected basic auth credentials: %s/%s", username, password)
		}

		payload, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("failed to read request body: %v", err)
		}

		var body map[string]interface{}
		if err := json.Unmarshal(payload, &body); err != nil {
			t.Fatalf("failed to decode request body: %v", err)
		}

		query, ok := body["query"].(map[string]interface{})
		if !ok {
			t.Fatalf("expected query object in request body")
		}
		if _, hasBool := query["bool"]; !hasBool {
			t.Fatalf("expected bool query with time filter, got %+v", query)
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"hits": {
				"hits": [
					{
						"_index": "logs-2026.02.22",
						"_id": "log-1",
						"_source": {
							"@timestamp": "2026-02-22T15:00:00Z",
							"message": "request failed",
							"level": "ERROR",
							"service.name": "api"
						}
					}
				]
			}
		}`))
	}))
	defer server.Close()

	client, err := NewElasticsearchClient(models.DataSource{
		Type:     models.DataSourceElasticsearch,
		URL:      server.URL,
		AuthType: "basic",
		AuthConfig: []byte(`{
			"username":"elastic",
			"password":"secret",
			"index":"logs-*"
		}`),
	})
	if err != nil {
		t.Fatalf("failed to create elasticsearch client: %v", err)
	}

	result, err := client.QueryWithSignal(context.Background(), `error`, "logs", start, end, time.Minute, 200)
	if err != nil {
		t.Fatalf("unexpected query error: %v", err)
	}

	if result.ResultType != "logs" {
		t.Fatalf("expected logs result type, got %q", result.ResultType)
	}
	if result.Data == nil || len(result.Data.Logs) != 1 {
		t.Fatalf("expected exactly one log entry, got %+v", result.Data)
	}

	entry := result.Data.Logs[0]
	if entry.Line != "request failed" {
		t.Fatalf("expected line request failed, got %q", entry.Line)
	}
	if entry.Level != "error" {
		t.Fatalf("expected detected level error, got %q", entry.Level)
	}
	if entry.Labels["service.name"] != "api" {
		t.Fatalf("expected service.name label api, got %q", entry.Labels["service.name"])
	}
	if entry.Labels["index"] != "logs-2026.02.22" {
		t.Fatalf("expected index label from hit metadata, got %q", entry.Labels["index"])
	}
}

func TestElasticsearchClient_QueryWithSignal_Metrics(t *testing.T) {
	start := time.Unix(1_700_000_000, 0)
	end := start.Add(10 * time.Minute)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/metrics-*/_search" {
			t.Fatalf("expected /metrics-*/_search path, got %s", r.URL.Path)
		}

		payload, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("failed to read request body: %v", err)
		}

		var body map[string]interface{}
		if err := json.Unmarshal(payload, &body); err != nil {
			t.Fatalf("failed to decode request body: %v", err)
		}

		if _, ok := body["aggs"].(map[string]interface{}); !ok {
			t.Fatalf("expected generated aggs in metrics query body, got %+v", body)
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"aggregations": {
				"timeseries": {
					"buckets": [
						{"key": 1700000000000, "key_as_string": "2023-11-14T22:13:20.000Z", "doc_count": 10},
						{"key": 1700000060000, "key_as_string": "2023-11-14T22:14:20.000Z", "doc_count": 14}
					]
				}
			}
		}`))
	}))
	defer server.Close()

	client, err := NewElasticsearchClient(models.DataSource{
		Type: models.DataSourceElasticsearch,
		URL:  server.URL,
		AuthConfig: []byte(`{
			"index":"metrics-*"
		}`),
	})
	if err != nil {
		t.Fatalf("failed to create elasticsearch client: %v", err)
	}

	result, err := client.QueryWithSignal(context.Background(), "service.name:api", "metrics", start, end, 60*time.Second, 0)
	if err != nil {
		t.Fatalf("unexpected query error: %v", err)
	}

	if result.ResultType != "metrics" {
		t.Fatalf("expected metrics result type, got %q", result.ResultType)
	}
	if result.Data == nil || len(result.Data.Result) != 1 {
		t.Fatalf("expected one metric series, got %+v", result.Data)
	}

	series := result.Data.Result[0]
	if series.Metric["__name__"] != "timeseries.count" {
		t.Fatalf("expected metric name timeseries.count, got %q", series.Metric["__name__"])
	}
	if len(series.Values) != 2 {
		t.Fatalf("expected 2 values, got %d", len(series.Values))
	}
}

func TestElasticsearchClient_QueryWithSignal_InvalidSignal(t *testing.T) {
	client, err := NewElasticsearchClient(models.DataSource{
		Type: models.DataSourceElasticsearch,
		URL:  "http://localhost:9200",
	})
	if err != nil {
		t.Fatalf("failed to create elasticsearch client: %v", err)
	}

	_, err = client.QueryWithSignal(context.Background(), "*", "traces", time.Now().Add(-time.Hour), time.Now(), time.Minute, 0)
	if err == nil {
		t.Fatal("expected error for unsupported traces signal")
	}
	if !strings.Contains(err.Error(), "must be one of: logs, metrics") {
		t.Fatalf("unexpected error message: %v", err)
	}
}
