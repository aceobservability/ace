package handlers

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	"github.com/aceobservability/ace/backend/internal/auth"
)

func TestDashboardHandler_Export_InvalidFormat(t *testing.T) {
	handler := &DashboardHandler{pool: nil}
	userID := uuid.New()

	req := httptest.NewRequest(http.MethodGet, "/api/dashboards/123e4567-e89b-12d3-a456-426614174000/export?format=toml", nil)
	req.SetPathValue("id", "123e4567-e89b-12d3-a456-426614174000")
	req = req.WithContext(context.WithValue(req.Context(), auth.UserIDKey, userID))
	rr := httptest.NewRecorder()

	handler.Export(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, rr.Code)
	}
}

func TestDashboardHandler_Import_InvalidFormat(t *testing.T) {
	handler := &DashboardHandler{pool: nil}
	userID := uuid.New()

	req := httptest.NewRequest(http.MethodPost, "/api/orgs/123e4567-e89b-12d3-a456-426614174000/dashboards/import?format=toml", bytes.NewBufferString(`{}`))
	req.SetPathValue("orgId", "123e4567-e89b-12d3-a456-426614174000")
	req = req.WithContext(context.WithValue(req.Context(), auth.UserIDKey, userID))
	rr := httptest.NewRecorder()

	handler.Import(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, rr.Code)
	}
}
