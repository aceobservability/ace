package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"unicode"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/janhoon/dash/backend/internal/auth"
	"github.com/janhoon/dash/backend/internal/db"
)

type datasource struct {
	Name   string
	Type   string
	URL    string
	K8sURL string // URL when backend runs inside k8s; empty = skip in k8s mode
}

type org struct {
	Name        string
	Slug        string
	Datasources []datasource
}

var orgs = []org{
	{
		Name: "Victoria",
		Slug: "victoria",
		Datasources: []datasource{
			{Name: "VictoriaMetrics", Type: "victoriametrics", URL: "http://localhost:8428", K8sURL: "http://victoria-metrics:8428"},
			{Name: "Victoria Logs", Type: "victorialogs", URL: "http://localhost:9428", K8sURL: "http://victoria-logs:9428"},
			{Name: "VictoriaTraces", Type: "victoriatraces", URL: "http://localhost:10428", K8sURL: "http://victoria-traces:10428"},
			{Name: "VMAlert", Type: "vmalert", URL: "http://localhost:8880"},
			{Name: "AlertManager", Type: "alertmanager", URL: "http://localhost:9093"},
		},
	},
	{
		Name: "Elastic",
		Slug: "elastic",
		Datasources: []datasource{
			{Name: "Elasticsearch", Type: "elasticsearch", URL: "http://localhost:9200"},
		},
	},
	{
		Name: "ClickHouse",
		Slug: "clickhouse",
		Datasources: []datasource{
			{Name: "ClickHouse", Type: "clickhouse", URL: "http://localhost:8123"},
		},
	},
	{
		Name: "LGTM",
		Slug: "lgtm",
		Datasources: []datasource{
			{Name: "Mimir", Type: "prometheus", URL: "http://localhost:9009", K8sURL: "http://mimir:9009"},
			{Name: "Loki", Type: "loki", URL: "http://localhost:3100", K8sURL: "http://loki:3100"},
			{Name: "Tempo", Type: "tempo", URL: "http://localhost:3200", K8sURL: "http://tempo:3200"},
		},
	},
}

