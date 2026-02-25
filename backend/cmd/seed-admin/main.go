package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"regexp"
	"strings"
	"unicode"

	"github.com/google/uuid"
	"github.com/janhoon/dash/backend/internal/auth"
	"github.com/janhoon/dash/backend/internal/db"
)

var slugRegex = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,98}[a-z0-9]$`)

func main() {
	// Define flags
	email := flag.String("email", "", "Admin user email (required)")
	password := flag.String("password", "", "Admin user password (required)")
	name := flag.String("name", "", "Admin user name (optional)")
	orgName := flag.String("org", "", "Organization name (required)")
	orgSlug := flag.String("slug", "", "Organization slug (optional, derived from org name if not provided)")

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: seed-admin [options]\n\n")
		fmt.Fprintf(os.Stderr, "Create an initial admin user and organization.\n\n")
		fmt.Fprintf(os.Stderr, "Options:\n")
		flag.PrintDefaults()
		fmt.Fprintf(os.Stderr, "\nExample:\n")
		fmt.Fprintf(os.Stderr, "  go run ./cmd/seed-admin -email admin@example.com -password MyPass123 -org \"My Company\"\n")
	}

	flag.Parse()

	// Validate required fields
	if *email == "" {
		log.Fatal("Error: -email is required")
	}
	if *password == "" {
		log.Fatal("Error: -password is required")
	}
	if *orgName == "" {
		log.Fatal("Error: -org is required")
	}

	// Validate password requirements
	if err := validatePassword(*password); err != nil {
		log.Fatalf("Error: %v", err)
	}

	// Generate slug if not provided
	slug := *orgSlug
	if slug == "" {
		slug = generateSlug(*orgName)
	}

	// Validate slug
	if !slugRegex.MatchString(slug) {
		log.Fatalf("Error: invalid slug '%s'. Must be 3-100 lowercase alphanumeric characters with hyphens, starting and ending with alphanumeric", slug)
	}

	// Get database URL from environment
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://dash:dash@localhost:5432/dash?sslmode=disable"
	}

	// Connect to database
	ctx := context.Background()
	pool, err := db.Connect(ctx, dbURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()

	// Run migrations
	if err := db.RunMigrations(ctx, pool); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	// Hash password
	passwordHash, err := auth.HashPassword(*password)
	if err != nil {
		log.Fatalf("Failed to hash password: %v", err)
	}

	// Start transaction
	tx, err := pool.Begin(ctx)
	if err != nil {
		log.Fatalf("Failed to start transaction: %v", err)
	}
	defer tx.Rollback(ctx)

	// Check if user already exists
	var existingUserID uuid.UUID
	err = tx.QueryRow(ctx, "SELECT id FROM users WHERE email = $1", *email).Scan(&existingUserID)
	if err == nil {
		log.Fatalf("Error: user with email '%s' already exists", *email)
	}

	// Check if org slug already exists
	var existingOrgID uuid.UUID
	err = tx.QueryRow(ctx, "SELECT id FROM organizations WHERE slug = $1", slug).Scan(&existingOrgID)
	if err == nil {
		log.Fatalf("Error: organization with slug '%s' already exists", slug)
	}

	// Create user
	userID := uuid.New()
	var userName *string
	if *name != "" {
		userName = name
	}

	_, err = tx.Exec(ctx,
		"INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, $3, $4)",
		userID, *email, passwordHash, userName)
	if err != nil {
		log.Fatalf("Failed to create user: %v", err)
	}

	// Create organization
	orgID := uuid.New()
	_, err = tx.Exec(ctx,
		"INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)",
		orgID, *orgName, slug)
	if err != nil {
		log.Fatalf("Failed to create organization: %v", err)
	}

	// Add user as admin of organization
	membershipID := uuid.New()
	_, err = tx.Exec(ctx,
		"INSERT INTO organization_memberships (id, organization_id, user_id, role) VALUES ($1, $2, $3, $4)",
		membershipID, orgID, userID, "admin")
	if err != nil {
		log.Fatalf("Failed to create organization membership: %v", err)
	}

	defaultConnectors := []struct {
		Name string
		Type string
		URL  string
	}{
		{Name: "Prometheus", Type: "prometheus", URL: "http://prometheus:9090"},
		{Name: "VictoriaMetrics", Type: "victoriametrics", URL: "http://victoria-metrics:8428"},
		{Name: "Loki", Type: "loki", URL: "http://loki:3100"},
		{Name: "Victoria Logs", Type: "victorialogs", URL: "http://victoria-logs:9428"},
		{Name: "Tempo", Type: "tempo", URL: "http://tempo:3200"},
	}

	for _, connector := range defaultConnectors {
		_, err = tx.Exec(ctx,
			`INSERT INTO datasources (id, organization_id, name, type, url, is_default, auth_type)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			uuid.New(), orgID, connector.Name, connector.Type, connector.URL, true, "none")
		if err != nil {
			log.Fatalf("Failed to create default connector '%s': %v", connector.Name, err)
		}
	}

	// Commit transaction
	if err := tx.Commit(ctx); err != nil {
		log.Fatalf("Failed to commit transaction: %v", err)
	}

	fmt.Println("Successfully created:")
	fmt.Printf("  User:         %s (%s)\n", *email, userID)
	if userName != nil {
		fmt.Printf("  Name:         %s\n", *userName)
	}
	fmt.Printf("  Organization: %s (%s)\n", *orgName, orgID)
	fmt.Printf("  Slug:         %s\n", slug)
	fmt.Printf("  Role:         admin\n")
	fmt.Printf("  Connectors:   %d default datasources seeded\n", len(defaultConnectors))
	for _, connector := range defaultConnectors {
		fmt.Printf("    - %s (%s): %s\n", connector.Name, connector.Type, connector.URL)
	}
	fmt.Println("\nYou can now log in with these credentials.")
}

func validatePassword(password string) error {
	if len(password) < 8 {
		return fmt.Errorf("password must be at least 8 characters")
	}

	var hasUpper, hasLower, hasDigit bool
	for _, c := range password {
		switch {
		case unicode.IsUpper(c):
			hasUpper = true
		case unicode.IsLower(c):
			hasLower = true
		case unicode.IsDigit(c):
			hasDigit = true
		}
	}

	if !hasUpper {
		return fmt.Errorf("password must contain at least one uppercase letter")
	}
	if !hasLower {
		return fmt.Errorf("password must contain at least one lowercase letter")
	}
	if !hasDigit {
		return fmt.Errorf("password must contain at least one digit")
	}

	return nil
}

func generateSlug(name string) string {
	// Convert to lowercase
	slug := strings.ToLower(name)

	// Replace spaces and underscores with hyphens
	slug = strings.ReplaceAll(slug, " ", "-")
	slug = strings.ReplaceAll(slug, "_", "-")

	// Remove any character that's not alphanumeric or hyphen
	var result strings.Builder
	for _, c := range slug {
		if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' {
			result.WriteRune(c)
		}
	}
	slug = result.String()

	// Remove consecutive hyphens
	for strings.Contains(slug, "--") {
		slug = strings.ReplaceAll(slug, "--", "-")
	}

	// Trim hyphens from start and end
	slug = strings.Trim(slug, "-")

	// Ensure minimum length
	if len(slug) < 3 {
		slug = slug + "-org"
	}

	// Truncate if too long
	if len(slug) > 100 {
		slug = slug[:100]
		// Make sure it doesn't end with a hyphen after truncation
		slug = strings.TrimRight(slug, "-")
	}

	return slug
}
