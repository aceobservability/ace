package prometheus

import (
	"net/http"
	"strings"
	"testing"
)

func TestNewClient_requiresHTTPClient(t *testing.T) {
	t.Parallel()

	client, err := NewClient("http://localhost:9090", nil)
	if err == nil {
		t.Fatal("expected error for nil http client")
	}
	if client != nil {
		t.Fatal("expected nil client when http client is missing")
	}
	if !strings.Contains(err.Error(), "http client is required") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestNewClient_acceptsHTTPClient(t *testing.T) {
	t.Parallel()

	client, err := NewClient("http://localhost:9090", http.DefaultClient)
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	if client == nil {
		t.Fatal("client is nil")
	}
}
