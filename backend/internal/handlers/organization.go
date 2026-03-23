package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/janhoon/dash/backend/internal/auth"
	"github.com/janhoon/dash/backend/internal/models"
	"github.com/redis/go-redis/v9"
)

type OrganizationHandler struct {
	pool *pgxpool.Pool
	rdb  *redis.Client
}

func NewOrganizationHandler(pool *pgxpool.Pool, rdb *redis.Client) *OrganizationHandler {
	return &OrganizationHandler{pool: pool, rdb: rdb}
}

// InvitationResponse represents the invitation response
type InvitationResponse struct {
	Token     string    `json:"token"`
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	ExpiresAt time.Time `json:"expires_at"`
}

// CreateInvitationRequest represents invitation request body
type CreateInvitationRequest struct {
	Email string                `json:"email"`
	Role  models.MembershipRole `json:"role"`
}

// InvitationData stored in Valkey
type InvitationData struct {
	OrganizationID uuid.UUID `json:"organization_id"`
	Email          string    `json:"email"`
	Role           string    `json:"role"`
}

// MemberResponse represents a member in the organization
type MemberResponse struct {
	ID        uuid.UUID `json:"id"`
	UserID    uuid.UUID `json:"user_id"`
	Email     string    `json:"email"`
	Name      *string   `json:"name,omitempty"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

// UpdateMemberRoleRequest represents role update request
type UpdateMemberRoleRequest struct {
	Role models.MembershipRole `json:"role"`
}

var slugRegex = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,98}[a-z0-9]$`)
var hexColorRegex = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// UpdateBrandingRequest represents branding update request
type UpdateBrandingRequest struct {
	PrimaryColor *string `json:"primary_color"`
	LogoDataURI  *string `json:"logo_data_uri"`
	AppTitle     *string `json:"app_title"`
}

