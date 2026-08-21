package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestResolveListenAddr(t *testing.T) {
	tests := []struct {
		name string
		env  map[string]string
		want string
	}{
		{
			name: "defaults to :8080 when unset",
			env:  map[string]string{},
			want: ":8080",
		},
		{
			name: "defaults to :8080 when empty",
			env:  map[string]string{"ACE_LISTEN_ADDR": ""},
			want: ":8080",
		},
		{
			name: "uses ACE_LISTEN_ADDR when set",
			env:  map[string]string{"ACE_LISTEN_ADDR": "127.0.0.1:9090"},
			want: "127.0.0.1:9090",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			getenv := func(key string) string { return tt.env[key] }
			if got := resolveListenAddr(getenv); got != tt.want {
				t.Errorf("resolveListenAddr() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestCorsMiddlewareAllowsMCPHeaders(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	h := corsMiddleware(inner)

	req := httptest.NewRequest(http.MethodOptions, "/mcp", nil)
	req.Header.Set("Access-Control-Request-Method", "POST")
	req.Header.Set("Access-Control-Request-Headers", "authorization,mcp-protocol-version,mcp-session-id,last-event-id,accept,content-type")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("OPTIONS /mcp status = %d, want 200", rec.Code)
	}
	allow := rec.Header().Get("Access-Control-Allow-Headers")
	for _, want := range []string{"Authorization", "Accept", "MCP-Protocol-Version", "Mcp-Session-Id", "Last-Event-ID"} {
		if !strings.Contains(allow, want) {
			t.Errorf("Allow-Headers %q missing %s", allow, want)
		}
	}
	expose := rec.Header().Get("Access-Control-Expose-Headers")
	if !strings.Contains(expose, "Mcp-Session-Id") {
		t.Errorf("Expose-Headers %q missing Mcp-Session-Id", expose)
	}
}
