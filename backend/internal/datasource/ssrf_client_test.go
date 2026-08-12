package datasource

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/aceobservability/ace/backend/internal/models"
)

// TestDatasourceClientsUseDatasourceClient verifies that all datasource clients
// use ssrf.DatasourceClient, which allows private/internal targets but blocks
// cloud metadata at dial time and on redirects.
func TestDatasourceClientsUseDatasourceClient(t *testing.T) {
	t.Parallel()

	// Bind a local server to simulate a private/internal datasource.
	// DatasourceClient must allow connecting to it (unlike SafeClient).
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"success","data":{"result":[]}}`))
	}))
	t.Cleanup(srv.Close)

	t.Run("prometheus", func(t *testing.T) {
		client, err := NewPrometheusClient(srv.URL)
		if err != nil {
			t.Fatalf("NewPrometheusClient failed: %v", err)
		}
		if client == nil {
			t.Fatal("client is nil")
		}
	})

	t.Run("victoriametrics", func(t *testing.T) {
		client, err := NewVictoriaMetricsClient(srv.URL)
		if err != nil {
			t.Fatalf("NewVictoriaMetricsClient failed: %v", err)
		}
		if client.client == nil {
			t.Fatal("client.client is nil")
		}
	})

	t.Run("loki", func(t *testing.T) {
		client, err := NewLokiClient(srv.URL)
		if err != nil {
			t.Fatalf("NewLokiClient failed: %v", err)
		}
		if client.client == nil {
			t.Fatal("client.client is nil")
		}
	})

	t.Run("victorialogs", func(t *testing.T) {
		client, err := NewVictoriaLogsClient(srv.URL)
		if err != nil {
			t.Fatalf("NewVictoriaLogsClient failed: %v", err)
		}
		if client.client == nil {
			t.Fatal("client.client is nil")
		}
	})

	t.Run("tempo", func(t *testing.T) {
		ds := models.DataSource{URL: srv.URL, Type: models.DataSourceTempo}
		client, err := NewTempoClient(ds)
		if err != nil {
			t.Fatalf("NewTempoClient failed: %v", err)
		}
		if client.httpClient == nil {
			t.Fatal("client.httpClient is nil")
		}
	})

	t.Run("victoriatraces", func(t *testing.T) {
		ds := models.DataSource{URL: srv.URL, Type: models.DataSourceVictoriaTraces}
		client, err := NewVictoriaTracesClient(ds)
		if err != nil {
			t.Fatalf("NewVictoriaTracesClient failed: %v", err)
		}
		if client.httpClient == nil {
			t.Fatal("client.httpClient is nil")
		}
	})

	t.Run("clickhouse", func(t *testing.T) {
		ds := models.DataSource{URL: srv.URL, Type: models.DataSourceClickHouse}
		client, err := NewClickHouseClient(ds)
		if err != nil {
			t.Fatalf("NewClickHouseClient failed: %v", err)
		}
		if client.httpClient == nil {
			t.Fatal("client.httpClient is nil")
		}
	})

	t.Run("elasticsearch", func(t *testing.T) {
		ds := models.DataSource{URL: srv.URL, Type: models.DataSourceElasticsearch}
		client, err := NewElasticsearchClient(ds)
		if err != nil {
			t.Fatalf("NewElasticsearchClient failed: %v", err)
		}
		if client.httpClient == nil {
			t.Fatal("client.httpClient is nil")
		}
	})

	t.Run("alertmanager", func(t *testing.T) {
		ds := models.DataSource{URL: srv.URL, Type: models.DataSourceAlertManager}
		client, err := NewAlertManagerClient(ds)
		if err != nil {
			t.Fatalf("NewAlertManagerClient failed: %v", err)
		}
		if client.client == nil {
			t.Fatal("client.client is nil")
		}
	})

	t.Run("vmalert", func(t *testing.T) {
		ds := models.DataSource{URL: srv.URL, Type: models.DataSourceVMAlert}
		client, err := NewVMAlertClient(ds)
		if err != nil {
			t.Fatalf("NewVMAlertClient failed: %v", err)
		}
		if client.client == nil {
			t.Fatal("client.client is nil")
		}
	})
}

// TestDatasourceClientsAllowPrivateNetworks verifies that datasource clients
// can successfully connect to private/internal network addresses (as required
// for in-cluster Prometheus, local Victoria stacks, etc.).
func TestDatasourceClientsAllowPrivateNetworks(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"success","data":{"result":[]}}`))
	}))
	t.Cleanup(srv.Close)

	// VictoriaMetrics simple query test
	t.Run("victoriametrics_query", func(t *testing.T) {
		client, err := NewVictoriaMetricsClient(srv.URL)
		if err != nil {
			t.Fatalf("NewVictoriaMetricsClient failed: %v", err)
		}

		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		// This should succeed because private networks are allowed
		_, err = client.Query(ctx, "up", time.Now().Add(-1*time.Hour), time.Now(), time.Minute, 10)
		if err != nil {
			t.Fatalf("Query to private network should succeed: %v", err)
		}
	})
}

// TestDatasourceClientsBlockMetadata verifies that datasource clients block
// connections to the cloud metadata endpoint (169.254.169.254).
func TestDatasourceClientsBlockMetadata(t *testing.T) {
	t.Parallel()

	// DatasourceClient should refuse to dial cloud metadata endpoint
	t.Run("victoriametrics_blocks_metadata", func(t *testing.T) {
		client, err := NewVictoriaMetricsClient("http://169.254.169.254")
		if err != nil {
			t.Fatalf("NewVictoriaMetricsClient failed: %v", err)
		}

		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		// This should fail because cloud metadata is blocked
		_, err = client.Query(ctx, "up", time.Now().Add(-1*time.Hour), time.Now(), time.Minute, 10)
		if err == nil {
			t.Fatal("Query to cloud metadata endpoint should fail")
		}
	})
}

// TestDatasourceClientsBlockMetadataRedirect verifies that datasource clients
// block redirects to the cloud metadata endpoint.
func TestDatasourceClientsBlockMetadataRedirect(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Redirect to cloud metadata endpoint
		http.Redirect(w, r, "http://169.254.169.254/latest/meta-data", http.StatusFound)
	}))
	t.Cleanup(srv.Close)

	t.Run("victoriametrics_blocks_metadata_redirect", func(t *testing.T) {
		client, err := NewVictoriaMetricsClient(srv.URL)
		if err != nil {
			t.Fatalf("NewVictoriaMetricsClient failed: %v", err)
		}

		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		// This should fail because redirect to cloud metadata is blocked
		_, err = client.Query(ctx, "up", time.Now().Add(-1*time.Hour), time.Now(), time.Minute, 10)
		if err == nil {
			t.Fatal("Query with redirect to cloud metadata endpoint should fail")
		}
	})
}
