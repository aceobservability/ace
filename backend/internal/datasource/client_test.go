package datasource

import (
	"net/url"
	"testing"

	"github.com/janhoon/dash/backend/internal/models"
)

func TestNewClient_Prometheus(t *testing.T) {
	ds := models.DataSource{
		Type: models.DataSourcePrometheus,
		URL:  "http://localhost:9090",
	}
	client, err := NewClient(ds)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, ok := client.(*PrometheusClient); !ok {
		t.Errorf("expected PrometheusClient, got %T", client)
	}
}

func TestNewClient_VictoriaMetrics(t *testing.T) {
	ds := models.DataSource{
		Type: models.DataSourceVictoriaMetrics,
		URL:  "http://localhost:8428",
	}
	client, err := NewClient(ds)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, ok := client.(*VictoriaMetricsClient); !ok {
		t.Errorf("expected VictoriaMetricsClient, got %T", client)
	}
}

func TestNewClient_Loki(t *testing.T) {
	ds := models.DataSource{
		Type: models.DataSourceLoki,
		URL:  "http://localhost:3100",
	}
	client, err := NewClient(ds)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, ok := client.(*LokiClient); !ok {
		t.Errorf("expected LokiClient, got %T", client)
	}
}

func TestNewClient_VictoriaLogs(t *testing.T) {
	ds := models.DataSource{
		Type: models.DataSourceVictoriaLogs,
		URL:  "http://localhost:9428",
	}
	client, err := NewClient(ds)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, ok := client.(*VictoriaLogsClient); !ok {
		t.Errorf("expected VictoriaLogsClient, got %T", client)
	}
}

func TestNewClient_Tempo(t *testing.T) {
	ds := models.DataSource{
		Type: models.DataSourceTempo,
		URL:  "http://localhost:3200",
	}
	client, err := NewClient(ds)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, ok := client.(*TempoClient); !ok {
		t.Errorf("expected TempoClient, got %T", client)
	}
}

func TestNewClient_VictoriaTraces(t *testing.T) {
	ds := models.DataSource{
		Type: models.DataSourceVictoriaTraces,
		URL:  "http://localhost:10428",
	}
	client, err := NewClient(ds)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, ok := client.(*VictoriaTracesClient); !ok {
		t.Errorf("expected VictoriaTracesClient, got %T", client)
	}
}

func TestNewClient_ClickHouse(t *testing.T) {
	ds := models.DataSource{
		Type: models.DataSourceClickHouse,
		URL:  "http://localhost:8123",
	}
	client, err := NewClient(ds)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, ok := client.(*ClickHouseClient); !ok {
		t.Errorf("expected ClickHouseClient, got %T", client)
	}
}

func TestNewClient_CloudWatch(t *testing.T) {
	ds := models.DataSource{
		Type:       models.DataSourceCloudWatch,
		URL:        "https://monitoring.us-east-1.amazonaws.com",
		AuthConfig: []byte(`{"region":"us-east-1"}`),
	}
	client, err := NewClient(ds)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, ok := client.(*CloudWatchClient); !ok {
		t.Errorf("expected CloudWatchClient, got %T", client)
	}
}

func TestNewClient_Elasticsearch(t *testing.T) {
	ds := models.DataSource{
		Type: models.DataSourceElasticsearch,
		URL:  "http://localhost:9200",
	}
	client, err := NewClient(ds)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, ok := client.(*ElasticsearchClient); !ok {
		t.Errorf("expected ElasticsearchClient, got %T", client)
	}
}

func TestNewClient_InvalidType(t *testing.T) {
	ds := models.DataSource{
		Type: "invalid",
		URL:  "http://localhost:9090",
	}
	_, err := NewClient(ds)
	if err == nil {
		t.Error("expected error for invalid type, got nil")
	}
}

func TestDetectLogLevel(t *testing.T) {
	tests := []struct {
		labels map[string]string
		line   string
		want   string
	}{
		{map[string]string{"level": "ERROR"}, "some message", "error"},
		{map[string]string{"severity": "Warning"}, "some message", "warning"},
		{map[string]string{"severity": "Unspecified"}, "level=info msg=\"query\"", "info"},
		{map[string]string{"severity": "Unspecified"}, "> level=info ts=2026-02-08T14:30:26Z msg=\"query\"", "info"},
		{map[string]string{"severity_text": "ERROR2"}, "some message", "error"},
		{map[string]string{}, "Error: something failed", "error"},
		{map[string]string{}, "WARN: low disk space", "warning"},
		{map[string]string{}, "INFO starting service", "info"},
		{map[string]string{}, "DEBUG verbose output", "debug"},
		{map[string]string{}, "just a regular log line", ""},
	}

	for _, tt := range tests {
		got := detectLogLevel(tt.labels, tt.line)
		if got != tt.want {
			t.Errorf("detectLogLevel(%v, %q) = %q, want %q", tt.labels, tt.line, got, tt.want)
		}
	}
}

func TestToWebSocketURL(t *testing.T) {
	params := url.Values{}
	params.Set("query", `{job="api"}`)

	wsURL, err := toWebSocketURL("http://localhost:3100", "/loki/api/v1/tail", params)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	parsedURL, err := url.Parse(wsURL)
	if err != nil {
		t.Fatalf("failed to parse URL: %v", err)
	}

	if parsedURL.Scheme != "ws" {
		t.Fatalf("expected ws scheme, got %s", parsedURL.Scheme)
	}
	if parsedURL.Path != "/loki/api/v1/tail" {
		t.Fatalf("expected /loki/api/v1/tail path, got %s", parsedURL.Path)
	}
	if parsedURL.Query().Get("query") != `{job="api"}` {
		t.Fatalf("expected encoded query to round-trip, got %s", parsedURL.Query().Get("query"))
	}
}

func TestParseVictoriaLogsLine(t *testing.T) {
	entry, ok := parseVictoriaLogsLine(`{"_msg":"boom","_time":"2026-02-08T12:00:00Z","service":"api","level":"error"}`)
	if !ok {
		t.Fatal("expected line to parse")
	}

	if entry.Line != "boom" {
		t.Fatalf("expected line to be boom, got %q", entry.Line)
	}
	if entry.Timestamp != "2026-02-08T12:00:00Z" {
		t.Fatalf("expected timestamp to match, got %q", entry.Timestamp)
	}
	if entry.Labels["service"] != "api" {
		t.Fatalf("expected service label api, got %q", entry.Labels["service"])
	}
	if entry.Level != "error" {
		t.Fatalf("expected level error, got %q", entry.Level)
	}
}

func TestParseVictoriaLogsLineInvalid(t *testing.T) {
	if _, ok := parseVictoriaLogsLine(`not-json`); ok {
		t.Fatal("expected invalid line to fail parsing")
	}
}