func main() {
	email := flag.String("email", "", "Admin user email (required)")
	password := flag.String("password", "", "Admin user password (required)")
	orgFilter := flag.String("org", "", "Seed only the named organization (e.g. victoria)")
	k8s := flag.Bool("k8s", false, "Use k8s-internal service URLs instead of localhost")

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: seed [options]\n\n")
		fmt.Fprintf(os.Stderr, "Seed the database with an admin user and organizations\n")
		fmt.Fprintf(os.Stderr, "with their stack-specific datasources.\n\n")
		fmt.Fprintf(os.Stderr, "Options:\n")
		flag.PrintDefaults()
		fmt.Fprintf(os.Stderr, "\nExamples:\n")
		fmt.Fprintf(os.Stderr, "  go run ./cmd/seed -email admin@admin.com -password Admin1234\n")
		fmt.Fprintf(os.Stderr, "  go run ./cmd/seed -email admin@admin.com -password Admin1234 -org victoria -k8s\n")
	}

	flag.Parse()

	if *email == "" {
		log.Fatal("Error: -email is required")
	}
	if *password == "" {
		log.Fatal("Error: -password is required")
	}
	if err := validatePassword(*password); err != nil {
		log.Fatalf("Error: %v", err)
	}

	// Filter orgs if requested
	seedOrgs := orgs
	if *orgFilter != "" {
		seedOrgs = nil
		for _, o := range orgs {
			if o.Slug == *orgFilter {
				seedOrgs = append(seedOrgs, o)
			}
		}
		if len(seedOrgs) == 0 {
			slugs := make([]string, len(orgs))
			for i, o := range orgs {
				slugs[i] = o.Slug
			}
			log.Fatalf("Error: unknown org %q. Available: %s", *orgFilter, strings.Join(slugs, ", "))
		}
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://dash:dash@localhost:5432/dash?sslmode=disable"
	}

	ctx := context.Background()
	pool, err := db.Connect(ctx, dbURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()

	if err := db.RunMigrations(ctx, pool); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		log.Fatalf("Failed to start transaction: %v", err)
	}
	defer tx.Rollback(ctx)

	// Create or find admin user
	var userID uuid.UUID
	err = tx.QueryRow(ctx, "SELECT id FROM users WHERE email = $1", *email).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		passwordHash, hashErr := auth.HashPassword(*password)
		if hashErr != nil {
			log.Fatalf("Failed to hash password: %v", hashErr)
		}
		userID = uuid.New()
		_, err = tx.Exec(ctx,
			"INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)",
			userID, *email, passwordHash)
		if err != nil {
			log.Fatalf("Failed to create user: %v", err)
		}
		fmt.Printf("Created user: %s (%s)\n", *email, userID)
	} else if err != nil {
		log.Fatalf("Failed to check user: %v", err)
	} else {
		fmt.Printf("User already exists: %s (%s)\n", *email, userID)
	}

	// Seed each organization
	for _, o := range seedOrgs {
		var orgID uuid.UUID
		err = tx.QueryRow(ctx, "SELECT id FROM organizations WHERE slug = $1", o.Slug).Scan(&orgID)
		if errors.Is(err, pgx.ErrNoRows) {
			orgID = uuid.New()
			_, err = tx.Exec(ctx,
				"INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)",
				orgID, o.Name, o.Slug)
			if err != nil {
				log.Fatalf("Failed to create org '%s': %v", o.Slug, err)
			}
			fmt.Printf("\nCreated org: %s (%s)\n", o.Name, orgID)
		} else if err != nil {
			log.Fatalf("Failed to check org '%s': %v", o.Slug, err)
		} else {
			fmt.Printf("\nOrg already exists: %s (%s)\n", o.Name, orgID)
		}

		// Ensure admin membership
		var membershipID uuid.UUID
		err = tx.QueryRow(ctx,
			"SELECT id FROM organization_memberships WHERE organization_id = $1 AND user_id = $2",
			orgID, userID).Scan(&membershipID)
		if errors.Is(err, pgx.ErrNoRows) {
			_, err = tx.Exec(ctx,
				"INSERT INTO organization_memberships (id, organization_id, user_id, role) VALUES ($1, $2, $3, $4)",
				uuid.New(), orgID, userID, "admin")
			if err != nil {
				log.Fatalf("Failed to create membership for org '%s': %v", o.Slug, err)
			}
			fmt.Printf("  Added admin membership\n")
		} else if err != nil {
			log.Fatalf("Failed to check membership for org '%s': %v", o.Slug, err)
		}

		// Seed datasources
		created, skipped := 0, 0
		for _, ds := range o.Datasources {
			dsURL := ds.URL
			if *k8s {
				if ds.K8sURL == "" {
					skipped++
					continue
				}
				dsURL = ds.K8sURL
			}

			var dsID uuid.UUID
			err = tx.QueryRow(ctx,
				"SELECT id FROM datasources WHERE organization_id = $1 AND type = $2 LIMIT 1",
				orgID, ds.Type).Scan(&dsID)
			if errors.Is(err, pgx.ErrNoRows) {
				_, err = tx.Exec(ctx,
					`INSERT INTO datasources (id, organization_id, name, type, url, is_default, auth_type)
					 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
					uuid.New(), orgID, ds.Name, ds.Type, dsURL, true, "none")
				if err != nil {
					log.Fatalf("Failed to create datasource '%s' for org '%s': %v", ds.Name, o.Slug, err)
				}
				created++
			} else if err != nil {
				log.Fatalf("Failed to check datasource '%s' for org '%s': %v", ds.Name, o.Slug, err)
			}
		}
		if skipped > 0 {
			fmt.Printf("  Datasources: %d created, %d skipped (no k8s URL)\n", created, skipped)
		} else {
			fmt.Printf("  Datasources: %d created, %d already existed\n", created, len(o.Datasources)-created)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		log.Fatalf("Failed to commit transaction: %v", err)
	}

	fmt.Println("\nSeed complete.")
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
