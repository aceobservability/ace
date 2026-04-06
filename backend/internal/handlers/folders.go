package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/aceobservability/ace/backend/internal/auth"
	"github.com/aceobservability/ace/backend/internal/authz"
	"github.com/aceobservability/ace/backend/internal/models"
)

type FolderHandler struct {
	pool  *pgxpool.Pool
	authz *authz.Service
}

func NewFolderHandler(pool *pgxpool.Pool) *FolderHandler {
	return &FolderHandler{
		pool:  pool,
		authz: authz.NewService(pool),
	}
}

func (h *FolderHandler) checkOrgMembership(ctx context.Context, userID, orgID uuid.UUID) (string, error) {
	var role string
	err := h.pool.QueryRow(ctx,
		`SELECT role FROM organization_memberships WHERE user_id = $1 AND organization_id = $2`,
		userID, orgID,
	).Scan(&role)
	return role, err
}

// Create creates a new folder in the specified organization.
func (h *FolderHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	orgID, err := uuid.Parse(r.PathValue("orgId"))
	if err != nil {
		http.Error(w, `{"error":"invalid organization id"}`, http.StatusBadRequest)
		return
	}

	var req models.CreateFolderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		http.Error(w, `{"error":"name is required"}`, http.StatusBadRequest)
		return
	}

	sortOrder := 0
	if req.SortOrder != nil {
		sortOrder = *req.SortOrder
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	role, err := h.checkOrgMembership(ctx, userID, orgID)
	if err != nil {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}
	if role == string(models.RoleViewer) {
		http.Error(w, `{"error":"viewers cannot create folders"}`, http.StatusForbidden)
		return
	}

	if req.ParentID != nil {
		var parentExists bool
		err = h.pool.QueryRow(ctx,
			`SELECT EXISTS (SELECT 1 FROM folders WHERE id = $1 AND organization_id = $2)`,
			*req.ParentID, orgID,
		).Scan(&parentExists)
		if err != nil {
			http.Error(w, `{"error":"failed to validate parent folder"}`, http.StatusInternalServerError)
			return
		}
		if !parentExists {
			http.Error(w, `{"error":"parent folder not found"}`, http.StatusBadRequest)
			return
		}
	}

	var folder models.Folder
	err = h.pool.QueryRow(ctx,
		`INSERT INTO folders (organization_id, parent_id, name, sort_order, created_by)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, organization_id, parent_id, name, sort_order, created_by, created_at, updated_at`,
		orgID, req.ParentID, name, sortOrder, userID,
	).Scan(
		&folder.ID,
		&folder.OrganizationID,
		&folder.ParentID,
		&folder.Name,
		&folder.SortOrder,
		&folder.CreatedBy,
		&folder.CreatedAt,
		&folder.UpdatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to create folder"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(folder)
}

// List returns all folders the user has view access to in the specified organization.
func (h *FolderHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	orgID, err := uuid.Parse(r.PathValue("orgId"))
	if err != nil {
		http.Error(w, `{"error":"invalid organization id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	_, err = h.checkOrgMembership(ctx, userID, orgID)
	if err != nil {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}

	rows, err := h.pool.Query(ctx,
		`SELECT id, organization_id, parent_id, name, sort_order, created_by, created_at, updated_at
		 FROM folders
		 WHERE organization_id = $1
		 ORDER BY parent_id NULLS FIRST, sort_order ASC, name ASC`,
		orgID,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to fetch folders"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	folders := []models.Folder{}
	for rows.Next() {
		var folder models.Folder
		if err := rows.Scan(
			&folder.ID,
			&folder.OrganizationID,
			&folder.ParentID,
			&folder.Name,
			&folder.SortOrder,
			&folder.CreatedBy,
			&folder.CreatedAt,
			&folder.UpdatedAt,
		); err != nil {
			http.Error(w, `{"error":"failed to scan folder"}`, http.StatusInternalServerError)
			return
		}

		canView, err := h.authz.Can(ctx, userID, orgID, authz.ResourceTypeFolder, folder.ID, authz.ActionView)
		if err != nil {
			http.Error(w, `{"error":"failed to evaluate folder permissions"}`, http.StatusInternalServerError)
			return
		}
		if !canView {
			continue
		}

		folders = append(folders, folder)
	}

	if err := rows.Err(); err != nil {
		http.Error(w, `{"error":"failed to iterate folders"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(folders)
}

// Get returns a single folder by ID.
func (h *FolderHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid folder id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var folder models.Folder
	err = h.pool.QueryRow(ctx,
		`SELECT id, organization_id, parent_id, name, sort_order, created_by, created_at, updated_at
		 FROM folders
		 WHERE id = $1`,
		id,
	).Scan(
		&folder.ID,
		&folder.OrganizationID,
		&folder.ParentID,
		&folder.Name,
		&folder.SortOrder,
		&folder.CreatedBy,
		&folder.CreatedAt,
		&folder.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		http.Error(w, `{"error":"folder not found"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"failed to fetch folder"}`, http.StatusInternalServerError)
		return
	}

	_, err = h.checkOrgMembership(ctx, userID, folder.OrganizationID)
	if err != nil {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}

	canView, err := h.authz.Can(ctx, userID, folder.OrganizationID, authz.ResourceTypeFolder, folder.ID, authz.ActionView)
	if err != nil {
		http.Error(w, `{"error":"failed to evaluate folder permissions"}`, http.StatusInternalServerError)
		return
	}
	if !canView {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(folder)
}

// Update modifies a folder's name, parent, or sort order.
func (h *FolderHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid folder id"}`, http.StatusBadRequest)
		return
	}

	var req models.UpdateFolderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Name != nil && strings.TrimSpace(*req.Name) == "" {
		http.Error(w, `{"error":"name cannot be empty"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var orgID uuid.UUID
	err = h.pool.QueryRow(ctx,
		`SELECT organization_id FROM folders WHERE id = $1`,
		id,
	).Scan(&orgID)
	if err == pgx.ErrNoRows {
		http.Error(w, `{"error":"folder not found"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"failed to fetch folder"}`, http.StatusInternalServerError)
		return
	}

	_, err = h.checkOrgMembership(ctx, userID, orgID)
	if err != nil {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}

	canEdit, err := h.authz.Can(ctx, userID, orgID, authz.ResourceTypeFolder, id, authz.ActionEdit)
	if err != nil {
		http.Error(w, `{"error":"failed to evaluate folder permissions"}`, http.StatusInternalServerError)
		return
	}
	if !canEdit {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	if req.ParentID != nil {
		if *req.ParentID == id {
			http.Error(w, `{"error":"folder cannot be its own parent"}`, http.StatusBadRequest)
			return
		}

		var parentExists bool
		err = h.pool.QueryRow(ctx,
			`SELECT EXISTS (SELECT 1 FROM folders WHERE id = $1 AND organization_id = $2)`,
			*req.ParentID, orgID,
		).Scan(&parentExists)
		if err != nil {
			http.Error(w, `{"error":"failed to validate parent folder"}`, http.StatusInternalServerError)
			return
		}
		if !parentExists {
			http.Error(w, `{"error":"parent folder not found"}`, http.StatusBadRequest)
			return
		}
	}

	var updatedName *string
	if req.Name != nil {
		trimmedName := strings.TrimSpace(*req.Name)
		updatedName = &trimmedName
	}

	var folder models.Folder
	err = h.pool.QueryRow(ctx,
		`UPDATE folders
		 SET name = COALESCE($1, name),
		     parent_id = COALESCE($2, parent_id),
		     sort_order = COALESCE($3, sort_order),
		     updated_at = NOW()
		 WHERE id = $4
		 RETURNING id, organization_id, parent_id, name, sort_order, created_by, created_at, updated_at`,
		updatedName, req.ParentID, req.SortOrder, id,
	).Scan(
		&folder.ID,
		&folder.OrganizationID,
		&folder.ParentID,
		&folder.Name,
		&folder.SortOrder,
		&folder.CreatedBy,
		&folder.CreatedAt,
		&folder.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		http.Error(w, `{"error":"folder not found"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"failed to update folder"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(folder)
}

// Delete removes a folder by ID.
func (h *FolderHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid folder id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var orgID uuid.UUID
	err = h.pool.QueryRow(ctx,
		`SELECT organization_id FROM folders WHERE id = $1`,
		id,
	).Scan(&orgID)
	if err == pgx.ErrNoRows {
		http.Error(w, `{"error":"folder not found"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"failed to fetch folder"}`, http.StatusInternalServerError)
		return
	}

	_, err = h.checkOrgMembership(ctx, userID, orgID)
	if err != nil {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}

	canEdit, err := h.authz.Can(ctx, userID, orgID, authz.ResourceTypeFolder, id, authz.ActionEdit)
	if err != nil {
		http.Error(w, `{"error":"failed to evaluate folder permissions"}`, http.StatusInternalServerError)
		return
	}
	if !canEdit {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	result, err := h.pool.Exec(ctx, `DELETE FROM folders WHERE id = $1`, id)
	if err != nil {
		http.Error(w, `{"error":"failed to delete folder"}`, http.StatusInternalServerError)
		return
	}
	if result.RowsAffected() == 0 {
		http.Error(w, `{"error":"folder not found"}`, http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
