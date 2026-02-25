package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/janhoon/dash/backend/internal/db"
)

type connector struct {
	Name string
	Type string
	URL  string
}

var defaultConnectors = []connector{
	{Name: "Prometheus", Type: "prometheus", URL: "http://prometheus:9090"},
	{Name: "VictoriaMetrics", Type: "victoriametrics", URL: "http://victoria-metrics:8428"},
	{Name: "Loki", Type: "loki", URL: "http://loki:3100"},
	{Name: "Victoria Logs", Type: "victorialogs", URL: "http://victoria-logs:9428"},
	{Name: "Tempo", Type: "tempo", URL: "http://tempo:3200"},
}

func main() {
	orgSlug := flag.String("org", "default", "Organization slug")

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: seed-datasources [options]\n\n")
		fmt.Fprintf(os.Stderr, "Seed default datasources for an existing organization.\n\n")
		fmt.Fprintf(os.Stderr, "Options:\n")
		flag.PrintDefaults()
		fmt.Fprintf(os.Stderr, "\nExample:\n")
		fmt.Fprintf(os.Stderr, "  go run ./cmd/seed-datasources -org default\n")
	}

	flag.Parse()

	if *orgSlug == "" {
		log.Fatal("Error: -org is required")
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

	var orgID uuid.UUID
	err = pool.QueryRow(ctx, "SELECT id FROM organizations WHERE slug = $1", *orgSlug).Scan(&orgID)
	if err != nil {
		log.Fatalf("Failed to find organization with slug '%s': %v", *orgSlug, err)
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		log.Fatalf("Failed to start transaction: %v", err)
	}
	defer tx.Rollback(ctx)

	created := 0
	skipped := 0

	for _, ds := range defaultConnectors {
		var existingID uuid.UUID
		err = tx.QueryRow(ctx,
			`SELECT id FROM datasources WHERE organization_id = $1 AND type = $2 LIMIT 1`,
			orgID, ds.Type,
		).Scan(&existingID)
		if err == nil {
			skipped++
			continue
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			log.Fatalf("Failed to check datasource '%s': %v", ds.Name, err)
		}

		_, err = tx.Exec(ctx,
			`INSERT INTO datasources (id, organization_id, name, type, url, is_default, auth_type)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			uuid.New(), orgID, ds.Name, ds.Type, ds.URL, true, "none")
		if err != nil {
			log.Fatalf("Failed to create datasource '%s': %v", ds.Name, err)
		}

		created++
	}

	if err := tx.Commit(ctx); err != nil {
		log.Fatalf("Failed to commit transaction: %v", err)
	}

	fmt.Printf("Organization: %s (%s)\n", *orgSlug, orgID)
	fmt.Printf("Created: %d, Skipped: %d\n", created, skipped)
}
