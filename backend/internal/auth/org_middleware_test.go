package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
)

func TestRequireOrgMember_InvalidOrgID(t *testing.T) {
	handler := RequireOrgMember(nil, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/orgs/not-a-uuid/ai/providers", nil)
	// Simulate mux path value for "id"
	req.SetPathValue("id", "not-a-uuid")

	rr := httptest.NewRecorder()
	handler(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", rr.Code)
	}
}

func TestRequireOrgMember_MissingUserID(t *testing.T) {
	orgID := uuid.New()

	handler := RequireOrgMember(nil, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/orgs/"+orgID.String()+"/ai/providers", nil)
	req.SetPathValue("id", orgID.String())
	// Deliberately do NOT inject a user ID into context

	rr := httptest.NewRecorder()
	handler(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("expected status 401, got %d", rr.Code)
	}
}

func TestGetOrgID_PresentInContext(t *testing.T) {
	orgID := uuid.New()
	ctx := context.WithValue(context.Background(), orgIDContextKey{}, orgID)

	got, ok := GetOrgID(ctx)
	if !ok {
		t.Fatal("expected org ID to be present in context")
	}
	if got != orgID {
		t.Errorf("expected org ID %v, got %v", orgID, got)
	}
}

func TestGetOrgID_AbsentFromContext(t *testing.T) {
	_, ok := GetOrgID(context.Background())
	if ok {
		t.Error("expected org ID to be absent from empty context")
	}
}
