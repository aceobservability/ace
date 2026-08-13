package datasource

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/aceobservability/ace/backend/internal/models"
)

func testDS(typ models.DataSourceType, rawURL string) models.DataSource {
	return models.DataSource{Type: typ, URL: rawURL}
}

const cloudMetadataURL = "http://169.254.169.254/"

func TestDatasourceClientsWireDialAndRedirectPolicy(t *testing.T) {
	t.Parallel()

	clients := constructedDatasourceHTTPClients(t)
	for name, client := range clients {
		t.Run(name, func(t *testing.T) {
			if client == nil {
				t.Fatal("http client is nil")
			}
			if client.CheckRedirect == nil {
				t.Fatal("expected DatasourceClient redirect policy (CheckRedirect)")
			}
			if client.Transport == nil {
				t.Fatal("expected DatasourceClient dial policy (Transport)")
			}
		})
	}

	t.Run("victorialogs_stream_timeout", func(t *testing.T) {
		c, err := NewVictoriaLogsClient(testDS(models.DataSourceVictoriaLogs, "http://127.0.0.1:9428"))
		if err != nil {
			t.Fatalf("NewVictoriaLogsClient: %v", err)
		}
		if c.streamClient == nil {
			t.Fatal("streamClient is nil")
		}
		if c.streamClient.Timeout != 0 {
			t.Fatalf("streamClient.Timeout = %s, want 0 for long-lived tails", c.streamClient.Timeout)
		}
	})
}

