package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/aceobservability/ace/backend/internal/db"
)

// panel describes a single panel to create inside a dashboard.
type panel struct {
	Title   string
	Type    string
	GridPos map[string]int
	Query   map[string]any
}

// dashboardDef is the static definition of a default dashboard.
type dashboardDef struct {
	Title          string
	Description    string
	DatasourceType string // matched against datasources.type
	Panels         []panel
}

// defaultDashboards returns the built-in dashboard definitions.
// datasource_id is injected at seed time after lookup.
func defaultDashboards() []dashboardDef {
	return []dashboardDef{
		prometheusDashboard(),
		victoriaMetricsDashboard(),
		lokiDashboard(),
		victoriaLogsDashboard(),
		tempoDashboard(),
	}
}

func prometheusDashboard() dashboardDef {
	return dashboardDef{
		Title:          "Prometheus — Self-Monitoring",
		Description:    "Prometheus server health and performance metrics",
		DatasourceType: "prometheus",
		Panels: []panel{
			{
				Title:   "Process CPU Usage",
				Type:    "line_chart",
				GridPos: map[string]int{"x": 0, "y": 0, "w": 6, "h": 4},
				Query:   map[string]any{"expr": `rate(process_cpu_seconds_total[5m])`, "signal": "metrics"},
			},
			{
				Title:   "Heap Memory Allocated",
				Type:    "line_chart",
				GridPos: map[string]int{"x": 6, "y": 0, "w": 6, "h": 4},
				Query:   map[string]any{"expr": `go_memstats_heap_alloc_bytes`, "signal": "metrics"},
			},
			{
				Title:   "Goroutines",
				Type:    "line_chart",
				GridPos: map[string]int{"x": 0, "y": 4, "w": 6, "h": 4},
				Query:   map[string]any{"expr": `go_goroutines`, "signal": "metrics"},
			},
			{
				Title:   "HTTP Request Rate",
				Type:    "line_chart",
				GridPos: map[string]int{"x": 6, "y": 4, "w": 6, "h": 4},
				Query:   map[string]any{"expr": `sum by (handler) (rate(prometheus_http_requests_total[5m]))`, "signal": "metrics"},
			},
			{
				Title:   "TSDB Head Series",
				Type:    "line_chart",
				GridPos: map[string]int{"x": 0, "y": 8, "w": 6, "h": 4},
				Query:   map[string]any{"expr": `prometheus_tsdb_head_series`, "signal": "metrics"},
			},
			{
				Title:   "Samples Appended Rate",
				Type:    "line_chart",
				GridPos: map[string]int{"x": 6, "y": 8, "w": 6, "h": 4},
				Query:   map[string]any{"expr": `rate(prometheus_tsdb_head_samples_appended_total[5m])`, "signal": "metrics"},
			},
			{
				Title:   "Up Targets",
				Type:    "stat",
				GridPos: map[string]int{"x": 0, "y": 12, "w": 4, "h": 3},
				Query:   map[string]any{"expr": `count(up == 1)`, "signal": "metrics", "showSparkline": false},
			},
			{
				Title:   "Down Targets",
				Type:    "stat",
				GridPos: map[string]int{"x": 4, "y": 12, "w": 4, "h": 3},
				Query: map[string]any{
					"expr": `count(up == 0)`, "signal": "metrics",
					"showSparkline": false,
					"thresholds":    []map[string]any{{"value": 1, "color": "#ef4444"}},
				},
			},
			{
				Title:   "TSDB Storage Size",
				Type:    "gauge",
				GridPos: map[string]int{"x": 8, "y": 12, "w": 4, "h": 3},
				Query: map[string]any{
					"expr":   `prometheus_tsdb_storage_blocks_bytes + prometheus_tsdb_wal_storage_size_bytes`,
					"signal": "metrics", "min": 0, "max": 536870912, "unit": "bytes",
				},
			},
		},
	}
}

func victoriaMetricsDashboard() dashboardDef {
	return dashboardDef{
		Title:          "VictoriaMetrics — Self-Monitoring",
		Description:    "VictoriaMetrics server scrape and ingestion metrics",
		DatasourceType: "victoriametrics",
		Panels: []panel{
			{
				Title:   "Scrape Duration",
				Type:    "line_chart",
				GridPos: map[string]int{"x": 0, "y": 0, "w": 6, "h": 4},
				Query:   map[string]any{"expr": `scrape_duration_seconds`, "signal": "metrics"},
			},
			{
				Title:   "Samples Scraped",
				Type:    "line_chart",
				GridPos: map[string]int{"x": 6, "y": 0, "w": 6, "h": 4},
				Query:   map[string]any{"expr": `scrape_samples_scraped`, "signal": "metrics"},
			},
			{
				Title:   "Samples Post-Relabeling",
				Type:    "line_chart",
				GridPos: map[string]int{"x": 0, "y": 4, "w": 6, "h": 4},
				Query:   map[string]any{"expr": `scrape_samples_post_metric_relabeling`, "signal": "metrics"},
			},
			{
				Title:   "Series Added",
				Type:    "line_chart",
				GridPos: map[string]int{"x": 6, "y": 4, "w": 6, "h": 4},
				Query:   map[string]any{"expr": `scrape_series_added`, "signal": "metrics"},
			},
			{
				Title:   "Scrape Target Up",
				Type:    "stat",
				GridPos: map[string]int{"x": 0, "y": 8, "w": 6, "h": 3},
				Query: map[string]any{
					"expr": `up`, "signal": "metrics",
					"showSparkline": true,
					"thresholds":    []map[string]any{{"value": 0, "color": "#ef4444"}},
				},
			},
			{
				Title:   "Scrape Timeout",
				Type:    "stat",
				GridPos: map[string]int{"x": 6, "y": 8, "w": 6, "h": 3},
				Query:   map[string]any{"expr": `scrape_timeout_seconds`, "signal": "metrics", "showSparkline": false},
			},
		},
	}
}

