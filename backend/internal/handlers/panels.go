package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/aceobservability/ace/backend/internal/auth"
	"github.com/aceobservability/ace/backend/internal/authz"
	"github.com/aceobservability/ace/backend/internal/models"
)

type PanelHandler struct {
	pool  *pgxpool.Pool
	authz *authz.Service
}

func NewPanelHandler(pool *pgxpool.Pool) *PanelHandler {
	return &PanelHandler{
		pool:  pool,
		authz: authz.NewService(pool),
	}
}

func (h *PanelHandler) loadDashboardAccess(ctx context.Context, dashboardID uuid.UUID) (uuid.UUID, error) {
	var orgID *uuid.UUID
	err := h.pool.QueryRow(ctx, `SELECT organization_id FROM dashboards WHERE id = $1`, dashboardID).Scan(&orgID)
	if err != nil {
		return uuid.Nil, err
	}
	if orgID == nil {
		return uuid.Nil, pgx.ErrNoRows
	}

	return *orgID, nil
}

func (h *PanelHandler) loadPanelDashboardAccess(ctx context.Context, panelID uuid.UUID) (uuid.UUID, uuid.UUID, error) {
	var dashboardID uuid.UUID
	var orgID *uuid.UUID
	err := h.pool.QueryRow(ctx,
		`SELECT p.dashboard_id, d.organization_id
		 FROM panels p
		 JOIN dashboards d ON d.id = p.dashboard_id
		 WHERE p.id = $1`,
		panelID,
	).Scan(&dashboardID, &orgID)
	if err != nil {
		return uuid.Nil, uuid.Nil, err
	}
	if orgID == nil {
		return uuid.Nil, uuid.Nil, pgx.ErrNoRows
	}

	return dashboardID, *orgID, nil
}

func writePanelHTTPError(w http.ResponseWriter, err error, fallback string) {
	switch {
	case errors.Is(err, ErrForbidden):
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
	case errors.Is(err, ErrDashboardNotFound):
		http.Error(w, `{"error":"dashboard not found"}`, http.StatusNotFound)
	case errors.Is(err, ErrPanelNotFound):
		http.Error(w, `{"error":"panel not found"}`, http.StatusNotFound)
	case errors.Is(err, ErrInvalidGridPos):
		http.Error(w, `{"error":"invalid grid_pos"}`, http.StatusBadRequest)
	default:
		http.Error(w, `{"error":"`+fallback+`"}`, http.StatusInternalServerError)
	}
}

func scanPanel(row interface {
	Scan(dest ...any) error
}, p *models.Panel) error {
	var gridPosBytes []byte
	var queryBytes []byte
	if err := row.Scan(&p.ID, &p.DashboardID, &p.Title, &p.Type,
		&gridPosBytes, &queryBytes, &p.CreatedAt, &p.UpdatedAt); err != nil {
		return err
	}
	json.Unmarshal(gridPosBytes, &p.GridPos)
	p.Query = queryBytes
	return nil
}

func mapDashboardAccessErr(err error, fallbackNotFound error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return fallbackNotFound
	}
	return err
}

func (h *PanelHandler) requireDashboardAction(ctx context.Context, userID, orgID, dashboardID uuid.UUID, action authz.Action) error {
	ok, err := h.authz.Can(ctx, userID, orgID, authz.ResourceTypeDashboard, dashboardID, action)
	if err != nil {
		return err
	}
	if !ok {
		return ErrForbidden
	}
	return nil
}

// CreatePanel adds a panel to a dashboard. Same ACL as POST /api/dashboards/{id}/panels.
func (h *PanelHandler) CreatePanel(ctx context.Context, userID, dashboardID uuid.UUID, req models.CreatePanelRequest) (*models.Panel, error) {
	orgID, err := h.loadDashboardAccess(ctx, dashboardID)
	if err != nil {
		return nil, mapDashboardAccessErr(err, ErrDashboardNotFound)
	}
	if err := h.requireDashboardAction(ctx, userID, orgID, dashboardID, authz.ActionEdit); err != nil {
		return nil, err
	}

	panelType := "line_chart"
	if req.Type != nil && *req.Type != "" {
		panelType = *req.Type
	}

	gridPosJSON, err := json.Marshal(req.GridPos)
	if err != nil {
		return nil, ErrInvalidGridPos
	}

	var panel models.Panel
	err = scanPanel(h.pool.QueryRow(ctx,
		`INSERT INTO panels (dashboard_id, title, type, grid_pos, query)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, dashboard_id, title, type, grid_pos, query, created_at, updated_at`,
		dashboardID, req.Title, panelType, gridPosJSON, req.Query,
	), &panel)
	if err != nil {
		return nil, err
	}
	return &panel, nil
}