// Create creates a new organization
func (h *OrganizationHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req models.CreateOrganizationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Name == "" {
		http.Error(w, `{"error":"name is required"}`, http.StatusBadRequest)
		return
	}

	if req.Slug == "" {
		http.Error(w, `{"error":"slug is required"}`, http.StatusBadRequest)
		return
	}

	if !slugRegex.MatchString(req.Slug) {
		http.Error(w, `{"error":"slug must be 3-100 lowercase alphanumeric characters with hyphens"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Start transaction
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		http.Error(w, `{"error":"failed to start transaction"}`, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(ctx)

	// Create organization
	var org models.Organization
	err = tx.QueryRow(ctx,
		`INSERT INTO organizations (name, slug)
		 VALUES ($1, $2)
		 RETURNING id, name, slug, created_at, updated_at`,
		req.Name, req.Slug,
	).Scan(&org.ID, &org.Name, &org.Slug, &org.CreatedAt, &org.UpdatedAt)

	if err != nil {
		if isDuplicateKeyError(err) {
			http.Error(w, `{"error":"organization slug already exists"}`, http.StatusConflict)
			return
		}
		http.Error(w, `{"error":"failed to create organization"}`, http.StatusInternalServerError)
		return
	}

	// Add creator as admin
	_, err = tx.Exec(ctx,
		`INSERT INTO organization_memberships (organization_id, user_id, role)
		 VALUES ($1, $2, 'admin')`,
		org.ID, userID,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to add creator as admin"}`, http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		http.Error(w, `{"error":"failed to commit transaction"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(org)
}

// List returns all organizations the user belongs to
func (h *OrganizationHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.pool.Query(ctx,
		`SELECT o.id, o.name, o.slug, o.created_at, o.updated_at, om.role,
		        o.branding_primary_color, o.branding_logo_data, o.branding_logo_mime, o.branding_app_title
		 FROM organizations o
		 JOIN organization_memberships om ON o.id = om.organization_id
		 WHERE om.user_id = $1
		 ORDER BY o.name`,
		userID,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to list organizations"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type OrgWithRole struct {
		models.Organization
		Role string `json:"role"`
	}

	orgs := []OrgWithRole{}
	for rows.Next() {
		var org OrgWithRole
		var logoData, logoMime *string
		if err := rows.Scan(&org.ID, &org.Name, &org.Slug, &org.CreatedAt, &org.UpdatedAt, &org.Role,
			&org.Branding.PrimaryColor, &logoData, &logoMime, &org.Branding.AppTitle); err != nil {
			http.Error(w, `{"error":"failed to scan organization"}`, http.StatusInternalServerError)
			return
		}
		if logoData != nil {
			org.Branding.LogoDataURI = logoData
		}
		orgs = append(orgs, org)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(orgs)
}

// Get returns a specific organization
func (h *OrganizationHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	orgID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid organization id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Check membership
	var role string
	err = h.pool.QueryRow(ctx,
		`SELECT role FROM organization_memberships WHERE organization_id = $1 AND user_id = $2`,
		orgID, userID,
	).Scan(&role)
	if err == pgx.ErrNoRows {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"failed to check membership"}`, http.StatusInternalServerError)
		return
	}

	// Get organization
	var org models.Organization
	var logoData, logoMime *string
	err = h.pool.QueryRow(ctx,
		`SELECT id, name, slug, created_at, updated_at,
		        branding_primary_color, branding_logo_data, branding_logo_mime, branding_app_title
		 FROM organizations WHERE id = $1`,
		orgID,
	).Scan(&org.ID, &org.Name, &org.Slug, &org.CreatedAt, &org.UpdatedAt,
		&org.Branding.PrimaryColor, &logoData, &logoMime, &org.Branding.AppTitle)
	if err == pgx.ErrNoRows {
		http.Error(w, `{"error":"organization not found"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"failed to get organization"}`, http.StatusInternalServerError)
		return
	}
	if logoData != nil {
		org.Branding.LogoDataURI = logoData
	}

	type OrgWithRole struct {
		models.Organization
		Role string `json:"role"`
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(OrgWithRole{Organization: org, Role: role})
}

// Update updates an organization (admin only)
func (h *OrganizationHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	orgID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid organization id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Check admin role
	if !h.isOrgAdmin(ctx, orgID, userID) {
		http.Error(w, `{"error":"admin access required"}`, http.StatusForbidden)
		return
	}

	var req models.UpdateOrganizationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Slug != nil && !slugRegex.MatchString(*req.Slug) {
		http.Error(w, `{"error":"slug must be 3-100 lowercase alphanumeric characters with hyphens"}`, http.StatusBadRequest)
		return
	}

	// Build dynamic update query
	var org models.Organization
	if req.Name != nil && req.Slug != nil {
		err = h.pool.QueryRow(ctx,
			`UPDATE organizations SET name = $1, slug = $2, updated_at = NOW()
			 WHERE id = $3
			 RETURNING id, name, slug, created_at, updated_at`,
			*req.Name, *req.Slug, orgID,
		).Scan(&org.ID, &org.Name, &org.Slug, &org.CreatedAt, &org.UpdatedAt)
	} else if req.Name != nil {
		err = h.pool.QueryRow(ctx,
			`UPDATE organizations SET name = $1, updated_at = NOW()
			 WHERE id = $2
			 RETURNING id, name, slug, created_at, updated_at`,
			*req.Name, orgID,
		).Scan(&org.ID, &org.Name, &org.Slug, &org.CreatedAt, &org.UpdatedAt)
	} else if req.Slug != nil {
		err = h.pool.QueryRow(ctx,
			`UPDATE organizations SET slug = $1, updated_at = NOW()
			 WHERE id = $2
			 RETURNING id, name, slug, created_at, updated_at`,
			*req.Slug, orgID,
		).Scan(&org.ID, &org.Name, &org.Slug, &org.CreatedAt, &org.UpdatedAt)
	} else {
		// No updates, just return current org
		err = h.pool.QueryRow(ctx,
			`SELECT id, name, slug, created_at, updated_at FROM organizations WHERE id = $1`,
			orgID,
		).Scan(&org.ID, &org.Name, &org.Slug, &org.CreatedAt, &org.UpdatedAt)
	}

	if err != nil {
		if isDuplicateKeyError(err) {
			http.Error(w, `{"error":"organization slug already exists"}`, http.StatusConflict)
			return
		}
		http.Error(w, `{"error":"failed to update organization"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(org)
}

// Delete deletes an organization (admin only)
func (h *OrganizationHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	orgID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid organization id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Check admin role
	if !h.isOrgAdmin(ctx, orgID, userID) {
		http.Error(w, `{"error":"admin access required"}`, http.StatusForbidden)
		return
	}

	// Delete organization (cascades to memberships, dashboards, etc.)
	result, err := h.pool.Exec(ctx,
		`DELETE FROM organizations WHERE id = $1`,
		orgID,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to delete organization"}`, http.StatusInternalServerError)
		return
	}

	if result.RowsAffected() == 0 {
		http.Error(w, `{"error":"organization not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "organization deleted"})
}

// CreateInvitation creates an invitation to join the organization (admin only)
func (h *OrganizationHandler) CreateInvitation(w http.ResponseWriter, r *http.Request) {
	if h.rdb == nil {
		http.Error(w, `{"error":"invitations not enabled (Valkey not available)"}`, http.StatusNotImplemented)
		return
	}

	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	orgID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid organization id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Check admin role
	if !h.isOrgAdmin(ctx, orgID, userID) {
		http.Error(w, `{"error":"admin access required"}`, http.StatusForbidden)
		return
	}

	var req CreateInvitationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Email == "" {
		http.Error(w, `{"error":"email is required"}`, http.StatusBadRequest)
		return
	}

	if req.Role == "" {
		req.Role = models.RoleViewer
	}

	if req.Role != models.RoleAdmin && req.Role != models.RoleEditor && req.Role != models.RoleViewer && req.Role != models.RoleAuditor {
		http.Error(w, `{"error":"invalid role"}`, http.StatusBadRequest)
		return
	}

	// Check if user is already a member
	var existingMembership uuid.UUID
	err = h.pool.QueryRow(ctx,
		`SELECT om.id FROM organization_memberships om
		 JOIN users u ON u.id = om.user_id
		 WHERE om.organization_id = $1 AND u.email = $2`,
		orgID, req.Email,
	).Scan(&existingMembership)
	if err == nil {
		http.Error(w, `{"error":"user is already a member"}`, http.StatusConflict)
		return
	}
	if err != pgx.ErrNoRows {
		http.Error(w, `{"error":"failed to check membership"}`, http.StatusInternalServerError)
		return
	}

	// Generate invitation token
	token, err := auth.GenerateRefreshToken() // Reuse the secure token generator
	if err != nil {
		http.Error(w, `{"error":"failed to generate invitation token"}`, http.StatusInternalServerError)
		return
	}

	// Store invitation in Valkey with 7-day TTL
	invitationData := InvitationData{
		OrganizationID: orgID,
		Email:          req.Email,
		Role:           string(req.Role),
	}
	dataJSON, _ := json.Marshal(invitationData)

	key := "invitation:" + token
	ttl := 7 * 24 * time.Hour
	if err := h.rdb.Set(ctx, key, dataJSON, ttl).Err(); err != nil {
		http.Error(w, `{"error":"failed to store invitation"}`, http.StatusInternalServerError)
		return
	}

	response := InvitationResponse{
		Token:     token,
		Email:     req.Email,
		Role:      string(req.Role),
		ExpiresAt: time.Now().Add(ttl),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

// AcceptInvitation accepts an invitation and creates membership
func (h *OrganizationHandler) AcceptInvitation(w http.ResponseWriter, r *http.Request) {
	if h.rdb == nil {
		http.Error(w, `{"error":"invitations not enabled (Valkey not available)"}`, http.StatusNotImplemented)
		return
	}

	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	token := r.PathValue("token")
	if token == "" {
		http.Error(w, `{"error":"invitation token required"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Get invitation from Valkey
	key := "invitation:" + token
	dataJSON, err := h.rdb.Get(ctx, key).Bytes()
	if err == redis.Nil {
		http.Error(w, `{"error":"invitation not found or expired"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"failed to get invitation"}`, http.StatusInternalServerError)
		return
	}

	var invitationData InvitationData
	if err := json.Unmarshal(dataJSON, &invitationData); err != nil {
		http.Error(w, `{"error":"invalid invitation data"}`, http.StatusInternalServerError)
		return
	}

	// Verify email matches the invitation
	var userEmail string
	err = h.pool.QueryRow(ctx,
		`SELECT email FROM users WHERE id = $1`,
		userID,
	).Scan(&userEmail)
	if err != nil {
		http.Error(w, `{"error":"failed to get user email"}`, http.StatusInternalServerError)
		return
	}

	if userEmail != invitationData.Email {
		http.Error(w, `{"error":"invitation is for a different email address"}`, http.StatusForbidden)
		return
	}

	// Create membership
	var membership models.OrganizationMembership
	err = h.pool.QueryRow(ctx,
		`INSERT INTO organization_memberships (organization_id, user_id, role)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (organization_id, user_id) DO UPDATE SET role = $3, updated_at = NOW()
		 RETURNING id, organization_id, user_id, role, created_at, updated_at`,
		invitationData.OrganizationID, userID, invitationData.Role,
	).Scan(&membership.ID, &membership.OrganizationID, &membership.UserID, &membership.Role, &membership.CreatedAt, &membership.UpdatedAt)
	if err != nil {
		http.Error(w, `{"error":"failed to create membership"}`, http.StatusInternalServerError)
		return
	}

	// Delete the used invitation
	h.rdb.Del(ctx, key)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(membership)
}

// ListMembers lists all members of an organization
func (h *OrganizationHandler) ListMembers(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	orgID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid organization id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Check membership
	var role string
	err = h.pool.QueryRow(ctx,
		`SELECT role FROM organization_memberships WHERE organization_id = $1 AND user_id = $2`,
		orgID, userID,
	).Scan(&role)
	if err == pgx.ErrNoRows {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"failed to check membership"}`, http.StatusInternalServerError)
		return
	}

	// List members
	rows, err := h.pool.Query(ctx,
		`SELECT om.id, u.id, u.email, u.name, om.role, om.created_at
		 FROM organization_memberships om
		 JOIN users u ON u.id = om.user_id
		 WHERE om.organization_id = $1
		 ORDER BY om.created_at`,
		orgID,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to list members"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	members := []MemberResponse{}
	for rows.Next() {
		var member MemberResponse
		if err := rows.Scan(&member.ID, &member.UserID, &member.Email, &member.Name, &member.Role, &member.CreatedAt); err != nil {
			http.Error(w, `{"error":"failed to scan member"}`, http.StatusInternalServerError)
			return
		}
		members = append(members, member)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(members)
}

// UpdateMemberRole updates a member's role (admin only)
func (h *OrganizationHandler) UpdateMemberRole(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	orgID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid organization id"}`, http.StatusBadRequest)
		return
	}

	memberUserID, err := uuid.Parse(r.PathValue("userId"))
	if err != nil {
		http.Error(w, `{"error":"invalid user id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Check admin role
	if !h.isOrgAdmin(ctx, orgID, userID) {
		http.Error(w, `{"error":"admin access required"}`, http.StatusForbidden)
		return
	}

	var req UpdateMemberRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Role != models.RoleAdmin && req.Role != models.RoleEditor && req.Role != models.RoleViewer && req.Role != models.RoleAuditor {
		http.Error(w, `{"error":"invalid role"}`, http.StatusBadRequest)
		return
	}

	// Prevent removing last admin
	if req.Role != models.RoleAdmin {
		var adminCount int
		err = h.pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM organization_memberships WHERE organization_id = $1 AND role = 'admin'`,
			orgID,
		).Scan(&adminCount)
		if err != nil {
			http.Error(w, `{"error":"failed to check admin count"}`, http.StatusInternalServerError)
			return
		}

		// Check if target user is the only admin
		var targetRole string
		err = h.pool.QueryRow(ctx,
			`SELECT role FROM organization_memberships WHERE organization_id = $1 AND user_id = $2`,
			orgID, memberUserID,
		).Scan(&targetRole)
		if err == pgx.ErrNoRows {
			http.Error(w, `{"error":"member not found"}`, http.StatusNotFound)
			return
		}
		if err != nil {
			http.Error(w, `{"error":"failed to get member role"}`, http.StatusInternalServerError)
			return
		}

		if targetRole == "admin" && adminCount <= 1 {
			http.Error(w, `{"error":"cannot demote the last admin"}`, http.StatusBadRequest)
			return
		}
	}

	// Update role
	result, err := h.pool.Exec(ctx,
		`UPDATE organization_memberships SET role = $1, updated_at = NOW()
		 WHERE organization_id = $2 AND user_id = $3`,
		req.Role, orgID, memberUserID,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to update member role"}`, http.StatusInternalServerError)
		return
	}

	if result.RowsAffected() == 0 {
		http.Error(w, `{"error":"member not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "role updated"})
}

// RemoveMember removes a member from the organization (admin only)
func (h *OrganizationHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	orgID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid organization id"}`, http.StatusBadRequest)
		return
	}

	memberUserID, err := uuid.Parse(r.PathValue("userId"))
	if err != nil {
		http.Error(w, `{"error":"invalid user id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Check admin role (or allow self-removal)
	if memberUserID != userID && !h.isOrgAdmin(ctx, orgID, userID) {
		http.Error(w, `{"error":"admin access required"}`, http.StatusForbidden)
		return
	}

	// Prevent removing last admin
	var targetRole string
	err = h.pool.QueryRow(ctx,
		`SELECT role FROM organization_memberships WHERE organization_id = $1 AND user_id = $2`,
		orgID, memberUserID,
	).Scan(&targetRole)
	if err == pgx.ErrNoRows {
		http.Error(w, `{"error":"member not found"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"failed to get member role"}`, http.StatusInternalServerError)
		return
	}

	if targetRole == "admin" {
		var adminCount int
		err = h.pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM organization_memberships WHERE organization_id = $1 AND role = 'admin'`,
			orgID,
		).Scan(&adminCount)
		if err != nil {
			http.Error(w, `{"error":"failed to check admin count"}`, http.StatusInternalServerError)
			return
		}

		if adminCount <= 1 {
			http.Error(w, `{"error":"cannot remove the last admin"}`, http.StatusBadRequest)
			return
		}
	}

	// Remove member
	result, err := h.pool.Exec(ctx,
		`DELETE FROM organization_memberships WHERE organization_id = $1 AND user_id = $2`,
		orgID, memberUserID,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to remove member"}`, http.StatusInternalServerError)
		return
	}

	if result.RowsAffected() == 0 {
		http.Error(w, `{"error":"member not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "member removed"})
}

// UpdateBranding updates organization branding (admin only)
func (h *OrganizationHandler) UpdateBranding(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	orgID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid organization id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if !h.isOrgAdmin(ctx, orgID, userID) {
		http.Error(w, `{"error":"admin access required"}`, http.StatusForbidden)
		return
	}

	var req UpdateBrandingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Validate primary_color
	if req.PrimaryColor != nil && *req.PrimaryColor != "" && !hexColorRegex.MatchString(*req.PrimaryColor) {
		http.Error(w, `{"error":"primary_color must be a hex color like #6366f1"}`, http.StatusBadRequest)
		return
	}

	// Validate logo_data_uri
	var logoData, logoMime *string
	if req.LogoDataURI != nil && *req.LogoDataURI != "" {
		if !strings.HasPrefix(*req.LogoDataURI, "data:image/") {
			http.Error(w, `{"error":"logo_data_uri must be a data:image/ URI"}`, http.StatusBadRequest)
			return
		}
		if len(*req.LogoDataURI) > 512000 {
			http.Error(w, `{"error":"logo_data_uri exceeds 500KB limit"}`, http.StatusBadRequest)
			return
		}
		// Extract MIME type from data URI (e.g. "data:image/png;base64,..." -> "image/png")
		mime := strings.TrimPrefix(*req.LogoDataURI, "data:")
		if idx := strings.Index(mime, ";"); idx > 0 {
			mime = mime[:idx]
		}
		logoData = req.LogoDataURI
		logoMime = &mime
	}

	// Validate app_title
	if req.AppTitle != nil && len(*req.AppTitle) > 100 {
		http.Error(w, `{"error":"app_title must be 100 characters or fewer"}`, http.StatusBadRequest)
		return
	}

	// Normalize empty strings to nil for DB storage
	var primaryColor, appTitle *string
	if req.PrimaryColor != nil && *req.PrimaryColor != "" {
		primaryColor = req.PrimaryColor
	}
	if req.AppTitle != nil && *req.AppTitle != "" {
		appTitle = req.AppTitle
	}

	_, err = h.pool.Exec(ctx,
		`UPDATE organizations SET branding_primary_color=$1, branding_logo_data=$2,
		        branding_logo_mime=$3, branding_app_title=$4, updated_at=NOW()
		 WHERE id=$5`,
		primaryColor, logoData, logoMime, appTitle, orgID,
	)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"failed to update branding: %v"}`, err), http.StatusInternalServerError)
		return
	}

	// Return updated branding
	branding := models.OrgBranding{
		PrimaryColor: primaryColor,
		LogoDataURI:  logoData,
		AppTitle:     appTitle,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(branding)
}

// isOrgAdmin checks if a user is an admin of the organization
func (h *OrganizationHandler) isOrgAdmin(ctx context.Context, orgID, userID uuid.UUID) bool {
	var role string
	err := h.pool.QueryRow(ctx,
		`SELECT role FROM organization_memberships WHERE organization_id = $1 AND user_id = $2`,
		orgID, userID,
	).Scan(&role)
	return err == nil && role == "admin"
}

// isDuplicateKeyError checks if the error is a duplicate key violation
func isDuplicateKeyError(err error) bool {
	if err == nil {
		return false
	}
	return err.Error() == "ERROR: duplicate key value violates unique constraint \"organizations_slug_key\" (SQLSTATE 23505)" ||
		err.Error() == "ERROR: duplicate key value violates unique constraint \"organization_memberships_organization_id_user_id_key\" (SQLSTATE 23505)"
}
