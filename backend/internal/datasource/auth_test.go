package datasource

import (
	"net/http"
	"testing"

	"github.com/aceobservability/ace/backend/internal/models"
)

func TestApplyDataSourceAuth_Basic(t *testing.T) {
	ds := models.DataSource{
		AuthType:   "basic",
		AuthConfig: []byte(`{"username":"alice","password":"secret"}`),
	}

	req, err := http.NewRequest(http.MethodGet, "http://localhost", nil)
	if err != nil {
		t.Fatalf("failed to create request: %v", err)
	}

	if err := applyDataSourceAuth(req, ds); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	username, password, ok := req.BasicAuth()
	if !ok {
		t.Fatal("expected basic auth to be set")
	}
	if username != "alice" || password != "secret" {
		t.Fatalf("unexpected basic auth credentials: %s/%s", username, password)
	}
}

func TestApplyDataSourceAuth_Bearer(t *testing.T) {
	ds := models.DataSource{
		AuthType:   "bearer",
		AuthConfig: []byte(`{"token":"abc123"}`),
	}

	req, err := http.NewRequest(http.MethodGet, "http://localhost", nil)
	if err != nil {
		t.Fatalf("failed to create request: %v", err)
	}

	if err := applyDataSourceAuth(req, ds); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if req.Header.Get("Authorization") != "Bearer abc123" {
		t.Fatalf("unexpected authorization header: %s", req.Header.Get("Authorization"))
	}
}

func TestApplyDataSourceAuth_APIKey(t *testing.T) {
	ds := models.DataSource{
		AuthType:   "api_key",
		AuthConfig: []byte(`{"header":"X-Auth-Token","value":"token-1"}`),
	}

	req, err := http.NewRequest(http.MethodGet, "http://localhost", nil)
	if err != nil {
		t.Fatalf("failed to create request: %v", err)
	}

	if err := applyDataSourceAuth(req, ds); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if req.Header.Get("X-Auth-Token") != "token-1" {
		t.Fatalf("unexpected api key header value: %s", req.Header.Get("X-Auth-Token"))
	}
}

func TestApplyDataSourceAuth_None(t *testing.T) {
	ds := models.DataSource{AuthType: "none"}

	req, err := http.NewRequest(http.MethodGet, "http://localhost", nil)
	if err != nil {
		t.Fatalf("failed to create request: %v", err)
	}

	if err := applyDataSourceAuth(req, ds); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestApplyDataSourceAuth_InvalidType(t *testing.T) {
	ds := models.DataSource{AuthType: "digest"}

	req, err := http.NewRequest(http.MethodGet, "http://localhost", nil)
	if err != nil {
		t.Fatalf("failed to create request: %v", err)
	}

	if err := applyDataSourceAuth(req, ds); err == nil {
		t.Fatal("expected error for invalid auth type")
	}
}
