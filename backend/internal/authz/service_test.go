package authz

import (
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/janhoon/dash/backend/internal/db"
	"github.com/janhoon/dash/backend/internal/models"
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

func TestResolvePermission_DirectUserGrant(t *testing.T) {
	if testPool == nil {
		t.Skip("database not available")
	}

	ctx := context.Background()
	prefix := "authz-test-direct-" + uuid.NewString()
	defer cleanupTestData(t, ctx, prefix)

	orgID := createTestOrganization(t, ctx, prefix)
	userID := createTestUser(t, ctx, prefix+"-viewer@example.com")
	addMembership(t, ctx, orgID, userID, models.RoleViewer)
	dashboardID := createTestDashboard(t, ctx, orgID, "Direct Grant Dashboard")

	grantPermission(t, ctx, orgID, ResourceTypeDashboard, dashboardID, "user", userID, PermissionEdit)

	service := NewService(testPool)
	permission, err := service.ResolvePermission(ctx, userID, orgID, ResourceTypeDashboard, dashboardID)
	if err != nil {
		t.Fatalf("expected no error resolving permission: %v", err)
	}

	if permission != PermissionEdit {
		t.Fatalf("expected permission %q, got %q", PermissionEdit, permission)
	}

	canEdit, err := service.Can(ctx, userID, orgID, ResourceTypeDashboard, dashboardID, ActionEdit)
	if err != nil {
		t.Fatalf("expected no error checking edit action: %v", err)
	}
	if !canEdit {
		t.Fatal("expected user to be allowed to edit")
	}

	canAdmin, err := service.Can(ctx, userID, orgID, ResourceTypeDashboard, dashboardID, ActionAdmin)
	if err != nil {
		t.Fatalf("expected no error checking admin action: %v", err)
	}
	if canAdmin {
		t.Fatal("expected user to be denied admin action")
	}
}

func TestResolvePermission_GroupGrant(t *testing.T) {
	if testPool == nil {
		t.Skip("database not available")
	}

	ctx := context.Background()
	prefix := "authz-test-group-" + uuid.NewString()
	defer cleanupTestData(t, ctx, prefix)

	orgID := createTestOrganization(t, ctx, prefix)
	userID := createTestUser(t, ctx, prefix+"-viewer@example.com")
	addMembership(t, ctx, orgID, userID, models.RoleViewer)
	folderID := createTestFolder(t, ctx, orgID, "Ops Folder")

	groupID := createTestGroup(t, ctx, orgID, "Ops Team")
	addGroupMembership(t, ctx, orgID, groupID, userID)
	grantPermission(t, ctx, orgID, ResourceTypeFolder, folderID, "group", groupID, PermissionAdmin)

	service := NewService(testPool)
	permission, err := service.ResolvePermission(ctx, userID, orgID, ResourceTypeFolder, folderID)
	if err != nil {
		t.Fatalf("expected no error resolving permission: %v", err)
	}

	if permission != PermissionAdmin {
		t.Fatalf("expected permission %q, got %q", PermissionAdmin, permission)
	}
}

func TestResolvePermission_GroupGrantRevokedByMembershipRemoval(t *testing.T) {
	if testPool == nil {
		t.Skip("database not available")
	}

	ctx := context.Background()
	prefix := "authz-test-group-revoke-" + uuid.NewString()
	defer cleanupTestData(t, ctx, prefix)

	orgID := createTestOrganization(t, ctx, prefix)
	userID := createTestUser(t, ctx, prefix+"-viewer@example.com")
	addMembership(t, ctx, orgID, userID, models.RoleViewer)
	folderID := createTestFolder(t, ctx, orgID, "Revoke Folder")

	groupID := createTestGroup(t, ctx, orgID, "Revoke Team")
	addGroupMembership(t, ctx, orgID, groupID, userID)
	grantPermission(t, ctx, orgID, ResourceTypeFolder, folderID, "group", groupID, PermissionEdit)

	service := NewService(testPool)

	beforeRevoke, err := service.ResolvePermission(ctx, userID, orgID, ResourceTypeFolder, folderID)
	if err != nil {
		t.Fatalf("expected no error resolving permission before revoke: %v", err)
	}
	if beforeRevoke != PermissionEdit {
		t.Fatalf("expected permission %q before revoke, got %q", PermissionEdit, beforeRevoke)
	}

	if _, err := testPool.Exec(ctx,
		`DELETE FROM user_group_memberships WHERE organization_id = $1 AND group_id = $2 AND user_id = $3`,
		orgID,
		groupID,
		userID,
	); err != nil {
		t.Fatalf("failed to remove group membership: %v", err)
	}

	afterRevoke, err := service.ResolvePermission(ctx, userID, orgID, ResourceTypeFolder, folderID)
	if err != nil {
		t.Fatalf("expected no error resolving permission after revoke: %v", err)
	}
	if afterRevoke != PermissionNone {
		t.Fatalf("expected permission %q after revoke, got %q", PermissionNone, afterRevoke)
	}
}

func TestResolvePermission_OrgRoleFallbackWithoutACL(t *testing.T) {
	if testPool == nil {
		t.Skip("database not available")
	}

	ctx := context.Background()
	prefix := "authz-test-fallback-" + uuid.NewString()
	defer cleanupTestData(t, ctx, prefix)

	orgID := createTestOrganization(t, ctx, prefix)
	viewerID := createTestUser(t, ctx, prefix+"-viewer@example.com")
	editorID := createTestUser(t, ctx, prefix+"-editor@example.com")
	addMembership(t, ctx, orgID, viewerID, models.RoleViewer)
	addMembership(t, ctx, orgID, editorID, models.RoleEditor)
	dashboardID := createTestDashboard(t, ctx, orgID, "Fallback Dashboard")

	service := NewService(testPool)

	viewerPermission, err := service.ResolvePermission(ctx, viewerID, orgID, ResourceTypeDashboard, dashboardID)
	if err != nil {
		t.Fatalf("expected no error resolving viewer permission: %v", err)
	}
	if viewerPermission != PermissionView {
		t.Fatalf("expected viewer fallback permission %q, got %q", PermissionView, viewerPermission)
	}

	editorPermission, err := service.ResolvePermission(ctx, editorID, orgID, ResourceTypeDashboard, dashboardID)
	if err != nil {
		t.Fatalf("expected no error resolving editor permission: %v", err)
	}
	if editorPermission != PermissionEdit {
		t.Fatalf("expected editor fallback permission %q, got %q", PermissionEdit, editorPermission)
	}
}

func TestResolvePermission_AdminAndFailClosedBehavior(t *testing.T) {
	if testPool == nil {
		t.Skip("database not available")
	}

	ctx := context.Background()
	prefix := "authz-test-admin-" + uuid.NewString()
	defer cleanupTestData(t, ctx, prefix)

	orgID := createTestOrganization(t, ctx, prefix)
	adminID := createTestUser(t, ctx, prefix+"-admin@example.com")
	viewerID := createTestUser(t, ctx, prefix+"-viewer@example.com")
	outsiderID := createTestUser(t, ctx, prefix+"-outsider@example.com")
	otherUserID := createTestUser(t, ctx, prefix+"-other@example.com")

	addMembership(t, ctx, orgID, adminID, models.RoleAdmin)
	addMembership(t, ctx, orgID, viewerID, models.RoleViewer)
	addMembership(t, ctx, orgID, otherUserID, models.RoleViewer)

	dashboardID := createTestDashboard(t, ctx, orgID, "ACL Dashboard")
	grantPermission(t, ctx, orgID, ResourceTypeDashboard, dashboardID, "user", otherUserID, PermissionView)

	service := NewService(testPool)

	adminPermission, err := service.ResolvePermission(ctx, adminID, orgID, ResourceTypeDashboard, dashboardID)
	if err != nil {
		t.Fatalf("expected no error resolving admin permission: %v", err)
	}
	if adminPermission != PermissionAdmin {
		t.Fatalf("expected admin permission %q, got %q", PermissionAdmin, adminPermission)
	}

	viewerPermission, err := service.ResolvePermission(ctx, viewerID, orgID, ResourceTypeDashboard, dashboardID)
	if err != nil {
		t.Fatalf("expected no error resolving viewer permission: %v", err)
	}
	if viewerPermission != PermissionNone {
		t.Fatalf("expected viewer permission %q when acl excludes user, got %q", PermissionNone, viewerPermission)
	}

	outsiderPermission, err := service.ResolvePermission(ctx, outsiderID, orgID, ResourceTypeDashboard, dashboardID)
	if err != nil {
		t.Fatalf("expected no error resolving outsider permission: %v", err)
	}
	if outsiderPermission != PermissionNone {
		t.Fatalf("expected outsider permission %q, got %q", PermissionNone, outsiderPermission)
	}

	unknownResourcePermission, err := service.ResolvePermission(ctx, viewerID, orgID, ResourceTypeDashboard, uuid.New())
	if err != nil {
		t.Fatalf("expected no error resolving unknown resource permission: %v", err)
	}
	if unknownResourcePermission != PermissionNone {
		t.Fatalf("expected unknown resource permission %q, got %q", PermissionNone, unknownResourcePermission)
	}
}

func TestOrgRoleFallbackPermission_Auditor(t *testing.T) {
	tests := []struct {
		name         string
		resourceType ResourceType
		expected     Permission
	}{
		{
			name:         "Auditor on folder gets view",
			resourceType: ResourceTypeFolder,
			expected:     PermissionView,
		},
		{
			name:         "Auditor on dashboard gets view",
			resourceType: ResourceTypeDashboard,
			expected:     PermissionView,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := orgRoleFallbackPermission(models.RoleAuditor, tc.resourceType)
			if got != tc.expected {
				t.Fatalf("expected permission %q, got %q", tc.expected, got)
			}
		})
	}
}

