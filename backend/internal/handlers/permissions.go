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

type PermissionHandler struct {
	pool *pgxpool.Pool
}

type permissionResource struct {
	resourceType     authz.ResourceType
	orgLookupQuery   string
	invalidIDError   string
	notFoundError    string
	fetchError       string
	permissionAction string
}

var (
	folderPermissionResource = permissionResource{
		resourceType:     authz.ResourceTypeFolder,
		orgLookupQuery:   `SELECT organization_id FROM folders WHERE id = $1`,
		invalidIDError:   "invalid folder id",
		notFoundError:    "folder not found",
		fetchError:       "failed to fetch folder",
		permissionAction: "folder permissions",
	}
	dashboardPermissionResource = permissionResource{
		resourceType:     authz.ResourceTypeDashboard,
		orgLookupQuery:   `SELECT organization_id FROM dashboards WHERE id = $1`,
		invalidIDError:   "invalid dashboard id",
		notFoundError:    "dashboard not found",
		fetchError:       "failed to fetch dashboard",
		permissionAction: "dashboard permissions",
	}
)

func NewPermissionHandler(pool *pgxpool.Pool) *PermissionHandler {
	return &PermissionHandler{pool: pool}
}

func (h *PermissionHandler) ListFolderPermissions(w http.ResponseWriter, r *http.Request) {
	h.listPermissions(w, r, folderPermissionResource)
}

func (h *PermissionHandler) ReplaceFolderPermissions(w http.ResponseWriter, r *http.Request) {
	h.replacePermissions(w, r, folderPermissionResource)
}

func (h *PermissionHandler) ListDashboardPermissions(w http.ResponseWriter, r *http.Request) {
	h.listPermissions(w, r, dashboardPermissionResource)
}

func (h *PermissionHandler) ReplaceDashboardPermissions(w http.ResponseWriter, r *http.Request) {
	h.replacePermissions(w, r, dashboardPermissionResource)
}

func (h *PermissionHandler) listPermissions(w http.ResponseWriter, r *http.Request, resource permissionResource) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	resourceID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, resource.invalidIDError)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	orgID, err := h.lookupResourceOrganization(ctx, resource, resourceID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSONError(w, http.StatusNotFound, resource.notFoundError)
			return
		}
		writeJSONError(w, http.StatusInternalServerError, resource.fetchError)
		return
	}

	role, err := h.checkOrgMembership(ctx, userID, orgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSONError(w, http.StatusForbidden, "not a member of this organization")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "failed to check membership")
		return
	}

	if role != string(models.RoleAdmin) {
		writeJSONError(w, http.StatusForbidden, "admin access required")
		return
	}

	permissions, err := listResourcePermissions(ctx, h.pool, orgID, resource.resourceType, resourceID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to list "+resource.permissionAction)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(permissions)
}

func (h *PermissionHandler) replacePermissions(w http.ResponseWriter, r *http.Request, resource permissionResource) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	resourceID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, resource.invalidIDError)
		return
	}

	var req models.ReplaceResourcePermissionsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Entries == nil {
		req.Entries = []models.ResourcePermissionEntry{}
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	orgID, err := h.lookupResourceOrganization(ctx, resource, resourceID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSONError(w, http.StatusNotFound, resource.notFoundError)
			return
		}
		writeJSONError(w, http.StatusInternalServerError, resource.fetchError)
		return
	}

	role, err := h.checkOrgMembership(ctx, userID, orgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSONError(w, http.StatusForbidden, "not a member of this organization")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "failed to check membership")
		return
	}

	if role != string(models.RoleAdmin) {
		writeJSONError(w, http.StatusForbidden, "admin access required")
		return
	}

	if err := h.validatePermissionEntries(ctx, orgID, req.Entries); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	permissions, err := h.replaceResourcePermissions(ctx, userID, orgID, resource.resourceType, resourceID, req.Entries)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to update "+resource.permissionAction)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(permissions)
}

func (h *PermissionHandler) lookupResourceOrganization(
	ctx context.Context,
	resource permissionResource,
	resourceID uuid.UUID,
) (uuid.UUID, error) {
	var orgID uuid.UUID
	err := h.pool.QueryRow(ctx, resource.orgLookupQuery, resourceID).Scan(&orgID)
	if err != nil {
		return uuid.Nil, err
	}

	return orgID, nil
}

func (h *PermissionHandler) checkOrgMembership(ctx context.Context, userID, orgID uuid.UUID) (string, error) {
	var role string
	err := h.pool.QueryRow(ctx,
		`SELECT role FROM organization_memberships WHERE user_id = $1 AND organization_id = $2`,
		userID,
		orgID,
	).Scan(&role)

	return role, err
}

