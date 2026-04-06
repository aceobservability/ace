package audit

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"

	"github.com/aceobservability/ace/backend/internal/auth"
)

// Logger writes immutable audit entries to the audit_log table.
type Logger struct {
	pool *pgxpool.Pool
}

// NewLogger creates an audit Logger backed by the given connection pool.
func NewLogger(pool *pgxpool.Pool) *Logger {
	return &Logger{pool: pool}
}

// responseWriter wraps http.ResponseWriter to capture the status code written
// by the inner handler, so the middleware can determine the outcome.
type responseWriter struct {
	http.ResponseWriter
	statusCode int
	ctx        context.Context // captures the enriched context from inner handlers
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

// Middleware is a catch-all that logs every mutating HTTP request (POST, PUT,
// DELETE) after the inner handler completes. GET, OPTIONS, and HEAD requests
// are silently skipped. Routes that do not embed an org UUID (e.g.
// /api/auth/*) are also skipped.
func (l *Logger) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Wrap the writer so we can inspect the status code afterwards.
		// Also captures the enriched context from inner handlers (e.g. RequireAuth
		// injects auth values via r.WithContext which creates a child context the
		// outer middleware can't see through r.Context() alone).
		rw := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK, ctx: r.Context()}

		// Wrap the inner handler to capture the enriched context.
		inner := http.HandlerFunc(func(w2 http.ResponseWriter, r2 *http.Request) {
			rw.ctx = r2.Context() // capture the auth-enriched context
			next.ServeHTTP(w2, r2)
		})
		inner.ServeHTTP(rw, r)

		// Only log mutating methods.
		switch r.Method {
		case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
			// fall through to logging
		default:
			return
		}

		// Extract org ID from the URL path: /api/orgs/{uuid}/...
		orgID, ok := parseOrgIDFromPath(r.URL.Path)
		if !ok {
			// Not an org-scoped route — skip silently.
			return
		}

		// Use the enriched context captured from the inner handler chain.
		ctx := rw.ctx
		action := r.Method + " " + r.URL.Path

		outcome := outcomeFromStatus(rw.statusCode)

		actorID, hasActor := auth.GetUserID(ctx)
		actorEmail, _ := auth.GetUserEmail(ctx)
		ipAddress := auth.GetIPAddress(ctx)

		var actorIDPtr *uuid.UUID
		if hasActor {
			actorIDPtr = &actorID
		}

		l.insert(ctx, orgID, actorIDPtr, actorEmail, action, "", nil, "", outcome, ipAddress)
	})
}

// Log writes a semantic audit entry with rich detail. It extracts the actor
// from the context and never panics; DB errors are logged to stderr.
func (l *Logger) Log(
	ctx context.Context,
	orgID uuid.UUID,
	action string,
	resourceType string,
	resourceID *uuid.UUID,
	resourceName string,
	outcome string,
) {
	actorID, hasActor := auth.GetUserID(ctx)
	actorEmail, _ := auth.GetUserEmail(ctx)
	ipAddress := auth.GetIPAddress(ctx)

	var actorIDPtr *uuid.UUID
	if hasActor {
		actorIDPtr = &actorID
	}

	l.insert(ctx, orgID, actorIDPtr, actorEmail, action, resourceType, resourceID, resourceName, outcome, ipAddress)
}

// insert performs the actual INSERT into audit_log. Errors are logged to
// stderr; the function never panics or returns an error to callers.
func (l *Logger) insert(
	ctx context.Context,
	orgID uuid.UUID,
	actorID *uuid.UUID,
	actorEmail string,
	action string,
	resourceType string,
	resourceID *uuid.UUID,
	resourceName string,
	outcome string,
	ipAddress string,
) {
	_, err := l.pool.Exec(ctx,
		`INSERT INTO audit_log
		    (organization_id, actor_id, actor_email, action,
		     resource_type, resource_id, resource_name,
		     outcome, ip_address)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		orgID,
		actorID, // nullable UUID pointer
		actorEmail,
		action,
		nullableString(resourceType),
		resourceID, // nullable UUID pointer
		nullableString(resourceName),
		outcome,
		nullableString(ipAddress),
	)
	if err != nil {
		zap.L().Error("failed to write audit log entry", zap.Error(err))
	}
}

// parseOrgIDFromPath extracts the org UUID from a path of the form
// /api/orgs/{uuid}/... and returns it. Returns false if the path does not
// match the expected pattern or the segment is not a valid UUID.
func parseOrgIDFromPath(path string) (uuid.UUID, bool) {
	const prefix = "/api/orgs/"
	if !strings.HasPrefix(path, prefix) {
		return uuid.UUID{}, false
	}

	rest := path[len(prefix):]
	// The UUID occupies everything up to the next slash (or end of string).
	idx := strings.Index(rest, "/")
	var segment string
	if idx == -1 {
		segment = rest
	} else {
		segment = rest[:idx]
	}

	orgID, err := uuid.Parse(segment)
	if err != nil {
		return uuid.UUID{}, false
	}

	return orgID, true
}

// outcomeFromStatus maps an HTTP status code to an audit outcome.
// 2xx = "success", 5xx = "error" (server failure), everything else = "denied".
func outcomeFromStatus(code int) string {
	switch {
	case code >= 200 && code < 300:
		return "success"
	case code >= 500:
		return "error"
	default:
		return "denied"
	}
}

// nullableString converts an empty string to nil so pgx stores NULL rather
// than an empty string for optional text columns.
func nullableString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
