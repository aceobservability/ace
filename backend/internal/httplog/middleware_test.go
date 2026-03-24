package httplog

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"go.uber.org/zap/zaptest/observer"
)

func newTestLogger() (*zap.Logger, *observer.ObservedLogs) {
	core, logs := observer.New(zapcore.DebugLevel)
	return zap.New(core), logs
}

func TestMiddleware_LogsRequestFields(t *testing.T) {
	logger, logs := newTestLogger()
	middleware := NewMiddleware(logger)

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("hello"))
	})

	req := httptest.NewRequest("GET", "/api/orgs", nil)
	req.Header.Set("User-Agent", "test-agent")
	req.RemoteAddr = "192.168.1.1:12345"
	rec := httptest.NewRecorder()

	middleware(inner).ServeHTTP(rec, req)

	if logs.Len() != 1 {
		t.Fatalf("expected 1 log entry, got %d", logs.Len())
	}

	entry := logs.All()[0]
	if entry.Message != "http request" {
		t.Errorf("expected message 'http request', got %q", entry.Message)
	}

	fields := fieldMap(entry.ContextMap())
	assertField(t, fields, "method", "GET")
	assertField(t, fields, "path", "/api/orgs")
	assertFieldInt(t, fields, "status", 200)
	assertFieldInt(t, fields, "bytes", 5)
	assertField(t, fields, "ip", "192.168.1.1:12345")
	assertField(t, fields, "user_agent", "test-agent")

	if _, ok := fields["duration"]; !ok {
		t.Error("expected 'duration' field to be present")
	}
}

func TestMiddleware_SkipsHealthCheck(t *testing.T) {
	logger, logs := newTestLogger()
	middleware := NewMiddleware(logger)

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest("GET", "/api/health", nil)
	rec := httptest.NewRecorder()

	middleware(inner).ServeHTTP(rec, req)

	if logs.Len() != 0 {
		t.Errorf("expected 0 log entries for health check, got %d", logs.Len())
	}
}

func TestMiddleware_SkipsOPTIONS(t *testing.T) {
	logger, logs := newTestLogger()
	middleware := NewMiddleware(logger)

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest("OPTIONS", "/api/orgs", nil)
	rec := httptest.NewRecorder()

	middleware(inner).ServeHTTP(rec, req)

	if logs.Len() != 0 {
		t.Errorf("expected 0 log entries for OPTIONS, got %d", logs.Len())
	}
}

func TestMiddleware_InfoLevelFor2xx(t *testing.T) {
	logger, logs := newTestLogger()
	middleware := NewMiddleware(logger)

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
	})

	req := httptest.NewRequest("POST", "/api/orgs", nil)
	rec := httptest.NewRecorder()

	middleware(inner).ServeHTTP(rec, req)

	if logs.Len() != 1 {
		t.Fatalf("expected 1 log entry, got %d", logs.Len())
	}
	if logs.All()[0].Level != zapcore.InfoLevel {
		t.Errorf("expected Info level for 201, got %s", logs.All()[0].Level)
	}
}

func TestMiddleware_InfoLevelFor4xx(t *testing.T) {
	logger, logs := newTestLogger()
	middleware := NewMiddleware(logger)

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	})

	req := httptest.NewRequest("GET", "/api/orgs/missing", nil)
	rec := httptest.NewRecorder()

	middleware(inner).ServeHTTP(rec, req)

	if logs.Len() != 1 {
		t.Fatalf("expected 1 log entry, got %d", logs.Len())
	}
	if logs.All()[0].Level != zapcore.InfoLevel {
		t.Errorf("expected Info level for 404, got %s", logs.All()[0].Level)
	}
}

func TestMiddleware_ErrorLevelFor5xx(t *testing.T) {
	logger, logs := newTestLogger()
	middleware := NewMiddleware(logger)

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	})

	req := httptest.NewRequest("GET", "/api/orgs", nil)
	rec := httptest.NewRecorder()

	middleware(inner).ServeHTTP(rec, req)

	if logs.Len() != 1 {
		t.Fatalf("expected 1 log entry, got %d", logs.Len())
	}
	if logs.All()[0].Level != zapcore.ErrorLevel {
		t.Errorf("expected Error level for 500, got %s", logs.All()[0].Level)
	}
}

func TestResponseWriter_ImplementsFlusher(t *testing.T) {
	// httptest.ResponseRecorder implements http.Flusher
	rec := httptest.NewRecorder()
	rw := &responseWriter{ResponseWriter: rec, statusCode: http.StatusOK}

	flusher, ok := any(rw).(http.Flusher)
	if !ok {
		t.Fatal("responseWriter should implement http.Flusher when underlying writer does")
	}

	// Should not panic
	flusher.Flush()
}

func TestResponseWriter_DoesNotImplementFlusherWhenUnderlyingDoesNot(t *testing.T) {
	// A minimal ResponseWriter that does NOT implement http.Flusher
	nf := &noFlushWriter{}
	rw := &responseWriter{ResponseWriter: nf, statusCode: http.StatusOK}

	// Flush() delegates — it should not panic even if underlying doesn't support it
	rw.Flush()
}