func (h *PermissionHandler) validatePermissionEntries(
	ctx context.Context,
	orgID uuid.UUID,
	entries []models.ResourcePermissionEntry,
) error {
	seen := make(map[string]struct{}, len(entries))

	for _, entry := range entries {
		if entry.PrincipalID == uuid.Nil {
			return errors.New("principal_id is required")
		}

		if !isValidPrincipalType(entry.PrincipalType) {
			return errors.New("principal_type must be one of: user, group")
		}

		if !isValidPermissionLevel(entry.Permission) {
			return errors.New("permission must be one of: view, edit, admin")
		}

		key := string(entry.PrincipalType) + ":" + entry.PrincipalID.String()
		if _, exists := seen[key]; exists {
			return errors.New("duplicate principal entries are not allowed")
		}
		seen[key] = struct{}{}

		belongs, err := h.principalBelongsToOrganization(ctx, orgID, entry.PrincipalType, entry.PrincipalID)
		if err != nil {
			return errors.New("failed to validate permission principal")
		}
		if !belongs {
			return errors.New("principal does not belong to this organization")
		}
	}

	return nil
}

func (h *PermissionHandler) principalBelongsToOrganization(
	ctx context.Context,
	orgID uuid.UUID,
	principalType models.PrincipalType,
	principalID uuid.UUID,
) (bool, error) {
	var query string
	switch principalType {
	case models.PrincipalTypeUser:
		query = `SELECT EXISTS (
			SELECT 1
			FROM organization_memberships
			WHERE organization_id = $1 AND user_id = $2
		)`
	case models.PrincipalTypeGroup:
		query = `SELECT EXISTS (
			SELECT 1
			FROM user_groups
			WHERE organization_id = $1 AND id = $2
		)`
	default:
		return false, nil
	}

	var exists bool
	err := h.pool.QueryRow(ctx, query, orgID, principalID).Scan(&exists)
	if err != nil {
		return false, err
	}

	return exists, nil
}

func (h *PermissionHandler) replaceResourcePermissions(
	ctx context.Context,
	userID, orgID uuid.UUID,
	resourceType authz.ResourceType,
	resourceID uuid.UUID,
	entries []models.ResourcePermissionEntry,
) ([]models.ResourcePermissionEntry, error) {
	tx, err := h.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx,
		`DELETE FROM resource_permissions
		 WHERE organization_id = $1 AND resource_type = $2 AND resource_id = $3`,
		orgID,
		resourceType,
		resourceID,
	)
	if err != nil {
		return nil, err
	}

	for _, entry := range entries {
		_, err = tx.Exec(ctx,
			`INSERT INTO resource_permissions (organization_id, resource_type, resource_id, principal_type, principal_id, permission, created_by)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			orgID,
			resourceType,
			resourceID,
			entry.PrincipalType,
			entry.PrincipalID,
			entry.Permission,
			userID,
		)
		if err != nil {
			return nil, err
		}
	}

	updatedPermissions, err := listResourcePermissions(ctx, tx, orgID, resourceType, resourceID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return updatedPermissions, nil
}

type resourcePermissionReader interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

func listResourcePermissions(
	ctx context.Context,
	reader resourcePermissionReader,
	orgID uuid.UUID,
	resourceType authz.ResourceType,
	resourceID uuid.UUID,
) ([]models.ResourcePermissionEntry, error) {
	rows, err := reader.Query(ctx,
		`SELECT principal_type, principal_id, permission
		 FROM resource_permissions
		 WHERE organization_id = $1 AND resource_type = $2 AND resource_id = $3
		 ORDER BY principal_type ASC, principal_id ASC`,
		orgID,
		resourceType,
		resourceID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	permissions := make([]models.ResourcePermissionEntry, 0)
	for rows.Next() {
		var principalType models.PrincipalType
		var entry models.ResourcePermissionEntry
		if err := rows.Scan(&principalType, &entry.PrincipalID, &entry.Permission); err != nil {
			return nil, err
		}
		entry.PrincipalType = principalType
		permissions = append(permissions, entry)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return permissions, nil
}

func isValidPrincipalType(principalType models.PrincipalType) bool {
	return principalType == models.PrincipalTypeUser || principalType == models.PrincipalTypeGroup
}

func isValidPermissionLevel(permission models.ResourcePermissionLevel) bool {
	return permission == models.ResourcePermissionView ||
		permission == models.ResourcePermissionEdit ||
		permission == models.ResourcePermissionAdmin
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}
