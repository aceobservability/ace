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

// VMAlertHandler proxies requests to a VMAlert datasource.
type VMAlertHandler struct {
	pool *pgxpool.Pool
}

// NewVMAlertHandler creates a new VMAlertHandler.
func NewVMAlertHandler(pool *pgxpool.Pool) *VMAlertHandler {
	return &VMAlertHandler{pool: pool}
}

// resolveVMAlertDatasource loads the datasource, verifies membership and type.
func (h *VMAlertHandler) resolveVMAlertDatasource(w http.ResponseWriter, r *http.Request) (*models.DataSource, bool) {
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

	if ds.Type != models.DataSourceVMAlert {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "datasource is not of type vmalert"})
		return nil, false
	}

	return &ds, true
}

// Alerts proxies GET /api/datasources/{id}/vmalert/alerts to VMAlert.
func (h *VMAlertHandler) Alerts(w http.ResponseWriter, r *http.Request) {
	ds, ok := h.resolveVMAlertDatasource(w, r)
	if !ok {
		return
	}

	client, err := datasource.NewVMAlertClient(*ds)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create vmalert client: " + err.Error()})
		return
	}

	result, err := client.GetAlerts(r.Context())
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to fetch alerts: " + err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// Groups proxies GET /api/datasources/{id}/vmalert/groups to VMAlert.
func (h *VMAlertHandler) Groups(w http.ResponseWriter, r *http.Request) {
	ds, ok := h.resolveVMAlertDatasource(w, r)
	if !ok {
		return
	}

	client, err := datasource.NewVMAlertClient(*ds)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create vmalert client: " + err.Error()})
		return
	}

	result, err := client.GetGroups(r.Context())
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to fetch rule groups: " + err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// Rules proxies GET /api/datasources/{id}/vmalert/rules to VMAlert.
func (h *VMAlertHandler) Rules(w http.ResponseWriter, r *http.Request) {
	ds, ok := h.resolveVMAlertDatasource(w, r)
	if !ok {
		return
	}

	client, err := datasource.NewVMAlertClient(*ds)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create vmalert client: " + err.Error()})
		return
	}

	result, err := client.GetRules(r.Context())
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to fetch rules: " + err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// Health proxies GET /api/datasources/{id}/vmalert/health to VMAlert.
func (h *VMAlertHandler) Health(w http.ResponseWriter, r *http.Request) {
	ds, ok := h.resolveVMAlertDatasource(w, r)
	if !ok {
		return
	}

	client, err := datasource.NewVMAlertClient(*ds)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create vmalert client: " + err.Error()})
		return
	}

	if err := client.Health(r.Context()); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "vmalert health check failed: " + err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		Status string `json:"status"`
	}{
		Status: "success",
	})
}