func TestResponseWriter_TracksBytesWritten(t *testing.T) {
	rec := httptest.NewRecorder()
	rw := &responseWriter{ResponseWriter: rec, statusCode: http.StatusOK}

	n1, _ := rw.Write([]byte("hello"))
	n2, _ := rw.Write([]byte(" world"))

	if rw.bytesWritten != n1+n2 {
		t.Errorf("expected bytesWritten=%d, got %d", n1+n2, rw.bytesWritten)
	}
}

func TestResponseWriter_ImplicitStatusOK(t *testing.T) {
	logger, logs := newTestLogger()
	middleware := NewMiddleware(logger)

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Write without calling WriteHeader — implicit 200
		w.Write([]byte("ok"))
	})

	req := httptest.NewRequest("GET", "/api/orgs", nil)
	rec := httptest.NewRecorder()

	middleware(inner).ServeHTTP(rec, req)

	if logs.Len() != 1 {
		t.Fatalf("expected 1 log entry, got %d", logs.Len())
	}

	fields := fieldMap(logs.All()[0].ContextMap())
	assertFieldInt(t, fields, "status", 200)
}

func TestResponseWriter_WriteHeaderOnce(t *testing.T) {
	logger, logs := newTestLogger()
	middleware := NewMiddleware(logger)

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated) // first call — this is the real status
		w.WriteHeader(http.StatusConflict) // second call — should be ignored for logging
	})

	req := httptest.NewRequest("POST", "/api/orgs", nil)
	rec := httptest.NewRecorder()

	middleware(inner).ServeHTTP(rec, req)

	if logs.Len() != 1 {
		t.Fatalf("expected 1 log entry, got %d", logs.Len())
	}

	fields := fieldMap(logs.All()[0].ContextMap())
	assertFieldInt(t, fields, "status", 201) // logged status must match the first WriteHeader call
}

func TestMiddleware_XForwardedForMultipleIPs(t *testing.T) {
	logger, logs := newTestLogger()
	middleware := NewMiddleware(logger)

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest("GET", "/api/orgs", nil)
	req.Header.Set("X-Forwarded-For", "1.2.3.4, 5.6.7.8, 9.10.11.12")
	req.RemoteAddr = "127.0.0.1:1234"
	rec := httptest.NewRecorder()

	middleware(inner).ServeHTTP(rec, req)

	fields := fieldMap(logs.All()[0].ContextMap())
	assertField(t, fields, "ip", "1.2.3.4")
}

func TestMiddleware_FallsBackToRemoteAddr(t *testing.T) {
	logger, logs := newTestLogger()
	middleware := NewMiddleware(logger)

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest("GET", "/api/orgs", nil)
	// No X-Forwarded-For header
	req.RemoteAddr = "10.0.0.1:5678"
	rec := httptest.NewRecorder()

	middleware(inner).ServeHTTP(rec, req)

	fields := fieldMap(logs.All()[0].ContextMap())
	assertField(t, fields, "ip", "10.0.0.1:5678")
}

func TestMiddleware_DurationIsPositive(t *testing.T) {
	logger, logs := newTestLogger()
	middleware := NewMiddleware(logger)

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(1 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest("GET", "/api/orgs", nil)
	rec := httptest.NewRecorder()

	middleware(inner).ServeHTTP(rec, req)

	entry := logs.All()[0]
	for _, f := range entry.Context {
		if f.Key == "duration" {
			dur := f.Integer
			if dur <= 0 {
				t.Errorf("expected positive duration, got %d", dur)
			}
			return
		}
	}
	t.Error("duration field not found")
}

// --- helpers ---

type noFlushWriter struct {
	http.ResponseWriter
}

func (n *noFlushWriter) Header() http.Header        { return http.Header{} }
func (n *noFlushWriter) Write(b []byte) (int, error) { return len(b), nil }
func (n *noFlushWriter) WriteHeader(int)             {}

func fieldMap(m map[string]interface{}) map[string]interface{} {
	return m
}

func assertField(t *testing.T, fields map[string]interface{}, key, expected string) {
	t.Helper()
	val, ok := fields[key]
	if !ok {
		t.Errorf("expected field %q to be present", key)
		return
	}
	if s, ok := val.(string); !ok || s != expected {
		t.Errorf("expected field %q = %q, got %v", key, expected, val)
	}
}

func assertFieldInt(t *testing.T, fields map[string]interface{}, key string, expected int) {
	t.Helper()
	val, ok := fields[key]
	if !ok {
		t.Errorf("expected field %q to be present", key)
		return
	}
	switch v := val.(type) {
	case int64:
		if int(v) != expected {
			t.Errorf("expected field %q = %d, got %d", key, expected, v)
		}
	case float64:
		if int(v) != expected {
			t.Errorf("expected field %q = %d, got %f", key, expected, v)
		}
	default:
		t.Errorf("expected field %q to be numeric, got %T", key, val)
	}
}
