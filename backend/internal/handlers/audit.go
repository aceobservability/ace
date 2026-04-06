package handlers

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/aceobservability/ace/backend/internal/auth"
	"github.com/aceobservability/ace/backend/internal/models"
)

// AuditHandler serves audit log endpoints.
type AuditHandler struct {
	pool *pgxpool.Pool
}

// NewAuditHandler creates an AuditHandler backed by the given connection pool.
func NewAuditHandler(pool *pgxpool.Pool) *AuditHandler {
	return &AuditHandler{pool: pool}
}

// checkOrgAuditAccess verifies the caller is a member of the org with admin or
// auditor role. Returns the role string and true on success. On failure it
// writes the HTTP error and returns false.
func (h *AuditHandler) checkOrgAuditAccess(w http.ResponseWriter, r *http.Request, orgID uuid.UUID) (string, bool) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return "", false
	}

	ctx := r.Context()
	var role string
	err := h.pool.QueryRow(ctx,
		`SELECT role FROM organization_memberships WHERE organization_id = $1 AND user_id = $2`,
		orgID, userID,
	).Scan(&role)
	if err == pgx.ErrNoRows {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return "", false
	}
	if err != nil {
		http.Error(w, `{"error":"failed to check membership"}`, http.StatusInternalServerError)
		return "", false
	}

	if role != string(models.RoleAdmin) && role != string(models.RoleAuditor) {
		http.Error(w, `{"error":"admin or auditor access required"}`, http.StatusForbidden)
		return "", false
	}

	return role, true
}