func TestResolvePermission_AuditorNoACL(t *testing.T) {
	if testPool == nil {
		t.Skip("database not available")
	}

	ctx := context.Background()
	prefix := "authz-test-auditor-" + uuid.NewString()
	defer cleanupTestData(t, ctx, prefix)

	orgID := createTestOrganization(t, ctx, prefix)
	auditorID := createTestUser(t, ctx, prefix+"-auditor@example.com")
	addMembership(t, ctx, orgID, auditorID, models.RoleAuditor)
	dashboardID := createTestDashboard(t, ctx, orgID, "Auditor Dashboard")

	service := NewService(testPool)

	// Auditor with no ACL on a dashboard should resolve to PermissionView
	permission, err := service.ResolvePermission(ctx, auditorID, orgID, ResourceTypeDashboard, dashboardID)
	if err != nil {
		t.Fatalf("expected no error resolving auditor permission: %v", err)
	}
	if permission != PermissionView {
		t.Fatalf("expected auditor fallback permission %q, got %q", PermissionView, permission)
	}

	// Auditor should NOT be able to edit a dashboard
	canEdit, err := service.Can(ctx, auditorID, orgID, ResourceTypeDashboard, dashboardID, ActionEdit)
	if err != nil {
		t.Fatalf("expected no error checking edit action: %v", err)
	}
	if canEdit {
		t.Fatal("expected auditor to be denied edit action")
	}

	// Auditor should be able to view a dashboard
	canView, err := service.Can(ctx, auditorID, orgID, ResourceTypeDashboard, dashboardID, ActionView)
	if err != nil {
		t.Fatalf("expected no error checking view action: %v", err)
	}
	if !canView {
		t.Fatal("expected auditor to be allowed to view")
	}
}

