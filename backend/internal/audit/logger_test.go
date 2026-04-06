package audit

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/aceobservability/ace/backend/internal/auth"
	"github.com/aceobservability/ace/backend/internal/db"
)

var testPool *pgxpool.Pool

func TestMain(m *testing.M) {
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://dash:dash@localhost:5432/dash_test?sslmode=disable"
	}

	ctx := context.Background()
	pool, err := db.Connect(ctx, dbURL)
	if err != nil {
		// DB not available — skip all tests gracefully
		os.Exit(0)
	}

	if err := db.RunMigrations(ctx, pool); err != nil {
		pool.Close()
		os.Exit(1)
	}

	testPool = pool

	code := m.Run()

	pool.Close()
	os.Exit(code)
}

// seedOrg inserts a minimal org and returns its ID. Used to satisfy the
// audit_log.organization_id FK constraint.
func seedOrg(t *testing.T, ctx context.Context) uuid.UUID {
	t.Helper()
	var orgID uuid.UUID
	err := testPool.QueryRow(ctx,
		`INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id`,
		"Audit Test Org "+uuid.NewString(),
		"audit-test-"+uuid.NewString(),
	).Scan(&orgID)
	if err != nil {
		t.Fatalf("seedOrg: %v", err)
	}
	return orgID
}

// seedUser inserts a minimal user and returns its ID.
func seedUser(t *testing.T, ctx context.Context) uuid.UUID {
	t.Helper()
	var userID uuid.UUID
	err := testPool.QueryRow(ctx,
		`INSERT INTO users (email) VALUES ($1) RETURNING id`,
		"audit-actor-"+uuid.NewString()+"@example.com",
	).Scan(&userID)
	if err != nil {
		t.Fatalf("seedUser: %v", err)
	}
	return userID
}

// cleanup removes audit_log rows (bypassing the immutability trigger), the
// org, and any extra users. Order matters:
//  1. Disable row-level triggers (session_replication_role = replica).
//  2. Delete audit_log rows for the org (avoids FK cascade UPDATE on actor_id).
//  3. Re-enable triggers.
//  4. Delete the org (no more audit_log rows to cascade-block us).
//  5. Delete any extra users.
func cleanup(t *testing.T, ctx context.Context, orgID uuid.UUID, userIDs ...uuid.UUID) {
	t.Helper()

	// Use a dedicated connection so session settings stay isolated.
	conn, err := testPool.Acquire(ctx)
	if err != nil {
		t.Fatalf("cleanup acquire conn: %v", err)
	}
	defer conn.Release()

	if _, err := conn.Exec(ctx, `SET session_replication_role = replica`); err != nil {
		t.Fatalf("cleanup disable triggers: %v", err)
	}
	if _, err := conn.Exec(ctx, `DELETE FROM audit_log WHERE organization_id = $1`, orgID); err != nil {
		t.Fatalf("cleanup delete audit_log: %v", err)
	}
	if _, err := conn.Exec(ctx, `SET session_replication_role = DEFAULT`); err != nil {
		t.Fatalf("cleanup restore triggers: %v", err)
	}
	if _, err := conn.Exec(ctx, `DELETE FROM organizations WHERE id = $1`, orgID); err != nil {
		t.Fatalf("cleanup delete org: %v", err)
	}
	for _, uid := range userIDs {
		if _, err := conn.Exec(ctx, `DELETE FROM users WHERE id = $1`, uid); err != nil {
			t.Fatalf("cleanup delete user %s: %v", uid, err)
		}
	}
}

// countAuditRows returns the number of audit_log rows for the given org.
func countAuditRows(t *testing.T, ctx context.Context, orgID uuid.UUID) int {
	t.Helper()
	var n int
	err := testPool.QueryRow(ctx,
		`SELECT COUNT(*) FROM audit_log WHERE organization_id = $1`, orgID,
	).Scan(&n)
	if err != nil {
		t.Fatalf("countAuditRows: %v", err)
	}
	return n
}

