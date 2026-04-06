# Unified Seed System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace three seed commands with a single `cmd/seed` that creates one admin user and 4 organizations (victoria, elastic, clickhouse, lgtm) with stack-appropriate datasources.

**Architecture:** Single Go CLI binary that connects to PostgreSQL, runs migrations, then idempotently seeds a user, 4 orgs, memberships, and datasources in one transaction. Reuses existing `db` and `auth` packages.

**Tech Stack:** Go, pgx/v5, existing `internal/db` and `internal/auth` packages.

---

### Task 1: Rewrite `backend/cmd/seed/main.go`

**Files:**
- Rewrite: `backend/cmd/seed/main.go`

**Step 1: Replace the file with the unified seed command**

The new `main.go` keeps the same flags (`-email`, `-password`) but removes `-org`, `-slug`, `-name` since we now seed fixed orgs. It defines 4 org configs with their datasources and creates everything idempotently.

```go
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"unicode"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/aceobservability/ace/backend/internal/auth"
	"github.com/aceobservability/ace/backend/internal/db"
)

type datasource struct {
	Name string
	Type string
	URL  string
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
			{Name: "VictoriaMetrics", Type: "victoriametrics", URL: "http://localhost:8428"},
			{Name: "Victoria Logs", Type: "victorialogs", URL: "http://localhost:9428"},
			{Name: "VictoriaTraces", Type: "victoriatraces", URL: "http://localhost:10428"},
			{Name: "VMAlert", Type: "vmalert", URL: "http://localhost:8880"},
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
			{Name: "Mimir", Type: "prometheus", URL: "http://localhost:9009"},
			{Name: "Loki", Type: "loki", URL: "http://localhost:3100"},
			{Name: "Tempo", Type: "tempo", URL: "http://localhost:3200"},
		},
	},
}

func main() {
	email := flag.String("email", "", "Admin user email (required)")
	password := flag.String("password", "", "Admin user password (required)")

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: seed [options]\n\n")
		fmt.Fprintf(os.Stderr, "Seed the database with an admin user and 4 organizations (victoria, elastic, clickhouse, lgtm)\n")
		fmt.Fprintf(os.Stderr, "with their stack-specific datasources.\n\n")
		fmt.Fprintf(os.Stderr, "Options:\n")
		flag.PrintDefaults()
		fmt.Fprintf(os.Stderr, "\nExample:\n")
		fmt.Fprintf(os.Stderr, "  go run ./cmd/seed -email admin@admin.com -password Admin1234\n")
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
	for _, o := range orgs {
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
		created := 0
		for _, ds := range o.Datasources {
			var dsID uuid.UUID
			err = tx.QueryRow(ctx,
				"SELECT id FROM datasources WHERE organization_id = $1 AND type = $2 LIMIT 1",
				orgID, ds.Type).Scan(&dsID)
			if errors.Is(err, pgx.ErrNoRows) {
				_, err = tx.Exec(ctx,
					`INSERT INTO datasources (id, organization_id, name, type, url, is_default, auth_type)
					 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
					uuid.New(), orgID, ds.Name, ds.Type, ds.URL, true, "none")
				if err != nil {
					log.Fatalf("Failed to create datasource '%s' for org '%s': %v", ds.Name, o.Slug, err)
				}
				created++
			} else if err != nil {
				log.Fatalf("Failed to check datasource '%s' for org '%s': %v", ds.Name, o.Slug, err)
			}
		}
		fmt.Printf("  Datasources: %d created, %d already existed\n", created, len(o.Datasources)-created)
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
```

**Step 2: Verify it compiles**

Run: `cd backend && go build ./cmd/seed`
Expected: no errors

**Step 3: Commit**

```bash
git add backend/cmd/seed/main.go
git commit -m "feat: rewrite seed command with 4-org multi-stack support"
```

---

### Task 2: Delete old seed commands

**Files:**
- Delete: `backend/cmd/seed-admin/main.go`
- Delete: `backend/cmd/seed-datasources/main.go`

**Step 1: Remove the directories**

```bash
rm -rf backend/cmd/seed-admin backend/cmd/seed-datasources
```

**Step 2: Verify the project still builds**

Run: `cd backend && go build ./...`
Expected: no errors (nothing imports these commands)

**Step 3: Commit**

```bash
git add -A backend/cmd/seed-admin backend/cmd/seed-datasources
git commit -m "chore: remove old seed-admin and seed-datasources commands"
```

---

### Task 3: Update Makefile

**Files:**
- Modify: `Makefile`

**Step 1: Replace seed targets in the Makefile**

Changes:
- Line 1: Update `.PHONY` — replace `seed-admin seed-datasources` with `seed`
- Lines 3-5: Remove `ORG` variable, keep `EMAIL` and `PASSWORD`
- Lines 26-29: Update help text — replace two seed lines with one `seed` line
- Lines 82-118: Replace `seed-admin` and `seed-datasources` targets with single `seed` target

The new `seed` target:
```makefile
seed:
	@set -e; \
	GO_BIN=""; \
	if [ -x "$$HOME/.go-sdk/go1.25.7/bin/go" ]; then \
		GO_BIN="$$HOME/.go-sdk/go1.25.7/bin/go"; \
	elif command -v go >/dev/null 2>&1; then \
		GO_BIN="$$(command -v go)"; \
	fi; \
	if [ -z "$$GO_BIN" ]; then \
		printf "Go is not installed.\n"; \
		printf "Install Go 1.25+ and retry make seed.\n"; \
		exit 1; \
	fi; \
	cd backend && "$$GO_BIN" run ./cmd/seed -email "$(EMAIL)" -password "$(PASSWORD)"
```

**Step 2: Verify make target works**

Run: `make seed` (with PostgreSQL running)
Expected: seeds 4 orgs with datasources

**Step 3: Commit**

```bash
git add Makefile
git commit -m "chore: replace seed-admin/seed-datasources Makefile targets with unified seed"
```

---

### Task 4: Run lint and verify

**Step 1: Run backend lint**

Run: `cd backend && golangci-lint run ./cmd/seed/...`
Expected: no issues

**Step 2: Run full backend build**

Run: `cd backend && go build ./...`
Expected: no errors
