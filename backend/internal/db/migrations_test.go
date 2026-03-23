package db

import (
	"context"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// TestRunMigrations tests that all migrations can be applied successfully
// This test requires a running PostgreSQL database
func TestRunMigrations(t *testing.T) {
	// Skip if no database URL is provided
	databaseURL := "postgres://dash:dash@localhost:5432/dash_test?sslmode=disable"

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Skipf("Skipping migration test: could not connect to database: %v", err)
	}
	defer pool.Close()

	// Clean up test database
	cleanupSQL := `
		DROP TABLE IF EXISTS audit_log CASCADE;
		DROP TABLE IF EXISTS panels CASCADE;
		DROP TABLE IF EXISTS dashboards CASCADE;
		DROP TABLE IF EXISTS resource_permissions CASCADE;
		DROP TABLE IF EXISTS user_group_memberships CASCADE;
		DROP TABLE IF EXISTS user_groups CASCADE;
		DROP TABLE IF EXISTS folders CASCADE;
		DROP TABLE IF EXISTS datasources CASCADE;
		DROP TABLE IF EXISTS data_sources CASCADE;
		DROP TABLE IF EXISTS prometheus_datasources CASCADE;
		DROP TABLE IF EXISTS sso_configs CASCADE;
		DROP TABLE IF EXISTS user_auth_methods CASCADE;
		DROP TABLE IF EXISTS organization_memberships CASCADE;
		DROP TABLE IF EXISTS users CASCADE;
		DROP TABLE IF EXISTS organizations CASCADE;
		DROP FUNCTION IF EXISTS audit_log_immutable() CASCADE;
	`
	_, err = pool.Exec(ctx, cleanupSQL)
	if err != nil {
		t.Skipf("Skipping migration test: could not clean up database: %v", err)
	}

	// Run migrations
	err = RunMigrations(ctx, pool)
	if err != nil {
		t.Fatalf("RunMigrations failed: %v", err)
	}

	// Verify tables were created
	tables := []string{
		"organizations",
		"users",
		"organization_memberships",
		"user_groups",
		"user_group_memberships",
		"resource_permissions",
		"user_auth_methods",
		"sso_configs",
		"prometheus_datasources",
		"datasources",
		"folders",
		"dashboards",
		"panels",
		"audit_log",
	}

	for _, table := range tables {
		var exists bool
		err = pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT FROM information_schema.tables
				WHERE table_name = $1
			)
		`, table).Scan(&exists)
		if err != nil {
			t.Errorf("Error checking table %s: %v", table, err)
		}
		if !exists {
			t.Errorf("Table %s was not created", table)
		}
	}

	// Verify default organization exists
	var orgCount int
	err = pool.QueryRow(ctx, `SELECT COUNT(*) FROM organizations WHERE slug = 'personal'`).Scan(&orgCount)
	if err != nil {
		t.Errorf("Error checking default organization: %v", err)
	}
	if orgCount != 1 {
		t.Errorf("Expected 1 default organization, got %d", orgCount)
	}

	// Verify organization_memberships role constraint works
	_, err = pool.Exec(ctx, `
		INSERT INTO organizations (name, slug) VALUES ('Test Org', 'test-org')
	`)
	if err != nil {
		t.Fatalf("Could not create test organization: %v", err)
	}

	_, err = pool.Exec(ctx, `
		INSERT INTO users (email) VALUES ('test@example.com')
	`)
	if err != nil {
		t.Fatalf("Could not create test user: %v", err)
	}

	_, err = pool.Exec(ctx, `
		INSERT INTO users (email) VALUES ('member@example.com')
	`)
	if err != nil {
		t.Fatalf("Could not create group member user: %v", err)
	}

	// Test valid roles (auditor is now a valid role)
	validRoles := []string{"admin", "editor", "viewer", "auditor"}
	for _, role := range validRoles {
		_, err = pool.Exec(ctx, `
			DELETE FROM organization_memberships WHERE user_id = (SELECT id FROM users WHERE email = 'test@example.com')
		`)
		if err != nil {
			t.Errorf("Could not clean up memberships: %v", err)
		}

		_, err = pool.Exec(ctx, `
			INSERT INTO organization_memberships (organization_id, user_id, role)
			SELECT o.id, u.id, $1
			FROM organizations o, users u
			WHERE o.slug = 'test-org' AND u.email = 'test@example.com'
		`, role)
		if err != nil {
			t.Errorf("Expected role '%s' to be valid, got error: %v", role, err)
		}
	}

	// Test invalid role (should fail)
	_, err = pool.Exec(ctx, `
		DELETE FROM organization_memberships WHERE user_id = (SELECT id FROM users WHERE email = 'test@example.com')
	`)
	if err != nil {
		t.Errorf("Could not clean up memberships: %v", err)
	}

	_, err = pool.Exec(ctx, `
		INSERT INTO organization_memberships (organization_id, user_id, role)
		SELECT o.id, u.id, 'invalid_role'
		FROM organizations o, users u
		WHERE o.slug = 'test-org' AND u.email = 'test@example.com'
	`)
	if err == nil {
		t.Error("Expected invalid role to fail constraint check")
	}

	_, err = pool.Exec(ctx, `
		INSERT INTO user_groups (organization_id, name)
		SELECT id, 'Platform Team'
		FROM organizations
		WHERE slug = 'test-org'
	`)
	if err != nil {
		t.Fatalf("Could not create user group: %v", err)
	}

	_, err = pool.Exec(ctx, `
		INSERT INTO user_group_memberships (organization_id, group_id, user_id)
		SELECT o.id, g.id, u.id
		FROM organizations o
		JOIN user_groups g ON g.organization_id = o.id
		JOIN users u ON u.email = 'member@example.com'
		WHERE o.slug = 'test-org' AND g.name = 'Platform Team'
	`)
	if err != nil {
		t.Fatalf("Could not create user group membership: %v", err)
	}

	_, err = pool.Exec(ctx, `
		INSERT INTO user_group_memberships (organization_id, group_id, user_id)
		SELECT o.id, g.id, u.id
		FROM organizations o
		JOIN user_groups g ON g.organization_id = o.id
		JOIN users u ON u.email = 'member@example.com'
		WHERE o.slug = 'test-org' AND g.name = 'Platform Team'
	`)
	if err == nil {
		t.Error("Expected duplicate user group membership to fail unique constraint")
	}

	_, err = pool.Exec(ctx, `
		INSERT INTO resource_permissions (organization_id, resource_type, resource_id, principal_type, principal_id, permission)
		SELECT o.id, 'folder', gen_random_uuid(), 'user', u.id, 'view'
		FROM organizations o, users u
		WHERE o.slug = 'test-org' AND u.email = 'test@example.com'
	`)
	if err != nil {
		t.Errorf("Expected user principal ACL insert to succeed, got error: %v", err)
	}

	_, err = pool.Exec(ctx, `
		INSERT INTO resource_permissions (organization_id, resource_type, resource_id, principal_type, principal_id, permission)
		SELECT o.id, 'dashboard', gen_random_uuid(), 'group', g.id, 'edit'
		FROM organizations o, user_groups g
		WHERE o.slug = 'test-org' AND g.name = 'Platform Team' AND g.organization_id = o.id
	`)
	if err != nil {
		t.Errorf("Expected group principal ACL insert to succeed, got error: %v", err)
	}

	_, err = pool.Exec(ctx, `
		INSERT INTO resource_permissions (organization_id, resource_type, resource_id, principal_type, principal_id, permission)
		SELECT o.id, 'folder', gen_random_uuid(), 'invalid_principal', u.id, 'view'
		FROM organizations o, users u
		WHERE o.slug = 'test-org' AND u.email = 'test@example.com'
	`)
	if err == nil {
		t.Error("Expected invalid principal_type to fail constraint check")
	}

	_, err = pool.Exec(ctx, `
		INSERT INTO resource_permissions (organization_id, resource_type, resource_id, principal_type, principal_id, permission)
		SELECT o.id, 'dashboard', gen_random_uuid(), 'user', u.id, 'invalid_permission'
		FROM organizations o, users u
		WHERE o.slug = 'test-org' AND u.email = 'test@example.com'
	`)
	if err == nil {
		t.Error("Expected invalid permission to fail constraint check")
	}

	// Test audit_log: INSERT succeeds
	_, err = pool.Exec(ctx, `
		INSERT INTO audit_log (organization_id, actor_email, action, outcome)
		SELECT o.id, 'test@example.com', 'dashboard.view', 'success'
		FROM organizations o
		WHERE o.slug = 'test-org'
	`)
	if err != nil {
		t.Errorf("Expected audit_log INSERT to succeed, got error: %v", err)
	}

	// Test audit_log: UPDATE is blocked by immutability trigger
	_, err = pool.Exec(ctx, `
		UPDATE audit_log SET action = 'tampered' WHERE actor_email = 'test@example.com'
	`)
	if err == nil {
		t.Error("Expected UPDATE on audit_log to be blocked by immutability trigger")
	} else if !strings.Contains(err.Error(), "immutable") {
		t.Errorf("Expected error to contain 'immutable', got: %v", err)
	}

	// Test audit_log: DELETE is blocked by immutability trigger
	_, err = pool.Exec(ctx, `
		DELETE FROM audit_log WHERE actor_email = 'test@example.com'
	`)
	if err == nil {
		t.Error("Expected DELETE on audit_log to be blocked by immutability trigger")
	} else if !strings.Contains(err.Error(), "immutable") {
		t.Errorf("Expected error to contain 'immutable', got: %v", err)
	}

	// Test cascade delete - use a separate org with no audit_log entries so delete is not blocked
	_, err = pool.Exec(ctx, `INSERT INTO organizations (name, slug) VALUES ('Cascade Test Org', 'cascade-test-org')`)
	if err != nil {
		t.Fatalf("Could not create cascade test organization: %v", err)
	}

	_, err = pool.Exec(ctx, `
		INSERT INTO organization_memberships (organization_id, user_id, role)
		SELECT o.id, u.id, 'viewer'
		FROM organizations o, users u
		WHERE o.slug = 'cascade-test-org' AND u.email = 'test@example.com'
	`)
	if err != nil {
		t.Fatalf("Could not create test membership: %v", err)
	}

	_, err = pool.Exec(ctx, `DELETE FROM organizations WHERE slug = 'cascade-test-org'`)
	if err != nil {
		t.Fatalf("Could not delete test organization: %v", err)
	}

	var membershipCount int
	err = pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM organization_memberships
		WHERE user_id = (SELECT id FROM users WHERE email = 'test@example.com')
	`).Scan(&membershipCount)
	if err != nil {
		t.Errorf("Error checking membership count: %v", err)
	}
	if membershipCount != 0 {
		t.Error("Cascade delete did not remove memberships")
	}
}