// injectActorContext adds actor_id, actor_email, and ip_address into ctx,
// simulating what auth.AuthMiddleware does.
func injectActorContext(ctx context.Context, userID uuid.UUID, email, ip string) context.Context {
	ctx = context.WithValue(ctx, auth.UserIDKey, userID)
	ctx = context.WithValue(ctx, auth.UserEmailKey, email)
	ctx = context.WithValue(ctx, auth.IPAddressKey, ip)
	return ctx
}

// --- TestLog_HappyPath -------------------------------------------------------

func TestLog_HappyPath(t *testing.T) {
	if testPool == nil {
		t.Skip("database not available")
	}

	ctx := context.Background()
	orgID := seedOrg(t, ctx)

	// Use a real DB user so the actor_id FK is satisfied.
	userID := seedUser(t, ctx)
	defer cleanup(t, ctx, orgID, userID)

	email := "alice@example.com"
	ip := "10.0.0.1"
	ctx = injectActorContext(ctx, userID, email, ip)

	logger := NewLogger(testPool)

	resID := uuid.New()
	logger.Log(ctx, orgID, "dashboard.create", "dashboard", &resID, "My Dashboard", "success")

	// Give async nothing to wait for — Log is synchronous — just verify.
	n := countAuditRows(t, ctx, orgID)
	if n != 1 {
		t.Fatalf("expected 1 audit row, got %d", n)
	}

	// Verify the stored fields.
	var (
		storedAction       string
		storedResourceType string
		storedResourceName string
		storedOutcome      string
		storedActorEmail   string
		storedIPAddress    string
	)
	err := testPool.QueryRow(ctx,
		`SELECT action, resource_type, resource_name, outcome, actor_email, ip_address
		 FROM audit_log WHERE organization_id = $1`,
		orgID,
	).Scan(&storedAction, &storedResourceType, &storedResourceName, &storedOutcome, &storedActorEmail, &storedIPAddress)
	if err != nil {
		t.Fatalf("query audit row: %v", err)
	}

	if storedAction != "dashboard.create" {
		t.Errorf("action: got %q, want %q", storedAction, "dashboard.create")
	}
	if storedResourceType != "dashboard" {
		t.Errorf("resource_type: got %q, want %q", storedResourceType, "dashboard")
	}
	if storedResourceName != "My Dashboard" {
		t.Errorf("resource_name: got %q, want %q", storedResourceName, "My Dashboard")
	}
	if storedOutcome != "success" {
		t.Errorf("outcome: got %q, want %q", storedOutcome, "success")
	}
	if storedActorEmail != email {
		t.Errorf("actor_email: got %q, want %q", storedActorEmail, email)
	}
	if storedIPAddress != ip {
		t.Errorf("ip_address: got %q, want %q", storedIPAddress, ip)
	}
}

// --- TestLog_MissingActorContext ---------------------------------------------

func TestLog_MissingActorContext(t *testing.T) {
	if testPool == nil {
		t.Skip("database not available")
	}

	// Must not panic even without actor context values.
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("Log panicked with missing actor context: %v", r)
		}
	}()

	ctx := context.Background() // no actor values
	orgID := seedOrg(t, ctx)
	defer cleanup(t, ctx, orgID)

	logger := NewLogger(testPool)
	logger.Log(ctx, orgID, "dashboard.delete", "dashboard", nil, "Gone Dashboard", "success")

	// Row should still be inserted with empty actor fields.
	n := countAuditRows(t, ctx, orgID)
	if n != 1 {
		t.Fatalf("expected 1 audit row even with missing actor, got %d", n)
	}

	var actorEmail string
	err := testPool.QueryRow(ctx,
		`SELECT actor_email FROM audit_log WHERE organization_id = $1`, orgID,
	).Scan(&actorEmail)
	if err != nil {
		t.Fatalf("query audit row: %v", err)
	}
	if actorEmail != "" {
		t.Errorf("expected empty actor_email with missing context, got %q", actorEmail)
	}
}

// --- TestMiddleware_LogsMutatingRequests ------------------------------------