func cleanupTestData(t *testing.T, ctx context.Context, prefix string) {
	t.Helper()

	if _, err := testPool.Exec(ctx,
		`DELETE FROM organizations WHERE slug = $1`,
		prefix,
	); err != nil {
		t.Fatalf("failed to cleanup organizations: %v", err)
	}

	if _, err := testPool.Exec(ctx,
		`DELETE FROM users WHERE email LIKE $1`,
		fmt.Sprintf("%s-%%@example.com", prefix),
	); err != nil {
		t.Fatalf("failed to cleanup users: %v", err)
	}
}

func createTestOrganization(t *testing.T, ctx context.Context, prefix string) uuid.UUID {
	t.Helper()

	var orgID uuid.UUID
	err := testPool.QueryRow(ctx,
		`INSERT INTO organizations (name, slug)
		 VALUES ($1, $2)
		 RETURNING id`,
		"Authz Test Org",
		prefix,
	).Scan(&orgID)
	if err != nil {
		t.Fatalf("failed to create organization: %v", err)
	}

	return orgID
}

func createTestUser(t *testing.T, ctx context.Context, email string) uuid.UUID {
	t.Helper()

	var userID uuid.UUID
	err := testPool.QueryRow(ctx,
		`INSERT INTO users (email)
		 VALUES ($1)
		 RETURNING id`,
		email,
	).Scan(&userID)
	if err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	return userID
}