// ListAuditLog handles GET /api/orgs/{id}/audit-log
func (h *AuditHandler) ListAuditLog(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid organization id"}`, http.StatusBadRequest)
		return
	}

	if _, ok := h.checkOrgAuditAccess(w, r, orgID); !ok {
		return
	}

	// Parse query parameters
	q := r.URL.Query()
	actor := q.Get("actor")
	action := q.Get("action")
	resourceType := q.Get("resource_type")
	fromStr := q.Get("from")
	toStr := q.Get("to")

	page := 1
	if p := q.Get("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}

	limit := 50
	if l := q.Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 {
			if v > 200 {
				v = 200
			}
			limit = v
		}
	}

	// Build dynamic WHERE clause
	args := []any{orgID}
	where := "organization_id = $1"
	argIdx := 2

	if actor != "" {
		where += fmt.Sprintf(" AND actor_email ILIKE $%d", argIdx)
		args = append(args, "%"+actor+"%")
		argIdx++
	}
	if action != "" {
		where += fmt.Sprintf(" AND action = $%d", argIdx)
		args = append(args, action)
		argIdx++
	}
	if resourceType != "" {
		where += fmt.Sprintf(" AND resource_type = $%d", argIdx)
		args = append(args, resourceType)
		argIdx++
	}
	if fromStr != "" {
		if t, err := time.Parse(time.RFC3339, fromStr); err == nil {
			where += fmt.Sprintf(" AND created_at >= $%d", argIdx)
			args = append(args, t)
			argIdx++
		}
	}
	if toStr != "" {
		if t, err := time.Parse(time.RFC3339, toStr); err == nil {
			where += fmt.Sprintf(" AND created_at <= $%d", argIdx)
			args = append(args, t)
			argIdx++
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	// Count total matching rows
	var total int
	countArgs := make([]any, len(args))
	copy(countArgs, args)
	err = h.pool.QueryRow(ctx,
		"SELECT COUNT(*) FROM audit_log WHERE "+where,
		countArgs...,
	).Scan(&total)
	if err != nil {
		http.Error(w, `{"error":"failed to count audit log entries"}`, http.StatusInternalServerError)
		return
	}

	// Fetch page of rows
	offset := (page - 1) * limit
	pageArgs := append(args, limit, offset)
	rows, err := h.pool.Query(ctx,
		fmt.Sprintf(`SELECT id, organization_id, actor_id, actor_email, action,
		                    resource_type, resource_id, resource_name,
		                    outcome, ip_address, metadata, created_at
		             FROM audit_log
		             WHERE %s
		             ORDER BY created_at DESC
		             LIMIT $%d OFFSET $%d`, where, argIdx, argIdx+1),
		pageArgs...,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to query audit log"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	entries := []models.AuditLogEntry{}
	for rows.Next() {
		var e models.AuditLogEntry
		if err := rows.Scan(
			&e.ID, &e.OrganizationID, &e.ActorID, &e.ActorEmail, &e.Action,
			&e.ResourceType, &e.ResourceID, &e.ResourceName,
			&e.Outcome, &e.IPAddress, &e.Metadata, &e.CreatedAt,
		); err != nil {
			http.Error(w, `{"error":"failed to scan audit log entry"}`, http.StatusInternalServerError)
			return
		}
		entries = append(entries, e)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, `{"error":"failed to read audit log entries"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"entries": entries,
		"total":   total,
		"page":    page,
		"limit":   limit,
	})
}

// ExportAuditLog handles GET /api/orgs/{id}/audit-log/export
func (h *AuditHandler) ExportAuditLog(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid organization id"}`, http.StatusBadRequest)
		return
	}

	if _, ok := h.checkOrgAuditAccess(w, r, orgID); !ok {
		return
	}

	q := r.URL.Query()
	format := q.Get("format")
	if format == "" {
		format = "csv"
	}
	if format != "csv" && format != "json" {
		http.Error(w, `{"error":"format must be csv or json"}`, http.StatusBadRequest)
		return
	}

	fromStr := q.Get("from")
	toStr := q.Get("to")

	args := []any{orgID}
	where := "organization_id = $1"
	argIdx := 2

	if fromStr != "" {
		if t, err := time.Parse(time.RFC3339, fromStr); err == nil {
			where += fmt.Sprintf(" AND created_at >= $%d", argIdx)
			args = append(args, t)
			argIdx++
		}
	}
	if toStr != "" {
		if t, err := time.Parse(time.RFC3339, toStr); err == nil {
			where += fmt.Sprintf(" AND created_at <= $%d", argIdx)
			args = append(args, t)
			_ = argIdx // suppress unused warning if no more args follow
		}
	}

	ctx := r.Context()

	rows, err := h.pool.Query(ctx,
		fmt.Sprintf(`SELECT id, organization_id, actor_id, actor_email, action,
		                    resource_type, resource_id, resource_name,
		                    outcome, ip_address, created_at
		             FROM audit_log
		             WHERE %s
		             ORDER BY created_at DESC
		             LIMIT 100000`, where),
		args...,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to query audit log"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	filename := "audit-log-" + orgID.String()

	if format == "csv" {
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`.csv"`)

		cw := csv.NewWriter(w)
		// Write header
		cw.Write([]string{
			"id", "organization_id", "actor_id", "actor_email", "action",
			"resource_type", "resource_id", "resource_name",
			"outcome", "ip_address", "created_at",
		})

		for rows.Next() {
			var (
				id, orgIDVal                          uuid.UUID
				actorID                               *uuid.UUID
				actorEmail, action, outcome           string
				resourceType, resourceName, ipAddress *string
				resourceID                            *uuid.UUID
				createdAt                             time.Time
			)
			if err := rows.Scan(
				&id, &orgIDVal, &actorID, &actorEmail, &action,
				&resourceType, &resourceID, &resourceName,
				&outcome, &ipAddress, &createdAt,
			); err != nil {
				// Headers already sent — best effort: flush what we have
				cw.Flush()
				return
			}
			cw.Write([]string{
				id.String(),
				orgIDVal.String(),
				uuidPtrToStr(actorID),
				actorEmail,
				action,
				strPtrToStr(resourceType),
				uuidPtrToStr(resourceID),
				strPtrToStr(resourceName),
				outcome,
				strPtrToStr(ipAddress),
				createdAt.UTC().Format(time.RFC3339),
			})
		}
		cw.Flush()
		return
	}

	// JSON streaming
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`.json"`)

	w.Write([]byte("["))
	first := true
	for rows.Next() {
		var (
			id, orgIDVal                          uuid.UUID
			actorID                               *uuid.UUID
			actorEmail, action, outcome           string
			resourceType, resourceName, ipAddress *string
			resourceID                            *uuid.UUID
			createdAt                             time.Time
		)
		if err := rows.Scan(
			&id, &orgIDVal, &actorID, &actorEmail, &action,
			&resourceType, &resourceID, &resourceName,
			&outcome, &ipAddress, &createdAt,
		); err != nil {
			// Best effort
			break
		}

		entry := models.AuditLogEntry{
			ID:             id,
			OrganizationID: orgIDVal,
			ActorID:        actorID,
			ActorEmail:     actorEmail,
			Action:         action,
			ResourceType:   resourceType,
			ResourceID:     resourceID,
			ResourceName:   resourceName,
			Outcome:        outcome,
			IPAddress:      ipAddress,
			CreatedAt:      createdAt,
		}
		data, err := json.Marshal(entry)
		if err != nil {
			break
		}
		if !first {
			w.Write([]byte(","))
		}
		w.Write(data)
		first = false
	}
	w.Write([]byte("]"))
}

func uuidPtrToStr(u *uuid.UUID) string {
	if u == nil {
		return ""
	}
	return u.String()
}

func strPtrToStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
