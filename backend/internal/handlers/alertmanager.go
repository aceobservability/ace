package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/aceobservability/ace/backend/internal/auth"
	"github.com/aceobservability/ace/backend/internal/datasource"
	"github.com/aceobservability/ace/backend/internal/models"
)

// AlertManagerHandler proxies requests to an AlertManager datasource.
type AlertManagerHandler struct {
	pool *pgxpool.Pool
}

// NewAlertManagerHandler creates a new AlertManagerHandler.
func NewAlertManagerHandler(pool *pgxpool.Pool) *AlertManagerHandler {
	return &AlertManagerHandler{pool: pool}
}

// resolveAlertManagerDatasource loads the datasource, verifies membership and type.
func (h *AlertManagerHandler) resolveAlertManagerDatasource(w http.ResponseWriter, r *http.Request) (*models.DataSource, bool) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return nil, false
	}

	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid datasource id"}`, http.StatusBadRequest)
		return nil, false
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	var ds models.DataSource
	err = h.pool.QueryRow(ctx,
		`SELECT id, organization_id, name, type, url, is_default, auth_type, auth_config, created_at, updated_at
		 FROM datasources WHERE id = $1`, id,
	).Scan(&ds.ID, &ds.OrganizationID, &ds.Name, &ds.Type, &ds.URL, &ds.IsDefault, &ds.AuthType, &ds.AuthConfig, &ds.CreatedAt, &ds.UpdatedAt)
	if err != nil {
		http.Error(w, `{"error":"datasource not found"}`, http.StatusNotFound)
		return nil, false
	}

	var role string
	err = h.pool.QueryRow(ctx,
		`SELECT role FROM organization_memberships WHERE user_id = $1 AND organization_id = $2`,
		userID, ds.OrganizationID,
	).Scan(&role)
	if err != nil {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return nil, false
	}

	if ds.Type != models.DataSourceAlertManager {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "datasource is not of type alertmanager"})
		return nil, false
	}

	return &ds, true
}

// ListAlerts proxies GET /api/datasources/{id}/alertmanager/alerts to AlertManager.
func (h *AlertManagerHandler) ListAlerts(w http.ResponseWriter, r *http.Request) {
	ds, ok := h.resolveAlertManagerDatasource(w, r)
	if !ok {
		return
	}

	client, err := datasource.NewAlertManagerClient(*ds)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create alertmanager client: " + err.Error()})
		return
	}

	active := r.URL.Query().Get("active") != "false"
	silenced := r.URL.Query().Get("silenced") != "false"
	inhibited := r.URL.Query().Get("inhibited") != "false"

	result, err := client.GetAlerts(r.Context(), active, silenced, inhibited)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to fetch alerts: " + err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// ListSilences proxies GET /api/datasources/{id}/alertmanager/silences to AlertManager.
func (h *AlertManagerHandler) ListSilences(w http.ResponseWriter, r *http.Request) {
	ds, ok := h.resolveAlertManagerDatasource(w, r)
	if !ok {
		return
	}

	client, err := datasource.NewAlertManagerClient(*ds)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create alertmanager client: " + err.Error()})
		return
	}

	result, err := client.GetSilences(r.Context())
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to fetch silences: " + err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// CreateSilence proxies POST /api/datasources/{id}/alertmanager/silences to AlertManager.
func (h *AlertManagerHandler) CreateSilence(w http.ResponseWriter, r *http.Request) {
	ds, ok := h.resolveAlertManagerDatasource(w, r)
	if !ok {
		return
	}

	userID, _ := auth.GetUserID(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	var role string
	err := h.pool.QueryRow(ctx,
		`SELECT role FROM organization_memberships WHERE user_id = $1 AND organization_id = $2`,
		userID, ds.OrganizationID,
	).Scan(&role)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to check membership"})
		return
	}
	if role == "auditor" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "auditors cannot modify alertmanager"})
		return
	}

	client, err := datasource.NewAlertManagerClient(*ds)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create alertmanager client: " + err.Error()})
		return
	}

	var silence datasource.AMSilenceCreate
	if err := json.NewDecoder(r.Body).Decode(&silence); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "invalid request body"})
		return
	}

	silenceID, err := client.CreateSilence(r.Context(), silence)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create silence: " + err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		SilenceID string `json:"silenceID"`
	}{
		SilenceID: silenceID,
	})
}

// ExpireSilence proxies DELETE /api/datasources/{id}/alertmanager/silences/{silenceId} to AlertManager.
func (h *AlertManagerHandler) ExpireSilence(w http.ResponseWriter, r *http.Request) {
	ds, ok := h.resolveAlertManagerDatasource(w, r)
	if !ok {
		return
	}

	userID, _ := auth.GetUserID(r.Context())
	ctx2, cancel2 := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel2()
	var role string
	err := h.pool.QueryRow(ctx2,
		`SELECT role FROM organization_memberships WHERE user_id = $1 AND organization_id = $2`,
		userID, ds.OrganizationID,
	).Scan(&role)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to check membership"})
		return
	}
	if role == "auditor" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "auditors cannot modify alertmanager"})
		return
	}

	silenceID := r.PathValue("silenceId")
	if silenceID == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "silence id is required"})
		return
	}

	client, err := datasource.NewAlertManagerClient(*ds)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create alertmanager client: " + err.Error()})
		return
	}

	if err := client.ExpireSilence(r.Context(), silenceID); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to expire silence: " + err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		Status string `json:"status"`
	}{
		Status: "success",
	})
}

// ListReceivers proxies GET /api/datasources/{id}/alertmanager/receivers to AlertManager.
func (h *AlertManagerHandler) ListReceivers(w http.ResponseWriter, r *http.Request) {
	ds, ok := h.resolveAlertManagerDatasource(w, r)
	if !ok {
		return
	}

	client, err := datasource.NewAlertManagerClient(*ds)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create alertmanager client: " + err.Error()})
		return
	}

	result, err := client.GetReceivers(r.Context())
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to fetch receivers: " + err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// Health proxies GET /api/datasources/{id}/alertmanager/health to AlertManager.
func (h *AlertManagerHandler) Health(w http.ResponseWriter, r *http.Request) {
	ds, ok := h.resolveAlertManagerDatasource(w, r)
	if !ok {
		return
	}

	client, err := datasource.NewAlertManagerClient(*ds)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create alertmanager client: " + err.Error()})
		return
	}

	if _, err := client.GetStatus(r.Context()); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "alertmanager health check failed: " + err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		Status string `json:"status"`
	}{
		Status: "success",
	})
}