func lokiDashboard() dashboardDef {
	return dashboardDef{
		Title:          "Loki — Log Explorer",
		Description:    "Log volume and recent log entries from Loki",
		DatasourceType: "loki",
		Panels: []panel{
			{
				Title:   "Log Volume (all streams)",
				Type:    "bar_chart",
				GridPos: map[string]int{"x": 0, "y": 0, "w": 12, "h": 4},
				Query:   map[string]any{"expr": `sum(count_over_time({job=~".+"}[5m]))`, "signal": "metrics"},
			},
			{
				Title:   "Error Rate",
				Type:    "line_chart",
				GridPos: map[string]int{"x": 0, "y": 4, "w": 6, "h": 4},
				Query:   map[string]any{"expr": `sum(count_over_time({job=~".+"} |= "error"[5m]))`, "signal": "metrics"},
			},
			{
				Title:   "Warning Rate",
				Type:    "line_chart",
				GridPos: map[string]int{"x": 6, "y": 4, "w": 6, "h": 4},
				Query:   map[string]any{"expr": `sum(count_over_time({job=~".+"} |= "warn"[5m]))`, "signal": "metrics"},
			},
			{
				Title:   "Recent Logs",
				Type:    "logs",
				GridPos: map[string]int{"x": 0, "y": 8, "w": 12, "h": 6},
				Query:   map[string]any{"expr": `{job=~".+"}`, "signal": "logs"},
			},
			{
				Title:   "Error Logs",
				Type:    "logs",
				GridPos: map[string]int{"x": 0, "y": 14, "w": 12, "h": 6},
				Query:   map[string]any{"expr": `{job=~".+"} |= "error"`, "signal": "logs"},
			},
		},
	}
}

func victoriaLogsDashboard() dashboardDef {
	return dashboardDef{
		Title:          "Victoria Logs — Log Explorer",
		Description:    "Recent log entries from Victoria Logs",
		DatasourceType: "victorialogs",
		Panels: []panel{
			{
				Title:   "Recent Logs",
				Type:    "logs",
				GridPos: map[string]int{"x": 0, "y": 0, "w": 12, "h": 8},
				Query:   map[string]any{"expr": `*`, "signal": "logs"},
			},
			{
				Title:   "Error Logs",
				Type:    "logs",
				GridPos: map[string]int{"x": 0, "y": 8, "w": 12, "h": 8},
				Query:   map[string]any{"expr": `error`, "signal": "logs"},
			},
		},
	}
}

func tempoDashboard() dashboardDef {
	return dashboardDef{
		Title:          "Tempo — Trace Explorer",
		Description:    "Recent traces and latency heatmap from Tempo",
		DatasourceType: "tempo",
		Panels: []panel{
			{
				Title:   "Recent Traces",
				Type:    "trace_list",
				GridPos: map[string]int{"x": 0, "y": 0, "w": 12, "h": 8},
				Query:   map[string]any{"expr": `{}`, "limit": 50},
			},
			{
				Title:   "Trace Latency Heatmap",
				Type:    "trace_heatmap",
				GridPos: map[string]int{"x": 0, "y": 8, "w": 12, "h": 6},
				Query:   map[string]any{"expr": `{}`, "limit": 100},
			},
		},
	}
}

