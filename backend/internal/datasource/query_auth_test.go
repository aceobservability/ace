package datasource

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/aceobservability/ace/backend/internal/models"
	"github.com/gorilla/websocket"
)

func bearerDS(typ models.DataSourceType, rawURL, token string) models.DataSource {
	return models.DataSource{
		Type:       typ,
		URL:        rawURL,
		AuthType:   "bearer",
		AuthConfig: []byte(`{"token":"` + token + `"}`),
	}
}

func requireBearer(t *testing.T, r *http.Request, token string) {
	t.Helper()
	want := "Bearer " + token
	if got := r.Header.Get("Authorization"); got != want {
		t.Fatalf("authorization header = %q, want %q", got, want)
	}
}

func TestQuerySendsStoredCredentials(t *testing.T) {
	t.Parallel()

	const token = "query-secret"

	tests := []struct {
		name    string
		typ     models.DataSourceType
		newFn   func(models.DataSource) (Client, error)
		query   string
		handler http.HandlerFunc
	}{
		{
			name:  "prometheus",
			typ:   models.DataSourcePrometheus,
			newFn: func(ds models.DataSource) (Client, error) { return NewPrometheusClient(ds) },
			query: "up",
			handler: func(w http.ResponseWriter, r *http.Request) {
				requireBearer(t, r, token)
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"status":"success","data":{"resultType":"matrix","result":[]}}`))
			},
		},
		{
			name:  "victoriametrics",
			typ:   models.DataSourceVictoriaMetrics,
			newFn: func(ds models.DataSource) (Client, error) { return NewVictoriaMetricsClient(ds) },
			query: "up",
			handler: func(w http.ResponseWriter, r *http.Request) {
				requireBearer(t, r, token)
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"status":"success","data":{"resultType":"matrix","result":[]}}`))
			},
		},
		{
			name:  "loki",
			typ:   models.DataSourceLoki,
			newFn: func(ds models.DataSource) (Client, error) { return NewLokiClient(ds) },
			query: `{job="ace"}`,
			handler: func(w http.ResponseWriter, r *http.Request) {
				requireBearer(t, r, token)
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"status":"success","data":{"resultType":"streams","result":[]}}`))
			},
		},
		{
			name:  "victorialogs",
			typ:   models.DataSourceVictoriaLogs,
			newFn: func(ds models.DataSource) (Client, error) { return NewVictoriaLogsClient(ds) },
			query: "*",
			handler: func(w http.ResponseWriter, r *http.Request) {
				requireBearer(t, r, token)
				w.WriteHeader(http.StatusOK)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			srv := httptest.NewServer(tt.handler)
			t.Cleanup(srv.Close)

			client, err := tt.newFn(bearerDS(tt.typ, srv.URL, token))
			if err != nil {
				t.Fatalf("constructor: %v", err)
			}

			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()

			if _, err := client.Query(ctx, tt.query, time.Now().Add(-time.Hour), time.Now(), time.Minute, 10); err != nil {
				t.Fatalf("query: %v", err)
			}
		})
	}
}

func TestLokiStreamSendsStoredCredentialsOnWebsocketHeaders(t *testing.T) {
	t.Parallel()

	const token = "stream-secret"
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}

	var (
		mu      sync.Mutex
		gotAuth string
	)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		gotAuth = r.Header.Get("Authorization")
		mu.Unlock()

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()

		payload, _ := json.Marshal(lokiTailResponse{
			Streams: []struct {
				Stream map[string]string `json:"stream"`
				Values [][]string        `json:"values"`
			}{
				{
					Stream: map[string]string{"job": "ace"},
					Values: [][]string{{"1700000000000000000", "hello"}},
				},
			},
		})
		_ = conn.WriteMessage(websocket.TextMessage, payload)
		_ = conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
	}))
	t.Cleanup(srv.Close)

	client, err := NewLokiClient(bearerDS(models.DataSourceLoki, srv.URL, token))
	if err != nil {
		t.Fatalf("NewLokiClient: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	err = client.Stream(ctx, `{job="ace"}`, time.Time{}, 1, func(LogEntry) error {
		cancel()
		return context.Canceled
	})
	if err != nil && err != context.Canceled && ctx.Err() == nil {
		t.Fatalf("stream: %v", err)
	}

	mu.Lock()
	defer mu.Unlock()
	if gotAuth != "Bearer "+token {
		t.Fatalf("websocket authorization header = %q, want Bearer %s", gotAuth, token)
	}
}

func TestTestConnectionUsesNewClientAuth(t *testing.T) {
	t.Parallel()

	const token = "test-conn-secret"
	var sawAuth bool

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+token {
			t.Errorf("authorization header = %q, want Bearer %s", r.Header.Get("Authorization"), token)
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		sawAuth = true
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, "OK")
	}))
	t.Cleanup(srv.Close)

	ds := bearerDS(models.DataSourcePrometheus, srv.URL, token)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := TestConnection(ctx, ds); err != nil {
		t.Fatalf("TestConnection: %v", err)
	}
	if !sawAuth {
		t.Fatal("expected Test Connection to send stored credentials")
	}
}

func TestLokiLabelsSendsStoredCredentials(t *testing.T) {
	t.Parallel()

	const token = "labels-secret"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requireBearer(t, r, token)
		if !strings.Contains(r.URL.Path, "/loki/api/v1/labels") {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"success","data":["job","level"]}`))
	}))
	t.Cleanup(srv.Close)

	client, err := NewLokiClient(bearerDS(models.DataSourceLoki, srv.URL, token))
	if err != nil {
		t.Fatalf("NewLokiClient: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	labels, err := client.Labels(ctx)
	if err != nil {
		t.Fatalf("Labels: %v", err)
	}
	if len(labels) != 2 {
		t.Fatalf("expected 2 labels, got %d", len(labels))
	}
}