// TestDownMigration tests that migrations can be reversed
func TestDownMigration(t *testing.T) {
	// Skip if no database URL is provided
	databaseURL := "postgres://dash:dash@localhost:5432/dash_test?sslmode=disable"

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Skipf("Skipping migration test: could not connect to database: %v", err)
	}
	defer pool.Close()

	// First run up migrations
	cleanupSQL := `
		DROP TABLE IF EXISTS audit_log CASCADE;
		DROP TABLE IF EXISTS panels CASCADE;
		DROP TABLE IF EXISTS dashboards CASCADE;
		DROP TABLE IF EXISTS resource_permissions CASCADE;
		DROP TABLE IF EXISTS user_group_memberships CASCADE;
		DROP TABLE IF EXISTS user_groups CASCADE;
		DROP TABLE IF EXISTS folders CASCADE;
		DROP TABLE IF EXISTS datasources CASCADE;
		DROP TABLE IF EXISTS data_sources CASCADE;
		DROP TABLE IF EXISTS prometheus_datasources CASCADE;
		DROP TABLE IF EXISTS sso_configs CASCADE;
		DROP TABLE IF EXISTS user_auth_methods CASCADE;
		DROP TABLE IF EXISTS organization_memberships CASCADE;
		DROP TABLE IF EXISTS users CASCADE;
		DROP TABLE IF EXISTS organizations CASCADE;
		DROP FUNCTION IF EXISTS audit_log_immutable() CASCADE;
	`
	_, err = pool.Exec(ctx, cleanupSQL)
	if err != nil {
		t.Skipf("Skipping migration test: could not clean up database: %v", err)
	}

	err = RunMigrations(ctx, pool)
	if err != nil {
		t.Fatalf("RunMigrations failed: %v", err)
	}

	// Run down migrations (same as cleanup)
	_, err = pool.Exec(ctx, cleanupSQL)
	if err != nil {
		t.Fatalf("Down migration failed: %v", err)
	}

	// Verify all tables are removed
	tables := []string{
		"organizations",
		"users",
		"organization_memberships",
		"user_groups",
		"user_group_memberships",
		"resource_permissions",
		"user_auth_methods",
		"sso_configs",
		"prometheus_datasources",
		"datasources",
		"folders",
		"dashboards",
		"panels",
		"audit_log",
	}

	for _, table := range tables {
		var exists bool
		err = pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT FROM information_schema.tables
				WHERE table_name = $1
			)
		`, table).Scan(&exists)
		if err != nil {
			t.Errorf("Error checking table %s: %v", table, err)
		}
		if exists {
			t.Errorf("Table %s was not removed by down migration", table)
		}
	}
}
