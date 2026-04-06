package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/aceobservability/ace/backend/internal/audit"
	"github.com/aceobservability/ace/backend/internal/auth"
	"github.com/aceobservability/ace/backend/internal/models"
)

// SSORoleMappingHandler serves CRUD endpoints for SSO group-to-role mappings.
type SSORoleMappingHandler struct {
	pool        *pgxpool.Pool
	auditLogger *audit.Logger
}

// NewSSORoleMappingHandler creates a SSORoleMappingHandler backed by the given
// connection pool and audit logger.
func NewSSORoleMappingHandler(pool *pgxpool.Pool, auditLogger *audit.Logger) *SSORoleMappingHandler {
	return &SSORoleMappingHandler{pool: pool, auditLogger: auditLogger}
}

// validSSOProviders enumerates the allowed SSO provider path values.
var validSSOProviders = map[string]bool{
	string(models.SSOGoogle):    true,
	string(models.SSOMicrosoft): true,
	string(models.SSOOkta):      true,
}

// validAceRoles enumerates the allowed values for the ace_role column.
var validAceRoles = map[string]bool{
	"admin":   true,
	"editor":  true,
	"viewer":  true,
	"auditor": true,
}

// checkAdminMembership verifies that the calling user is an admin of the given
// organization. It writes the HTTP error response and returns false when the
// check fails.
func (h *SSORoleMappingHandler) checkAdminMembership(w http.ResponseWriter, r *http.Request, orgID uuid.UUID) bool {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return false
	}

	var role string
	err := h.pool.QueryRow(r.Context(),
		`SELECT role FROM organization_memberships WHERE user_id = $1 AND organization_id = $2`,
		userID, orgID,
	).Scan(&role)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
			return false
		}
		http.Error(w, `{"error":"failed to check membership"}`, http.StatusInternalServerError)
		return false
	}

	if role != string(models.RoleAdmin) {
		http.Error(w, `{"error":"admin access required"}`, http.StatusForbidden)
		return false
	}

	return true
}