func TestMiddleware_LogsMutatingRequests(t *testing.T) {
	if testPool == nil {
		t.Skip("database not available")
	}

	ctx := context.Background()
	orgID := seedOrg(t, ctx)

	// Use a real DB user so the actor_id FK is satisfied.
	userID := seedUser(t, ctx)
	defer cleanup(t, ctx, orgID, userID)

	email := "bob@example.com"
	ip := "192.168.1.1"

	logger := NewLogger(testPool)

	// Build a handler that simply returns 201.
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
	})
	handler := logger.Middleware(inner)

	path := "/api/orgs/" + orgID.String() + "/dashboards"
	req := httptest.NewRequest(http.MethodPost, path, nil)
	// Inject actor context into the request context.
	reqCtx := injectActorContext(req.Context(), userID, email, ip)
	req = req.WithContext(reqCtx)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("expected status 201, got %d", rr.Code)
	}

	n := countAuditRows(t, ctx, orgID)
	if n != 1 {
		t.Fatalf("expected 1 audit row after POST, got %d", n)
	}

	var storedAction, storedOutcome string
	err := testPool.QueryRow(ctx,
		`SELECT action, outcome FROM audit_log WHERE organization_id = $1`, orgID,
	).Scan(&storedAction, &storedOutcome)
	if err != nil {
		t.Fatalf("query audit row: %v", err)
	}

	expectedAction := "POST " + path
	if storedAction != expectedAction {
		t.Errorf("action: got %q, want %q", storedAction, expectedAction)
	}
	if storedOutcome != "success" {
		t.Errorf("outcome: got %q, want %q", storedOutcome, "success")
	}
}

// --- TestMiddleware_SkipsGetRequests ----------------------------------------

func TestMiddleware_SkipsGetRequests(t *testing.T) {
	if testPool == nil {
		t.Skip("database not available")
	}

	ctx := context.Background()
	orgID := seedOrg(t, ctx)
	defer cleanup(t, ctx, orgID)

	logger := NewLogger(testPool)

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := logger.Middleware(inner)

	path := "/api/orgs/" + orgID.String() + "/dashboards"
	req := httptest.NewRequest(http.MethodGet, path, nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	n := countAuditRows(t, ctx, orgID)
	if n != 0 {
		t.Fatalf("expected 0 audit rows for GET request, got %d", n)
	}
}

// --- TestMiddleware_DeniedOutcome -------------------------------------------

func TestMiddleware_DeniedOutcome(t *testing.T) {
	if testPool == nil {
		t.Skip("database not available")
	}

	ctx := context.Background()
	orgID := seedOrg(t, ctx)

	// Use a real DB user so the actor_id FK is satisfied.
	userID := seedUser(t, ctx)
	defer cleanup(t, ctx, orgID, userID)

	logger := NewLogger(testPool)

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	})
	handler := logger.Middleware(inner)

	path := "/api/orgs/" + orgID.String() + "/dashboards"
	req := httptest.NewRequest(http.MethodDelete, path, nil)
	reqCtx := injectActorContext(req.Context(), userID, "mallory@example.com", "1.2.3.4")
	req = req.WithContext(reqCtx)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	var storedOutcome string
	err := testPool.QueryRow(ctx,
		`SELECT outcome FROM audit_log WHERE organization_id = $1`, orgID,
	).Scan(&storedOutcome)
	if err != nil {
		t.Fatalf("query audit row: %v", err)
	}
	if storedOutcome != "denied" {
		t.Errorf("outcome: got %q, want %q", storedOutcome, "denied")
	}
}

// --- TestMiddleware_SkipsNonOrgRoutes ----------------------------------------

func TestMiddleware_SkipsNonOrgRoutes(t *testing.T) {
	if testPool == nil {
		t.Skip("database not available")
	}

	ctx := context.Background()
	orgID := seedOrg(t, ctx)
	defer cleanup(t, ctx, orgID)

	logger := NewLogger(testPool)

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := logger.Middleware(inner)

	// /api/auth/* — no org ID in path, should be silently skipped.
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader("{}"))
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	n := countAuditRows(t, ctx, orgID)
	if n != 0 {
		t.Fatalf("expected 0 audit rows for non-org route, got %d", n)
	}
}