// ListPanels returns panels on a dashboard. Same ACL as GET /api/dashboards/{id}/panels.
func (h *PanelHandler) ListPanels(ctx context.Context, userID, dashboardID uuid.UUID) ([]models.Panel, error) {
	orgID, err := h.loadDashboardAccess(ctx, dashboardID)
	if err != nil {
		return nil, mapDashboardAccessErr(err, ErrDashboardNotFound)
	}
	if err := h.requireDashboardAction(ctx, userID, orgID, dashboardID, authz.ActionView); err != nil {
		return nil, err
	}

	rows, err := h.pool.Query(ctx,
		`SELECT id, dashboard_id, title, type, grid_pos, query, created_at, updated_at
		 FROM panels
		 WHERE dashboard_id = $1
		 ORDER BY created_at ASC`, dashboardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	panels := []models.Panel{}
	for rows.Next() {
		var p models.Panel
		if err := scanPanel(rows, &p); err != nil {
			return nil, err
		}
		panels = append(panels, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return panels, nil
}

// UpdatePanel modifies a panel. Same ACL as PUT /api/panels/{id}.
func (h *PanelHandler) UpdatePanel(ctx context.Context, userID, id uuid.UUID, req models.UpdatePanelRequest) (*models.Panel, error) {
	dashboardID, orgID, err := h.loadPanelDashboardAccess(ctx, id)
	if err != nil {
		return nil, mapDashboardAccessErr(err, ErrPanelNotFound)
	}
	if err := h.requireDashboardAction(ctx, userID, orgID, dashboardID, authz.ActionEdit); err != nil {
		return nil, err
	}

	var gridPosJSON []byte
	if req.GridPos != nil {
		gridPosJSON, err = json.Marshal(req.GridPos)
		if err != nil {
			return nil, ErrInvalidGridPos
		}
	}

	var panel models.Panel
	err = scanPanel(h.pool.QueryRow(ctx,
		`UPDATE panels
		 SET title = COALESCE($1, title),
		     type = COALESCE($2, type),
		     grid_pos = COALESCE($3, grid_pos),
		     query = COALESCE($4, query),
		     updated_at = NOW()
		 WHERE id = $5
		 RETURNING id, dashboard_id, title, type, grid_pos, query, created_at, updated_at`,
		req.Title, req.Type, gridPosJSON, req.Query, id,
	), &panel)
	if err != nil {
		return nil, ErrPanelNotFound
	}
	return &panel, nil
}

// Create adds a new panel to a dashboard.
func (h *PanelHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	dashboardIDStr := r.PathValue("id")
	dashboardID, err := uuid.Parse(dashboardIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid dashboard id"}`, http.StatusBadRequest)
		return
	}

	var req models.CreatePanelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Title == "" {
		http.Error(w, `{"error":"title is required"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	panel, err := h.CreatePanel(ctx, userID, dashboardID, req)
	if err != nil {
		writePanelHTTPError(w, err, "failed to create panel")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(panel)
}

// ListByDashboard returns all panels belonging to a dashboard.
func (h *PanelHandler) ListByDashboard(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	dashboardIDStr := r.PathValue("id")
	dashboardID, err := uuid.Parse(dashboardIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid dashboard id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	panels, err := h.ListPanels(ctx, userID, dashboardID)
	if err != nil {
		fallback := "failed to fetch panels"
		if errors.Is(err, ErrDashboardNotFound) {
			fallback = "failed to fetch dashboard"
		}
		writePanelHTTPError(w, err, fallback)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(panels)
}

// Update modifies a panel's title, type, layout, or query configuration.
func (h *PanelHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid panel id"}`, http.StatusBadRequest)
		return
	}

	var req models.UpdatePanelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	panel, err := h.UpdatePanel(ctx, userID, id, req)
	if err != nil {
		fallback := "failed to fetch panel"
		writePanelHTTPError(w, err, fallback)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(panel)
}

// Delete removes a panel from its dashboard.
func (h *PanelHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid panel id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	dashboardID, orgID, err := h.loadPanelDashboardAccess(ctx, id)
	if err == pgx.ErrNoRows {
		http.Error(w, `{"error":"panel not found"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"failed to fetch panel"}`, http.StatusInternalServerError)
		return
	}

	canEdit, err := h.authz.Can(ctx, userID, orgID, authz.ResourceTypeDashboard, dashboardID, authz.ActionEdit)
	if err != nil {
		http.Error(w, `{"error":"failed to evaluate dashboard permissions"}`, http.StatusInternalServerError)
		return
	}
	if !canEdit {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	result, err := h.pool.Exec(ctx, `DELETE FROM panels WHERE id = $1`, id)
	if err != nil {
		http.Error(w, `{"error":"failed to delete panel"}`, http.StatusInternalServerError)
		return
	}

	if result.RowsAffected() == 0 {
		http.Error(w, `{"error":"panel not found"}`, http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
