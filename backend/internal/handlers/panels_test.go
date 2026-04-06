package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/aceobservability/ace/backend/internal/models"
)

func TestPanelHandler_Create_InvalidDashboardID(t *testing.T) {
	handler := &PanelHandler{pool: nil}

	body := bytes.NewBufferString(`{"title":"Test Panel","grid_pos":{"x":0,"y":0,"w":6,"h":4}}`)
	req := httptest.NewRequest(http.MethodPost, "/api/dashboards/invalid-uuid/panels", body)
	req.SetPathValue("id", "invalid-uuid")
	rr := httptest.NewRecorder()

	handler.Create(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, rr.Code)
	}
}

func TestPanelHandler_Create_InvalidJSON(t *testing.T) {
	handler := &PanelHandler{pool: nil}

	body := bytes.NewBufferString(`{invalid}`)
	req := httptest.NewRequest(http.MethodPost, "/api/dashboards/123e4567-e89b-12d3-a456-426614174000/panels", body)
	req.SetPathValue("id", "123e4567-e89b-12d3-a456-426614174000")
	rr := httptest.NewRecorder()

	handler.Create(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, rr.Code)
	}
}

func TestPanelHandler_Create_MissingTitle(t *testing.T) {
	handler := &PanelHandler{pool: nil}

	body := bytes.NewBufferString(`{"grid_pos":{"x":0,"y":0,"w":6,"h":4}}`)
	req := httptest.NewRequest(http.MethodPost, "/api/dashboards/123e4567-e89b-12d3-a456-426614174000/panels", body)
	req.SetPathValue("id", "123e4567-e89b-12d3-a456-426614174000")
	rr := httptest.NewRecorder()

	handler.Create(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, rr.Code)
	}
}

func TestPanelHandler_ListByDashboard_InvalidDashboardID(t *testing.T) {
	handler := &PanelHandler{pool: nil}

	req := httptest.NewRequest(http.MethodGet, "/api/dashboards/invalid-uuid/panels", nil)
	req.SetPathValue("id", "invalid-uuid")
	rr := httptest.NewRecorder()

	handler.ListByDashboard(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, rr.Code)
	}
}

func TestPanelHandler_Update_InvalidPanelID(t *testing.T) {
	handler := &PanelHandler{pool: nil}

	body := bytes.NewBufferString(`{"title":"Updated Panel"}`)
	req := httptest.NewRequest(http.MethodPut, "/api/panels/invalid-uuid", body)
	req.SetPathValue("id", "invalid-uuid")
	rr := httptest.NewRecorder()

	handler.Update(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, rr.Code)
	}
}

func TestPanelHandler_Update_InvalidJSON(t *testing.T) {
	handler := &PanelHandler{pool: nil}

	body := bytes.NewBufferString(`{invalid}`)
	req := httptest.NewRequest(http.MethodPut, "/api/panels/123e4567-e89b-12d3-a456-426614174000", body)
	req.SetPathValue("id", "123e4567-e89b-12d3-a456-426614174000")
	rr := httptest.NewRecorder()

	handler.Update(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, rr.Code)
	}
}

func TestPanelHandler_Delete_InvalidPanelID(t *testing.T) {
	handler := &PanelHandler{pool: nil}

	req := httptest.NewRequest(http.MethodDelete, "/api/panels/invalid-uuid", nil)
	req.SetPathValue("id", "invalid-uuid")
	rr := httptest.NewRecorder()

	handler.Delete(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, rr.Code)
	}
}

func TestGridPos_JSON(t *testing.T) {
	gridPos := models.GridPos{
		X: 0,
		Y: 0,
		W: 6,
		H: 4,
	}

	data, err := json.Marshal(gridPos)
	if err != nil {
		t.Fatalf("failed to marshal grid_pos: %v", err)
	}

	var decoded models.GridPos
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("failed to unmarshal grid_pos: %v", err)
	}

	if decoded.X != gridPos.X || decoded.Y != gridPos.Y || decoded.W != gridPos.W || decoded.H != gridPos.H {
		t.Errorf("expected grid_pos %+v, got %+v", gridPos, decoded)
	}
}

func TestCreatePanelRequest_JSON(t *testing.T) {
	panelType := "bar_chart"
	req := models.CreatePanelRequest{
		Title:   "Test Panel",
		Type:    &panelType,
		GridPos: models.GridPos{X: 0, Y: 0, W: 6, H: 4},
		Query:   []byte(`{"promql":"up"}`),
	}

	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("failed to marshal request: %v", err)
	}

	var decoded models.CreatePanelRequest
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("failed to unmarshal request: %v", err)
	}

	if decoded.Title != req.Title {
		t.Errorf("expected title %s, got %s", req.Title, decoded.Title)
	}

	if decoded.Type == nil || *decoded.Type != *req.Type {
		t.Errorf("expected type %v, got %v", req.Type, decoded.Type)
	}
}

func TestUpdatePanelRequest_JSON(t *testing.T) {
	title := "Updated Panel"
	panelType := "gauge"
	gridPos := models.GridPos{X: 2, Y: 2, W: 4, H: 3}
	req := models.UpdatePanelRequest{
		Title:   &title,
		Type:    &panelType,
		GridPos: &gridPos,
	}

	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("failed to marshal request: %v", err)
	}

	var decoded models.UpdatePanelRequest
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("failed to unmarshal request: %v", err)
	}

	if decoded.Title == nil || *decoded.Title != *req.Title {
		t.Errorf("expected title %v, got %v", req.Title, decoded.Title)
	}

	if decoded.Type == nil || *decoded.Type != *req.Type {
		t.Errorf("expected type %v, got %v", req.Type, decoded.Type)
	}

	if decoded.GridPos == nil || *decoded.GridPos != *req.GridPos {
		t.Errorf("expected grid_pos %v, got %v", req.GridPos, decoded.GridPos)
	}
}