func TestDatasourceClientsAllowPrivateNetworks(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"success","data":{"result":[],"alerts":[],"groups":[]},"traces":[],"hits":{"hits":[]}}`))
	}))
	t.Cleanup(srv.Close)

	for name, query := range datasourceQueryFns() {
		t.Run(name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			err := query(ctx, srv.URL)
			if isOutboundPolicyError(err) {
				t.Fatalf("query to private network should not be blocked by SSRF policy: %v", err)
			}
		})
	}
}

func TestDatasourceClientsBlockMetadata(t *testing.T) {
	t.Parallel()

	for name, query := range datasourceQueryFns() {
		t.Run(name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			if err := query(ctx, strings.TrimRight(cloudMetadataURL, "/")); err == nil {
				t.Fatal("query to cloud metadata endpoint should fail")
			}
		})
	}
}

func TestDatasourceClientsBlockMetadataRedirect(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "http://169.254.169.254/latest/meta-data", http.StatusFound)
	}))
	t.Cleanup(srv.Close)

	for name, query := range datasourceQueryFns() {
		t.Run(name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			if err := query(ctx, srv.URL); err == nil {
				t.Fatal("query with redirect to cloud metadata endpoint should fail")
			}
		})
	}
}

func TestLokiStreamBlocksMetadata(t *testing.T) {
	t.Parallel()

	client, err := NewLokiClient(testDS(models.DataSourceLoki, strings.TrimRight(cloudMetadataURL, "/")))
	if err != nil {
		t.Fatalf("NewLokiClient failed: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	err = client.Stream(ctx, `{job="ace"}`, time.Time{}, 1, func(LogEntry) error { return nil })
	if err == nil {
		t.Fatal("Loki websocket stream to cloud metadata endpoint should fail")
	}
}

func TestVictoriaLogsStreamBlocksMetadata(t *testing.T) {
	t.Parallel()

	client, err := NewVictoriaLogsClient(testDS(models.DataSourceVictoriaLogs, strings.TrimRight(cloudMetadataURL, "/")))
	if err != nil {
		t.Fatalf("NewVictoriaLogsClient failed: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	err = client.Stream(ctx, `*`, time.Time{}, 1, func(LogEntry) error { return nil })
	if err == nil {
		t.Fatal("VictoriaLogs stream to cloud metadata endpoint should fail")
	}
}

func isOutboundPolicyError(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "cloud metadata") ||
		strings.Contains(msg, "private/internal") ||
		strings.Contains(msg, "redirect target rejected")
}

func constructedDatasourceHTTPClients(t *testing.T) map[string]*http.Client {
	t.Helper()

	prom, err := NewPrometheusClient(testDS(models.DataSourcePrometheus, "http://127.0.0.1:9090"))
	if err != nil {
		t.Fatalf("NewPrometheusClient: %v", err)
	}
	vm, err := NewVictoriaMetricsClient(testDS(models.DataSourceVictoriaMetrics, "http://127.0.0.1:8428"))
	if err != nil {
		t.Fatalf("NewVictoriaMetricsClient: %v", err)
	}
	loki, err := NewLokiClient(testDS(models.DataSourceLoki, "http://127.0.0.1:3100"))
	if err != nil {
		t.Fatalf("NewLokiClient: %v", err)
	}
	vlogs, err := NewVictoriaLogsClient(testDS(models.DataSourceVictoriaLogs, "http://127.0.0.1:9428"))
	if err != nil {
		t.Fatalf("NewVictoriaLogsClient: %v", err)
	}
	tempo, err := NewTempoClient(models.DataSource{URL: "http://127.0.0.1:3200", Type: models.DataSourceTempo})
	if err != nil {
		t.Fatalf("NewTempoClient: %v", err)
	}
	vtraces, err := NewVictoriaTracesClient(models.DataSource{URL: "http://127.0.0.1:10428", Type: models.DataSourceVictoriaTraces})
	if err != nil {
		t.Fatalf("NewVictoriaTracesClient: %v", err)
	}
	ch, err := NewClickHouseClient(models.DataSource{URL: "http://127.0.0.1:8123", Type: models.DataSourceClickHouse})
	if err != nil {
		t.Fatalf("NewClickHouseClient: %v", err)
	}
	es, err := NewElasticsearchClient(models.DataSource{URL: "http://127.0.0.1:9200", Type: models.DataSourceElasticsearch})
	if err != nil {
		t.Fatalf("NewElasticsearchClient: %v", err)
	}
	am, err := NewAlertManagerClient(models.DataSource{URL: "http://127.0.0.1:9093", Type: models.DataSourceAlertManager})
	if err != nil {
		t.Fatalf("NewAlertManagerClient: %v", err)
	}
	vmalert, err := NewVMAlertClient(models.DataSource{URL: "http://127.0.0.1:8880", Type: models.DataSourceVMAlert})
	if err != nil {
		t.Fatalf("NewVMAlertClient: %v", err)
	}

	return map[string]*http.Client{
		"prometheus":          prom.httpClient,
		"victoriametrics":     vm.client,
		"loki":                loki.client,
		"victorialogs":        vlogs.client,
		"victorialogs_stream": vlogs.streamClient,
		"tempo":               tempo.httpClient,
		"victoriatraces":      vtraces.httpClient,
		"clickhouse":          ch.httpClient,
		"elasticsearch":       es.httpClient,
		"alertmanager":        am.client,
		"vmalert":             vmalert.client,
	}
}

func datasourceQueryFns() map[string]func(context.Context, string) error {
	return map[string]func(context.Context, string) error{
		"prometheus": func(ctx context.Context, baseURL string) error {
			client, err := NewPrometheusClient(testDS(models.DataSourcePrometheus, baseURL))
			if err != nil {
				return err
			}
			result, err := client.Query(ctx, "up", time.Now().Add(-time.Hour), time.Now(), time.Minute, 10)
			if err != nil {
				return err
			}
			if result != nil && result.Status == "error" && result.Error != "" {
				return fmt.Errorf("%s", result.Error)
			}
			return nil
		},
		"victoriametrics": func(ctx context.Context, baseURL string) error {
			client, err := NewVictoriaMetricsClient(testDS(models.DataSourceVictoriaMetrics, baseURL))
			if err != nil {
				return err
			}
			_, err = client.Query(ctx, "up", time.Now().Add(-time.Hour), time.Now(), time.Minute, 10)
			return err
		},
		"loki": func(ctx context.Context, baseURL string) error {
			client, err := NewLokiClient(testDS(models.DataSourceLoki, baseURL))
			if err != nil {
				return err
			}
			_, err = client.Query(ctx, `{job="ace"}`, time.Now().Add(-time.Hour), time.Now(), time.Minute, 10)
			return err
		},
		"victorialogs": func(ctx context.Context, baseURL string) error {
			client, err := NewVictoriaLogsClient(testDS(models.DataSourceVictoriaLogs, baseURL))
			if err != nil {
				return err
			}
			_, err = client.Query(ctx, `*`, time.Now().Add(-time.Hour), time.Now(), time.Minute, 10)
			return err
		},
		"tempo": func(ctx context.Context, baseURL string) error {
			client, err := NewTempoClient(models.DataSource{URL: baseURL, Type: models.DataSourceTempo})
			if err != nil {
				return err
			}
			_, err = client.GetTrace(ctx, "abc")
			return err
		},
		"victoriatraces": func(ctx context.Context, baseURL string) error {
			client, err := NewVictoriaTracesClient(models.DataSource{URL: baseURL, Type: models.DataSourceVictoriaTraces})
			if err != nil {
				return err
			}
			_, err = client.GetTrace(ctx, "abc")
			return err
		},
		"clickhouse": func(ctx context.Context, baseURL string) error {
			client, err := NewClickHouseClient(models.DataSource{URL: baseURL, Type: models.DataSourceClickHouse})
			if err != nil {
				return err
			}
			_, err = client.Query(ctx, "SELECT 1", time.Now().Add(-time.Hour), time.Now(), time.Minute, 10)
			return err
		},
		"elasticsearch": func(ctx context.Context, baseURL string) error {
			client, err := NewElasticsearchClient(models.DataSource{URL: baseURL, Type: models.DataSourceElasticsearch})
			if err != nil {
				return err
			}
			_, err = client.Query(ctx, "*", time.Now().Add(-time.Hour), time.Now(), time.Minute, 10)
			return err
		},
		"alertmanager": func(ctx context.Context, baseURL string) error {
			client, err := NewAlertManagerClient(models.DataSource{URL: baseURL, Type: models.DataSourceAlertManager})
			if err != nil {
				return err
			}
			_, err = client.GetStatus(ctx)
			return err
		},
		"vmalert": func(ctx context.Context, baseURL string) error {
			client, err := NewVMAlertClient(models.DataSource{URL: baseURL, Type: models.DataSourceVMAlert})
			if err != nil {
				return err
			}
			return client.Health(ctx)
		},
	}
}
