package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/aceobservability/ace/backend/internal/sso"
)

func TestWriteSSOFinishError_mapsSentinels(t *testing.T) {
	tests := []struct {
		name   string
		err    error
		status int
	}{
		{"email unverified", sso.ErrEmailUnverified, http.StatusBadRequest},
		{"no email wrapped", fmt.Errorf("%w in user info", sso.ErrNoEmail), http.StatusBadRequest},
		{"org not found", sso.ErrOrgNotFound, http.StatusNotFound},
		{"id token", fmt.Errorf("%w", sso.ErrIDToken), http.StatusUnauthorized},
		{"not configured", fmt.Errorf("%s %w", sso.ProviderGoogle, sso.ErrNotConfigured), http.StatusBadRequest},
		{"not enabled", fmt.Errorf("%s %w", sso.ProviderOkta, sso.ErrNotEnabled), http.StatusBadRequest},
		{"other", errors.New("failed to exchange code for token"), http.StatusInternalServerError},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			writeSSOFinishError(w, tt.err)
			if w.Code != tt.status {
				t.Errorf("status %d, want %d body=%s", w.Code, tt.status, w.Body.String())
			}
			if ct := w.Header().Get("Content-Type"); ct != "application/json" {
				t.Errorf("Content-Type=%q", ct)
			}
			var body map[string]string
			if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
				t.Fatalf("json: %v body=%s", err, w.Body.String())
			}
			if body["error"] == "" {
				t.Fatal("missing error field")
			}
		})
	}
}

func TestWriteSSOStartError_generateStateSentinel(t *testing.T) {
	w := httptest.NewRecorder()
	writeSSOStartError(w, fmt.Errorf("%w", sso.ErrGenerateState))
	if w.Code != http.StatusInternalServerError {
		t.Errorf("status %d, want 500", w.Code)
	}
	var body map[string]string
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("json: %v", err)
	}
	if body["error"] != "failed to generate state" {
		t.Errorf("error=%q", body["error"])
	}

	w = httptest.NewRecorder()
	writeSSOStartError(w, fmt.Errorf("%s %w", sso.ProviderGoogle, sso.ErrNotConfigured))
	if w.Code != http.StatusBadRequest {
		t.Errorf("not configured status %d, want 400", w.Code)
	}
}