func main() {
	orgSlug := flag.String("org", "default", "Organization slug")

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: seed-dashboards [options]\n\n")
		fmt.Fprintf(os.Stderr, "Seed default dashboards for an existing organization.\n")
		fmt.Fprintf(os.Stderr, "Creates one dashboard per seeded datasource type.\n\n")
		fmt.Fprintf(os.Stderr, "Options:\n")
		flag.PrintDefaults()
		fmt.Fprintf(os.Stderr, "\nExample:\n")
		fmt.Fprintf(os.Stderr, "  go run ./cmd/seed-dashboards -org default\n")
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

	// Load all datasources for this org, keyed by type.
	dsMap, err := loadDatasourcesByType(ctx, pool, orgID)
	if err != nil {
		log.Fatalf("Failed to load datasources: %v", err)
	}

	if len(dsMap) == 0 {
		fmt.Printf("Organization '%s' has no datasources — run seed-datasources first.\n", *orgSlug)
		return
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		log.Fatalf("Failed to start transaction: %v", err)
	}
	defer tx.Rollback(ctx)

	created := 0
	skipped := 0

	for _, def := range defaultDashboards() {
		dsID, ok := dsMap[def.DatasourceType]
		if !ok {
			continue // datasource not seeded, skip this dashboard
		}

		// Check if dashboard already exists for this org + title.
		var existingID uuid.UUID
		err = tx.QueryRow(ctx,
			`SELECT id FROM dashboards WHERE organization_id = $1 AND title = $2 LIMIT 1`,
			orgID, def.Title,
		).Scan(&existingID)
		if err == nil {
			skipped++
			continue
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			log.Fatalf("Failed to check dashboard '%s': %v", def.Title, err)
		}

		dashboardID, err := insertDashboard(ctx, tx, orgID, def)
		if err != nil {
			log.Fatalf("Failed to create dashboard '%s': %v", def.Title, err)
		}

		if err := insertPanels(ctx, tx, dashboardID, dsID, def.Panels); err != nil {
			log.Fatalf("Failed to create panels for '%s': %v", def.Title, err)
		}

		if err := insertPermissions(ctx, tx, orgID, dashboardID); err != nil {
			log.Fatalf("Failed to create permissions for '%s': %v", def.Title, err)
		}

		created++
	}

	if err := tx.Commit(ctx); err != nil {
		log.Fatalf("Failed to commit transaction: %v", err)
	}

	fmt.Printf("Organization: %s (%s)\n", *orgSlug, orgID)
	fmt.Printf("Dashboards created: %d, skipped: %d\n", created, skipped)
}

// loadDatasourcesByType returns a map of datasource type -> id for an org.
// When multiple datasources of the same type exist, the default one wins.
func loadDatasourcesByType(ctx context.Context, pool *pgxpool.Pool, orgID uuid.UUID) (map[string]uuid.UUID, error) {
	rows, err := pool.Query(ctx,
		`SELECT id, type, is_default FROM datasources WHERE organization_id = $1 ORDER BY is_default DESC, created_at ASC`,
		orgID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	m := make(map[string]uuid.UUID)
	for rows.Next() {
		var id uuid.UUID
		var dsType string
		var isDefault bool
		if err := rows.Scan(&id, &dsType, &isDefault); err != nil {
			return nil, err
		}
		// First occurrence wins (default first due to ORDER BY).
		if _, exists := m[dsType]; !exists {
			m[dsType] = id
		}
	}

	return m, rows.Err()
}

func insertDashboard(ctx context.Context, tx pgx.Tx, orgID uuid.UUID, def dashboardDef) (uuid.UUID, error) {
	var id uuid.UUID
	err := tx.QueryRow(ctx,
		`INSERT INTO dashboards (title, description, organization_id)
		 VALUES ($1, $2, $3)
		 RETURNING id`,
		def.Title, def.Description, orgID,
	).Scan(&id)
	return id, err
}

func insertPanels(ctx context.Context, tx pgx.Tx, dashboardID, datasourceID uuid.UUID, panels []panel) error {
	for _, p := range panels {
		gridPosJSON, err := json.Marshal(p.GridPos)
		if err != nil {
			return fmt.Errorf("encode grid_pos for '%s': %w", p.Title, err)
		}

		// Inject datasource_id into the query object.
		q := make(map[string]any, len(p.Query)+1)
		for k, v := range p.Query {
			q[k] = v
		}
		q["datasource_id"] = datasourceID.String()

		queryJSON, err := json.Marshal(q)
		if err != nil {
			return fmt.Errorf("encode query for '%s': %w", p.Title, err)
		}

		_, err = tx.Exec(ctx,
			`INSERT INTO panels (dashboard_id, title, type, grid_pos, query, datasource_id)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			dashboardID, p.Title, p.Type, gridPosJSON, queryJSON, datasourceID,
		)
		if err != nil {
			return fmt.Errorf("insert panel '%s': %w", p.Title, err)
		}
	}

	return nil
}

// insertPermissions grants all current org members access to the dashboard.
// Creator (nil here — seed has no user context) gets view for everyone,
// matching the pattern used in dashboards.go Create handler.
func insertPermissions(ctx context.Context, tx pgx.Tx, orgID, dashboardID uuid.UUID) error {
	_, err := tx.Exec(ctx,
		`INSERT INTO resource_permissions (organization_id, resource_type, resource_id, principal_type, principal_id, permission)
		 SELECT om.organization_id, 'dashboard', $2, 'user', om.user_id,
		 	CASE WHEN om.role = 'admin' THEN 'admin'
		 	     WHEN om.role = 'editor' THEN 'edit'
		 	     ELSE 'view' END
		 FROM organization_memberships om
		 WHERE om.organization_id = $1
		 ON CONFLICT (resource_type, resource_id, principal_type, principal_id)
		 DO NOTHING`,
		orgID, dashboardID,
	)
	return err
}
