package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPrometheusHandler_Query_MissingQuery(t *testing.T) {
	handler := NewPrometheusHandler("http://localhost:9090")

	req := httptest.NewRequest(http.MethodGet, "/api/datasources/prometheus/query", nil)
	w := httptest.NewRecorder()

	handler.Query(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, w.Code)
	}

	var response ErrorResponse
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if response.Status != "error" {
		t.Errorf("expected status 'error', got '%s'", response.Status)
	}

	if response.Error != "query parameter is required" {
		t.Errorf("expected error message 'query parameter is required', got '%s'", response.Error)
	}
}

func TestPrometheusHandler_Query_InvalidStartTimestamp(t *testing.T) {
	handler := NewPrometheusHandler("http://localhost:9090")

	req := httptest.NewRequest(http.MethodGet, "/api/datasources/prometheus/query?query=up&start=invalid", nil)
	w := httptest.NewRecorder()

	handler.Query(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, w.Code)
	}

	var response ErrorResponse
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if response.Error != "invalid start timestamp" {
		t.Errorf("expected error message 'invalid start timestamp', got '%s'", response.Error)
	}
}

func TestPrometheusHandler_Query_InvalidEndTimestamp(t *testing.T) {
	handler := NewPrometheusHandler("http://localhost:9090")

	req := httptest.NewRequest(http.MethodGet, "/api/datasources/prometheus/query?query=up&end=invalid", nil)
	w := httptest.NewRecorder()

	handler.Query(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, w.Code)
	}

	var response ErrorResponse
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if response.Error != "invalid end timestamp" {
		t.Errorf("expected error message 'invalid end timestamp', got '%s'", response.Error)
	}
}

func TestPrometheusHandler_Query_InvalidStep(t *testing.T) {
	handler := NewPrometheusHandler("http://localhost:9090")

	req := httptest.NewRequest(http.MethodGet, "/api/datasources/prometheus/query?query=up&step=invalid", nil)
	w := httptest.NewRecorder()

	handler.Query(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, w.Code)
	}

	var response ErrorResponse
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if response.Error != "invalid step value" {
		t.Errorf("expected error message 'invalid step value', got '%s'", response.Error)
	}
}

func TestNewPrometheusHandler(t *testing.T) {
	handler := NewPrometheusHandler("http://localhost:9090")

	if handler == nil {
		t.Fatal("expected handler to be non-nil")
		return
	}

	if handler.prometheusURL != "http://localhost:9090" {
		t.Errorf("expected prometheusURL 'http://localhost:9090', got '%s'", handler.prometheusURL)
	}
}
