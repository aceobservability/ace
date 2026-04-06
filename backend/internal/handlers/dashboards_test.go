package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/aceobservability/ace/backend/internal/models"
)

func TestDashboardHandler_Create_MissingTitle(t *testing.T) {
	handler := &DashboardHandler{pool: nil}

	body := bytes.NewBufferString(`{}`)
	req := httptest.NewRequest(http.MethodPost, "/api/dashboards", body)
	rr := httptest.NewRecorder()

	handler.Create(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, rr.Code)
	}
}

func TestDashboardHandler_Create_InvalidJSON(t *testing.T) {
	handler := &DashboardHandler{pool: nil}

	body := bytes.NewBufferString(`{invalid}`)
	req := httptest.NewRequest(http.MethodPost, "/api/dashboards", body)
	rr := httptest.NewRecorder()

	handler.Create(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, rr.Code)
	}
}

func TestDashboardHandler_Get_InvalidUUID(t *testing.T) {
	handler := &DashboardHandler{pool: nil}

	req := httptest.NewRequest(http.MethodGet, "/api/dashboards/invalid-uuid", nil)
	req.SetPathValue("id", "invalid-uuid")
	rr := httptest.NewRecorder()

	handler.Get(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, rr.Code)
	}
}

func TestDashboardHandler_Update_InvalidUUID(t *testing.T) {
	handler := &DashboardHandler{pool: nil}

	body := bytes.NewBufferString(`{"title":"test"}`)
	req := httptest.NewRequest(http.MethodPut, "/api/dashboards/invalid-uuid", body)
	req.SetPathValue("id", "invalid-uuid")
	rr := httptest.NewRecorder()

	handler.Update(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, rr.Code)
	}
}

func TestDashboardHandler_Update_InvalidJSON(t *testing.T) {
	handler := &DashboardHandler{pool: nil}

	body := bytes.NewBufferString(`{invalid}`)
	req := httptest.NewRequest(http.MethodPut, "/api/dashboards/123e4567-e89b-12d3-a456-426614174000", body)
	req.SetPathValue("id", "123e4567-e89b-12d3-a456-426614174000")
	rr := httptest.NewRecorder()

	handler.Update(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, rr.Code)
	}
}

func TestDashboardHandler_Delete_InvalidUUID(t *testing.T) {
	handler := &DashboardHandler{pool: nil}

	req := httptest.NewRequest(http.MethodDelete, "/api/dashboards/invalid-uuid", nil)
	req.SetPathValue("id", "invalid-uuid")
	rr := httptest.NewRecorder()

	handler.Delete(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, rr.Code)
	}
}

func TestCreateDashboardRequest_JSON(t *testing.T) {
	desc := "Test description"
	req := models.CreateDashboardRequest{
		Title:       "Test Dashboard",
		Description: &desc,
	}

	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("failed to marshal request: %v", err)
	}

	var decoded models.CreateDashboardRequest
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("failed to unmarshal request: %v", err)
	}

	if decoded.Title != req.Title {
		t.Errorf("expected title %s, got %s", req.Title, decoded.Title)
	}

	if decoded.Description == nil || *decoded.Description != *req.Description {
		t.Errorf("expected description %v, got %v", req.Description, decoded.Description)
	}
}

func TestUpdateDashboardRequest_JSON(t *testing.T) {
	title := "Updated Title"
	req := models.UpdateDashboardRequest{
		Title: &title,
	}

	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("failed to marshal request: %v", err)
	}

	var decoded models.UpdateDashboardRequest
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("failed to unmarshal request: %v", err)
	}

	if decoded.Title == nil || *decoded.Title != *req.Title {
		t.Errorf("expected title %v, got %v", req.Title, decoded.Title)
	}
}

func TestUpdateDashboardRequest_FolderIDPresent(t *testing.T) {
	folderID := uuid.New()
	body := []byte(`{"folder_id":"` + folderID.String() + `"}`)

	var decoded models.UpdateDashboardRequest
	if err := json.Unmarshal(body, &decoded); err != nil {
		t.Fatalf("failed to unmarshal request: %v", err)
	}

	if !decoded.FolderIDSet {
		t.Fatal("expected FolderIDSet to be true")
	}

	if decoded.FolderID == nil || *decoded.FolderID != folderID {
		t.Fatalf("expected folder id %s, got %v", folderID, decoded.FolderID)
	}
}

func TestUpdateDashboardRequest_FolderIDNull(t *testing.T) {
	body := []byte(`{"folder_id":null}`)

	var decoded models.UpdateDashboardRequest
	if err := json.Unmarshal(body, &decoded); err != nil {
		t.Fatalf("failed to unmarshal request: %v", err)
	}

	if !decoded.FolderIDSet {
		t.Fatal("expected FolderIDSet to be true")
	}

	if decoded.FolderID != nil {
		t.Fatalf("expected folder id to be nil, got %v", decoded.FolderID)
	}
}
