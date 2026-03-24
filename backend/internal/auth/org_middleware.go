package auth

import (
	"context"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type orgIDContextKey struct{}

// GetOrgID extracts the organization ID from the request context.
// It is set by RequireOrgMember after successful membership verification.
func GetOrgID(ctx context.Context) (uuid.UUID, bool) {
	id, ok := ctx.Value(orgIDContextKey{}).(uuid.UUID)
	return id, ok
}

// WithOrgID returns a new context with the given organization ID injected.
// This is primarily useful for testing handlers that expect an org ID in context.
func WithOrgID(ctx context.Context, orgID uuid.UUID) context.Context {
	return context.WithValue(ctx, orgIDContextKey{}, orgID)
}

// RequireOrgMember is middleware that:
//  1. Parses the org UUID from the URL path parameter "id".
//  2. Verifies the authenticated user (from context) is a member of that org.
//  3. Injects the validated org ID into the request context.
//
// It must be wrapped by RequireAuth so that a user ID is already present in ctx.
// Usage: auth.RequireAuth(jwtManager, auth.RequireOrgMember(pool, handler))
func RequireOrgMember(pool *pgxpool.Pool, handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		orgID, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			http.Error(w, `{"error":"invalid organization id"}`, http.StatusBadRequest)
			return
		}

		userID, ok := GetUserID(r.Context())
		if !ok {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		var role string
		err = pool.QueryRow(r.Context(),
			`SELECT role FROM organization_memberships WHERE user_id = $1 AND organization_id = $2`,
			userID, orgID,
		).Scan(&role)
		if err != nil {
			http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
			return
		}

		ctx := context.WithValue(r.Context(), orgIDContextKey{}, orgID)
		handler(w, r.WithContext(ctx))
	}
}