// ListMappings handles GET /api/orgs/{id}/sso/{provider}/role-mappings
func (h *SSORoleMappingHandler) ListMappings(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid organization id"}`, http.StatusBadRequest)
		return
	}

	if !h.checkAdminMembership(w, r, orgID) {
		return
	}

	provider := r.PathValue("provider")
	if !validSSOProviders[provider] {
		http.Error(w, `{"error":"invalid SSO provider"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.pool.Query(ctx,
		`SELECT id, organization_id, sso_config_id, sso_group_name, ace_role, created_at
		 FROM sso_role_mappings
		 WHERE sso_config_id = (SELECT id FROM sso_configs WHERE organization_id = $1 AND provider = $2)`,
		orgID, provider,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to list role mappings"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	mappings := []models.SSOConfigRoleMapping{}
	for rows.Next() {
		var m models.SSOConfigRoleMapping
		if err := rows.Scan(&m.ID, &m.OrganizationID, &m.SSOConfigID, &m.SSOGroupName, &m.AceRole, &m.CreatedAt); err != nil {
			http.Error(w, `{"error":"failed to scan role mapping"}`, http.StatusInternalServerError)
			return
		}
		mappings = append(mappings, m)
	}

	if err := rows.Err(); err != nil {
		http.Error(w, `{"error":"failed to iterate role mappings"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(mappings)
}

// CreateMapping handles POST /api/orgs/{id}/sso/{provider}/role-mappings
func (h *SSORoleMappingHandler) CreateMapping(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid organization id"}`, http.StatusBadRequest)
		return
	}

	if !h.checkAdminMembership(w, r, orgID) {
		return
	}

	provider := r.PathValue("provider")
	if !validSSOProviders[provider] {
		http.Error(w, `{"error":"invalid SSO provider"}`, http.StatusBadRequest)
		return
	}

	var req models.CreateSSOConfigRoleMappingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	req.SSOGroupName = strings.TrimSpace(req.SSOGroupName)
	if req.SSOGroupName == "" {
		http.Error(w, `{"error":"sso_group_name is required"}`, http.StatusBadRequest)
		return
	}

	if !validAceRoles[req.AceRole] {
		http.Error(w, `{"error":"ace_role must be one of: admin, editor, viewer, auditor"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Find sso_config_id for this org+provider
	var ssoConfigID uuid.UUID
	err = h.pool.QueryRow(ctx,
		`SELECT id FROM sso_configs WHERE organization_id = $1 AND provider = $2`,
		orgID, provider,
	).Scan(&ssoConfigID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, `{"error":"SSO not configured for this provider"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"failed to find SSO config"}`, http.StatusInternalServerError)
		return
	}

	var mapping models.SSOConfigRoleMapping
	err = h.pool.QueryRow(ctx,
		`INSERT INTO sso_role_mappings (organization_id, sso_config_id, sso_group_name, ace_role)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, organization_id, sso_config_id, sso_group_name, ace_role, created_at`,
		orgID, ssoConfigID, req.SSOGroupName, req.AceRole,
	).Scan(&mapping.ID, &mapping.OrganizationID, &mapping.SSOConfigID, &mapping.SSOGroupName, &mapping.AceRole, &mapping.CreatedAt)
	if err != nil {
		if isUniqueViolation(err) {
			http.Error(w, `{"error":"mapping for this group name already exists"}`, http.StatusConflict)
			return
		}
		http.Error(w, `{"error":"failed to create role mapping"}`, http.StatusInternalServerError)
		return
	}

	// Audit log
	if h.auditLogger != nil {
		h.auditLogger.Log(ctx, orgID, "sso_role_mapping.create", "sso_role_mapping", &mapping.ID, mapping.SSOGroupName, "success")
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(mapping)
}

// DeleteMapping handles DELETE /api/orgs/{id}/sso/{provider}/role-mappings/{mappingId}
func (h *SSORoleMappingHandler) DeleteMapping(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid organization id"}`, http.StatusBadRequest)
		return
	}

	if !h.checkAdminMembership(w, r, orgID) {
		return
	}

	provider := r.PathValue("provider")
	if !validSSOProviders[provider] {
		http.Error(w, `{"error":"invalid SSO provider"}`, http.StatusBadRequest)
		return
	}

	mappingID, err := uuid.Parse(r.PathValue("mappingId"))
	if err != nil {
		http.Error(w, `{"error":"invalid mapping id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	result, err := h.pool.Exec(ctx,
		`DELETE FROM sso_role_mappings
		 WHERE id = $1 AND sso_config_id = (SELECT id FROM sso_configs WHERE organization_id = $2 AND provider = $3)`,
		mappingID, orgID, provider,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to delete role mapping"}`, http.StatusInternalServerError)
		return
	}

	if result.RowsAffected() == 0 {
		http.Error(w, `{"error":"role mapping not found"}`, http.StatusNotFound)
		return
	}

	// Audit log
	if h.auditLogger != nil {
		h.auditLogger.Log(ctx, orgID, "sso_role_mapping.delete", "sso_role_mapping", &mappingID, "", "success")
	}

	w.WriteHeader(http.StatusNoContent)
}

// rolePriority maps roles to a numeric priority. Higher number = more privilege.
// Auditor is deliberately ranked below viewer (lateral role).
var rolePriority = map[string]int{
	"auditor": 0,
	"viewer":  1,
	"editor":  2,
	"admin":   3,
}

// ResolveRoleFromMappings determines the highest-privilege Ace role for a user
// based on their SSO group memberships and the configured mappings.
//
// For each user group, it checks if there is a matching mapping and picks the
// role with the highest privilege: admin > editor > viewer. Auditor is treated
// as lateral to viewer -- when tied, viewer wins.
//
// If no mapping matches any of the user's groups, defaultRole is returned.
func ResolveRoleFromMappings(userGroups []string, mappings []models.SSOConfigRoleMapping, defaultRole string) string {
	bestRole := ""
	bestPriority := -1

	// Build a lookup of group name -> mapping for O(1) matching.
	mappingByGroup := make(map[string]models.SSOConfigRoleMapping, len(mappings))
	for _, m := range mappings {
		mappingByGroup[m.SSOGroupName] = m
	}

	for _, group := range userGroups {
		m, ok := mappingByGroup[group]
		if !ok {
			continue
		}
		p, known := rolePriority[m.AceRole]
		if !known {
			continue
		}
		if p > bestPriority {
			bestPriority = p
			bestRole = m.AceRole
		}
	}

	if bestRole == "" {
		return defaultRole
	}
	return bestRole
}
