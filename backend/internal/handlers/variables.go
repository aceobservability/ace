package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/aceobservability/ace/backend/internal/auth"
	"github.com/aceobservability/ace/backend/internal/models"
)

type VariableHandler struct {
	pool *pgxpool.Pool
}

func NewVariableHandler(pool *pgxpool.Pool) *VariableHandler {
	return &VariableHandler{pool: pool}
}

func (h *VariableHandler) checkDashboardAccess(ctx context.Context, userID, dashboardID uuid.UUID) error {
	var orgID *uuid.UUID
	err := h.pool.QueryRow(ctx,
		`SELECT organization_id FROM dashboards WHERE id = $1`, dashboardID,
	).Scan(&orgID)
	if err != nil {
		return err
	}
	if orgID != nil {
		var role string
		err = h.pool.QueryRow(ctx,
			`SELECT role FROM organization_memberships WHERE user_id = $1 AND organization_id = $2`,
			userID, *orgID,
		).Scan(&role)
		if err != nil {
			return err
		}
	}
	return nil
}

// List returns all template variables for a dashboard.
func (h *VariableHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	dashboardID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid dashboard id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if err := h.checkDashboardAccess(ctx, userID, dashboardID); err != nil {
		http.Error(w, `{"error":"dashboard not found or access denied"}`, http.StatusNotFound)
		return
	}

	rows, err := h.pool.Query(ctx,
		`SELECT id, dashboard_id, name, type, label, query, multi, include_all, sort_order, created_at, updated_at
		 FROM dashboard_variables
		 WHERE dashboard_id = $1
		 ORDER BY sort_order, name`, dashboardID)
	if err != nil {
		http.Error(w, `{"error":"failed to fetch variables"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	variables := []models.Variable{}
	for rows.Next() {
		var v models.Variable
		if err := rows.Scan(&v.ID, &v.DashboardID, &v.Name, &v.Type, &v.Label, &v.Query, &v.Multi, &v.IncludeAll, &v.SortOrder, &v.CreatedAt, &v.UpdatedAt); err != nil {
			http.Error(w, `{"error":"failed to scan variable"}`, http.StatusInternalServerError)
			return
		}
		variables = append(variables, v)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(variables)
}

// BulkCreate creates or upserts multiple template variables for a dashboard.
func (h *VariableHandler) BulkCreate(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	dashboardID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid dashboard id"}`, http.StatusBadRequest)
		return
	}

	var req models.BulkCreateVariablesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	for _, v := range req.Variables {
		if !v.Valid() {
			http.Error(w, `{"error":"invalid variable: name and valid type required"}`, http.StatusBadRequest)
			return
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if err := h.checkDashboardAccess(ctx, userID, dashboardID); err != nil {
		http.Error(w, `{"error":"dashboard not found or access denied"}`, http.StatusNotFound)
		return
	}

	variables := make([]models.Variable, 0, len(req.Variables))
	for _, v := range req.Variables {
		var created models.Variable
		err := h.pool.QueryRow(ctx,
			`INSERT INTO dashboard_variables (dashboard_id, name, type, label, query, multi, include_all, sort_order)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			 ON CONFLICT (dashboard_id, name) DO UPDATE SET
			   type = EXCLUDED.type, label = EXCLUDED.label, query = EXCLUDED.query,
			   multi = EXCLUDED.multi, include_all = EXCLUDED.include_all,
			   sort_order = EXCLUDED.sort_order, updated_at = NOW()
			 RETURNING id, dashboard_id, name, type, label, query, multi, include_all, sort_order, created_at, updated_at`,
			dashboardID, v.Name, v.Type, v.Label, v.Query, v.Multi, v.IncludeAll, v.SortOrder,
		).Scan(&created.ID, &created.DashboardID, &created.Name, &created.Type, &created.Label, &created.Query, &created.Multi, &created.IncludeAll, &created.SortOrder, &created.CreatedAt, &created.UpdatedAt)
		if err != nil {
			http.Error(w, `{"error":"failed to create variable"}`, http.StatusInternalServerError)
			return
		}
		variables = append(variables, created)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(variables)
}

// Update modifies a template variable's properties.
func (h *VariableHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	varID, err := uuid.Parse(r.PathValue("varId"))
	if err != nil {
		http.Error(w, `{"error":"invalid variable id"}`, http.StatusBadRequest)
		return
	}

	var req models.UpdateVariableRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Get the variable's dashboard to check access
	var dashboardID uuid.UUID
	err = h.pool.QueryRow(ctx, `SELECT dashboard_id FROM dashboard_variables WHERE id = $1`, varID).Scan(&dashboardID)
	if err != nil {
		http.Error(w, `{"error":"variable not found"}`, http.StatusNotFound)
		return
	}

	if err := h.checkDashboardAccess(ctx, userID, dashboardID); err != nil {
		http.Error(w, `{"error":"access denied"}`, http.StatusForbidden)
		return
	}

	var v models.Variable
	err = h.pool.QueryRow(ctx,
		`UPDATE dashboard_variables
		 SET name = COALESCE($1, name),
		     type = COALESCE($2, type),
		     label = COALESCE($3, label),
		     query = COALESCE($4, query),
		     multi = COALESCE($5, multi),
		     include_all = COALESCE($6, include_all),
		     sort_order = COALESCE($7, sort_order),
		     updated_at = NOW()
		 WHERE id = $8
		 RETURNING id, dashboard_id, name, type, label, query, multi, include_all, sort_order, created_at, updated_at`,
		req.Name, req.Type, req.Label, req.Query, req.Multi, req.IncludeAll, req.SortOrder, varID,
	).Scan(&v.ID, &v.DashboardID, &v.Name, &v.Type, &v.Label, &v.Query, &v.Multi, &v.IncludeAll, &v.SortOrder, &v.CreatedAt, &v.UpdatedAt)
	if err != nil {
		http.Error(w, `{"error":"failed to update variable"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

// Delete removes a template variable from its dashboard.
func (h *VariableHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	varID, err := uuid.Parse(r.PathValue("varId"))
	if err != nil {
		http.Error(w, `{"error":"invalid variable id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var dashboardID uuid.UUID
	err = h.pool.QueryRow(ctx, `SELECT dashboard_id FROM dashboard_variables WHERE id = $1`, varID).Scan(&dashboardID)
	if err != nil {
		http.Error(w, `{"error":"variable not found"}`, http.StatusNotFound)
		return
	}

	if err := h.checkDashboardAccess(ctx, userID, dashboardID); err != nil {
		http.Error(w, `{"error":"access denied"}`, http.StatusForbidden)
		return
	}

	result, err := h.pool.Exec(ctx, `DELETE FROM dashboard_variables WHERE id = $1`, varID)
	if err != nil {
		http.Error(w, `{"error":"failed to delete variable"}`, http.StatusInternalServerError)
		return
	}
	if result.RowsAffected() == 0 {
		http.Error(w, `{"error":"variable not found"}`, http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