func addMembership(t *testing.T, ctx context.Context, orgID, userID uuid.UUID, role models.MembershipRole) {
	t.Helper()

	if _, err := testPool.Exec(ctx,
		`INSERT INTO organization_memberships (organization_id, user_id, role)
		 VALUES ($1, $2, $3)`,
		orgID,
		userID,
		role,
	); err != nil {
		t.Fatalf("failed to add membership: %v", err)
	}
}

func createTestDashboard(t *testing.T, ctx context.Context, orgID uuid.UUID, title string) uuid.UUID {
	t.Helper()

	var dashboardID uuid.UUID
	err := testPool.QueryRow(ctx,
		`INSERT INTO dashboards (title, organization_id)
		 VALUES ($1, $2)
		 RETURNING id`,
		title,
		orgID,
	).Scan(&dashboardID)
	if err != nil {
		t.Fatalf("failed to create dashboard: %v", err)
	}

	return dashboardID
}

func createTestFolder(t *testing.T, ctx context.Context, orgID uuid.UUID, name string) uuid.UUID {
	t.Helper()

	var folderID uuid.UUID
	err := testPool.QueryRow(ctx,
		`INSERT INTO folders (organization_id, name)
		 VALUES ($1, $2)
		 RETURNING id`,
		orgID,
		name,
	).Scan(&folderID)
	if err != nil {
		t.Fatalf("failed to create folder: %v", err)
	}

	return folderID
}

func createTestGroup(t *testing.T, ctx context.Context, orgID uuid.UUID, name string) uuid.UUID {
	t.Helper()

	var groupID uuid.UUID
	err := testPool.QueryRow(ctx,
		`INSERT INTO user_groups (organization_id, name)
		 VALUES ($1, $2)
		 RETURNING id`,
		orgID,
		name,
	).Scan(&groupID)
	if err != nil {
		t.Fatalf("failed to create group: %v", err)
	}

	return groupID
}

func addGroupMembership(t *testing.T, ctx context.Context, orgID, groupID, userID uuid.UUID) {
	t.Helper()

	if _, err := testPool.Exec(ctx,
		`INSERT INTO user_group_memberships (organization_id, group_id, user_id)
		 VALUES ($1, $2, $3)`,
		orgID,
		groupID,
		userID,
	); err != nil {
		t.Fatalf("failed to add group membership: %v", err)
	}
}

func grantPermission(
	t *testing.T,
	ctx context.Context,
	orgID uuid.UUID,
	resourceType ResourceType,
	resourceID uuid.UUID,
	principalType string,
	principalID uuid.UUID,
	permission Permission,
) {
	t.Helper()

	if _, err := testPool.Exec(ctx,
		`INSERT INTO resource_permissions (organization_id, resource_type, resource_id, principal_type, principal_id, permission)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		orgID,
		resourceType,
		resourceID,
		principalType,
		principalID,
		permission,
	); err != nil {
		t.Fatalf("failed to grant permission: %v", err)
	}
}
