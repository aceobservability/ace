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
		httpServiceOverview(),
		applicationPerformance(),
		databaseHealth(),
		infrastructureOverview(),
		logIntelligence(),
		traceExplorer(),
	}
}

// Dashboard 1: HTTP Service Overview — compact stats, gauges, pie, one trend.
// Only api-gateway has HTTP metrics, so we focus on gateway stats + DB pool distribution.
func httpServiceOverview() dashboardDef {
	return dashboardDef{
		Title:          "HTTP Service Overview",
		Description:    "Gateway traffic, latency percentiles, DB connections by service, and resource gauges",
		DatasourceType: "victoriametrics",
		Panels: []panel{
			// Row 1: Six compact stats
			{Title: "Requests/s", Type: "stat", GridPos: map[string]int{"x": 0, "y": 0, "w": 2, "h": 2},
				Query: map[string]any{"expr": `sum(rate(http_server_requests_total[5m]))`, "signal": "metrics", "showSparkline": true}},
			{Title: "Errors/s", Type: "stat", GridPos: map[string]int{"x": 2, "y": 0, "w": 2, "h": 2},
				Query: map[string]any{"expr": `sum(rate(http_server_errors_total[5m]))`, "signal": "metrics", "showSparkline": true,
					"thresholds": []map[string]any{{"value": 0.1, "color": "#D4A11E"}, {"value": 1, "color": "#D95C54"}}}},
			{Title: "P50 (ms)", Type: "stat", GridPos: map[string]int{"x": 4, "y": 0, "w": 2, "h": 2},
				Query: map[string]any{"expr": `avg(http_server_request_duration_p50_milliseconds)`, "signal": "metrics", "showSparkline": true, "unit": "ms"}},
			{Title: "P95 (ms)", Type: "stat", GridPos: map[string]int{"x": 6, "y": 0, "w": 2, "h": 2},
				Query: map[string]any{"expr": `avg(http_server_request_duration_p95_milliseconds)`, "signal": "metrics", "showSparkline": true, "unit": "ms"}},
			{Title: "P99 (ms)", Type: "stat", GridPos: map[string]int{"x": 8, "y": 0, "w": 2, "h": 2},
				Query: map[string]any{"expr": `avg(http_server_request_duration_p99_milliseconds)`, "signal": "metrics", "showSparkline": true, "unit": "ms",
					"thresholds": []map[string]any{{"value": 200, "color": "#D4A11E"}, {"value": 500, "color": "#D95C54"}}}},
			{Title: "Active Reqs", Type: "stat", GridPos: map[string]int{"x": 10, "y": 0, "w": 2, "h": 2},
				Query: map[string]any{"expr": `sum(http_server_active_requests)`, "signal": "metrics", "showSparkline": true}},
			// Row 2: Request rate trend + DB connections pie (actual multi-series data)
			{Title: "Gateway Request Rate", Type: "line_chart", GridPos: map[string]int{"x": 0, "y": 2, "w": 8, "h": 4},
				Query: map[string]any{"expr": `rate(http_server_requests_total[5m])`, "signal": "metrics"}},
			{Title: "DB Connections by Service", Type: "pie", GridPos: map[string]int{"x": 8, "y": 2, "w": 4, "h": 4},
				Query: map[string]any{"expr": `sum by (job) (db_pool_active_connections)`, "signal": "metrics"}},
			// Row 3: Gauges + bar_gauge for per-service DB connections
			{Title: "CPU", Type: "gauge", GridPos: map[string]int{"x": 0, "y": 6, "w": 3, "h": 3},
				Query: map[string]any{"expr": `avg(system_cpu_utilization_ratio) * 100`, "signal": "metrics", "min": 0, "max": 100, "unit": "%"}},
			{Title: "Active DB Connections", Type: "bar_gauge", GridPos: map[string]int{"x": 3, "y": 6, "w": 9, "h": 3},
				Query: map[string]any{"expr": `sum by (job) (db_pool_active_connections)`, "signal": "metrics"}},
		},
	}
}

// Dashboard 2: Application Performance — focused on what has multi-series data.
// DB pool metrics have 6 services. HTTP metrics only have 1. Design around DB + resources.
func applicationPerformance() dashboardDef {
	return dashboardDef{
		Title:          "Application Performance",
		Description:    "Latency, DB pool distribution, resource gauges, and query performance",
		DatasourceType: "victoriametrics",
		Panels: []panel{
			// Row 1: Key stats
			{Title: "Avg Latency", Type: "stat", GridPos: map[string]int{"x": 0, "y": 0, "w": 3, "h": 2},
				Query: map[string]any{"expr": `sum(rate(http_server_request_duration_milliseconds_sum[5m])) / sum(rate(http_server_request_duration_milliseconds_count[5m]))`, "signal": "metrics", "showSparkline": true, "unit": "ms"}},
			{Title: "P99 Latency", Type: "stat", GridPos: map[string]int{"x": 3, "y": 0, "w": 3, "h": 2},
				Query: map[string]any{"expr": `avg(http_server_request_duration_p99_milliseconds)`, "signal": "metrics", "showSparkline": true, "unit": "ms",
					"thresholds": []map[string]any{{"value": 200, "color": "#D4A11E"}, {"value": 500, "color": "#D95C54"}}}},
			{Title: "Goroutines", Type: "gauge", GridPos: map[string]int{"x": 6, "y": 0, "w": 3, "h": 2},
				Query: map[string]any{"expr": `sum(process_runtime_goroutines)`, "signal": "metrics", "min": 0, "max": 500}},
			{Title: "Memory", Type: "stat", GridPos: map[string]int{"x": 9, "y": 0, "w": 3, "h": 2},
				Query: map[string]any{"expr": `sum(process_runtime_memory_bytes)`, "signal": "metrics", "showSparkline": true, "unit": "bytes"}},
			// Row 2: DB query rate by system (pie) + DB query duration trend
			{Title: "Query Volume: PostgreSQL vs Redis", Type: "pie", GridPos: map[string]int{"x": 0, "y": 2, "w": 4, "h": 4},
				Query: map[string]any{"expr": `sum by (db_system) (rate(db_client_operation_duration_milliseconds_count[5m]))`, "signal": "metrics"}},
			{Title: "Avg DB Query Duration by Service", Type: "line_chart", GridPos: map[string]int{"x": 4, "y": 2, "w": 8, "h": 4},
				Query: map[string]any{"expr": `sum by (job) (rate(db_client_operation_duration_milliseconds_sum[5m])) / sum by (job) (rate(db_client_operation_duration_milliseconds_count[5m]))`, "signal": "metrics"}},
			// Row 3: Idle connections bar_gauge + memory trend
			{Title: "Idle Connections by Service", Type: "bar_gauge", GridPos: map[string]int{"x": 0, "y": 6, "w": 6, "h": 3},
				Query: map[string]any{"expr": `sum by (job) (db_pool_idle_connections)`, "signal": "metrics"}},
			{Title: "Memory Over Time", Type: "line_chart", GridPos: map[string]int{"x": 6, "y": 6, "w": 6, "h": 3},
				Query: map[string]any{"expr": `sum(process_runtime_memory_bytes)`, "signal": "metrics"}},
		},
	}
}

// Dashboard 3: Database Health — stats, gauge, pie, bar_gauge, one line chart.
func databaseHealth() dashboardDef {
	return dashboardDef{
		Title:          "Database Health",
		Description:    "Connection pool, query latency, and database system breakdown",
		DatasourceType: "victoriametrics",
		Panels: []panel{
			// Row 1: Stats + gauge
			{Title: "Active Conns", Type: "stat", GridPos: map[string]int{"x": 0, "y": 0, "w": 3, "h": 2},
				Query: map[string]any{"expr": `sum(db_pool_active_connections)`, "signal": "metrics", "showSparkline": true}},
			{Title: "Idle Conns", Type: "stat", GridPos: map[string]int{"x": 3, "y": 0, "w": 3, "h": 2},
				Query: map[string]any{"expr": `sum(db_pool_idle_connections)`, "signal": "metrics", "showSparkline": true}},
			{Title: "Avg Query (ms)", Type: "stat", GridPos: map[string]int{"x": 6, "y": 0, "w": 3, "h": 2},
				Query: map[string]any{"expr": `sum(rate(db_client_operation_duration_milliseconds_sum[5m])) / sum(rate(db_client_operation_duration_milliseconds_count[5m]))`, "signal": "metrics", "showSparkline": true, "unit": "ms"}},
			{Title: "CPU", Type: "gauge", GridPos: map[string]int{"x": 9, "y": 0, "w": 3, "h": 2},
				Query: map[string]any{"expr": `avg(system_cpu_utilization_ratio) * 100`, "signal": "metrics", "min": 0, "max": 100, "unit": "%"}},
			// Row 2: Active connections bar_gauge + DB system pie
			{Title: "Active Connections by Service", Type: "bar_gauge", GridPos: map[string]int{"x": 0, "y": 2, "w": 8, "h": 3},
				Query: map[string]any{"expr": `sum by (job) (db_pool_active_connections)`, "signal": "metrics"}},
			{Title: "PostgreSQL vs Redis", Type: "pie", GridPos: map[string]int{"x": 8, "y": 2, "w": 4, "h": 3},
				Query: map[string]any{"expr": `sum by (db_system) (rate(db_client_operation_duration_milliseconds_count[5m]))`, "signal": "metrics"}},
			// Row 3: Connection pool trend
			{Title: "Connection Pool Over Time", Type: "line_chart", GridPos: map[string]int{"x": 0, "y": 5, "w": 12, "h": 4},
				Query: map[string]any{"expr": `label_replace(sum(db_pool_active_connections), "pool", "active", "", "") or label_replace(sum(db_pool_idle_connections), "pool", "idle", "", "")`, "signal": "metrics"}},
		},
	}
}

// Dashboard 4: Infrastructure Overview — CPU gauge, memory pie, goroutine bar_gauge.
// No count(up) (returns 1), no scrape_series_added (returns 0).
func infrastructureOverview() dashboardDef {
	return dashboardDef{
		Title:          "Infrastructure Overview",
		Description:    "CPU utilization, memory distribution, goroutines, and connection pools across services",
		DatasourceType: "victoriametrics",
		Panels: []panel{
			// Row 1: Gauges + stats
			{Title: "CPU", Type: "gauge", GridPos: map[string]int{"x": 0, "y": 0, "w": 3, "h": 3},
				Query: map[string]any{"expr": `avg(system_cpu_utilization_ratio) * 100`, "signal": "metrics", "min": 0, "max": 100, "unit": "%"}},
			{Title: "Total Memory", Type: "stat", GridPos: map[string]int{"x": 3, "y": 0, "w": 3, "h": 3},
				Query: map[string]any{"expr": `sum(process_runtime_memory_bytes)`, "signal": "metrics", "showSparkline": true, "unit": "bytes"}},
			{Title: "Goroutines", Type: "stat", GridPos: map[string]int{"x": 6, "y": 0, "w": 3, "h": 3},
				Query: map[string]any{"expr": `sum(process_runtime_goroutines)`, "signal": "metrics", "showSparkline": true}},
			{Title: "Active Requests", Type: "stat", GridPos: map[string]int{"x": 9, "y": 0, "w": 3, "h": 3},
				Query: map[string]any{"expr": `sum(http_server_active_requests)`, "signal": "metrics", "showSparkline": true}},
			// Row 2: Memory pie + goroutines bar_gauge
			{Title: "Memory by Service", Type: "pie", GridPos: map[string]int{"x": 0, "y": 3, "w": 4, "h": 4},
				Query: map[string]any{"expr": `sum by (job) (process_runtime_memory_bytes)`, "signal": "metrics"}},
			{Title: "Goroutines by Service", Type: "bar_gauge", GridPos: map[string]int{"x": 4, "y": 3, "w": 8, "h": 4},
				Query: map[string]any{"expr": `sum by (job) (process_runtime_goroutines)`, "signal": "metrics"}},
			// Row 3: Scrape duration + DB pool bar_chart
			{Title: "Scrape Duration", Type: "line_chart", GridPos: map[string]int{"x": 0, "y": 7, "w": 6, "h": 3},
				Query: map[string]any{"expr": `scrape_duration_seconds`, "signal": "metrics"}},
			{Title: "DB Pool by Service", Type: "bar_chart", GridPos: map[string]int{"x": 6, "y": 7, "w": 6, "h": 3},
				Query: map[string]any{"expr": `sum by (job) (db_pool_active_connections)`, "signal": "metrics"}},
		},
	}
}

// Dashboard 5: Log Intelligence — service-filtered log views.
func logIntelligence() dashboardDef {
	return dashboardDef{
		Title:          "Log Intelligence",
		Description:    "Service-level log analysis: gateway, orders, payments, errors, and slow queries",
		DatasourceType: "victorialogs",
		Panels: []panel{
			{Title: "API Gateway", Type: "logs", GridPos: map[string]int{"x": 0, "y": 0, "w": 12, "h": 4},
				Query: map[string]any{"expr": `service.name:api-gateway`, "signal": "logs"}},
			{Title: "Order Service", Type: "logs", GridPos: map[string]int{"x": 0, "y": 4, "w": 6, "h": 4},
				Query: map[string]any{"expr": `service.name:order-service`, "signal": "logs"}},
			{Title: "Payment Service", Type: "logs", GridPos: map[string]int{"x": 6, "y": 4, "w": 6, "h": 4},
				Query: map[string]any{"expr": `service.name:payment-service`, "signal": "logs"}},
			{Title: "Errors (All Services)", Type: "logs", GridPos: map[string]int{"x": 0, "y": 8, "w": 12, "h": 4},
				Query: map[string]any{"expr": `severity:ERROR OR error`, "signal": "logs"}},
			{Title: "Slow DB Queries (> 50ms)", Type: "logs", GridPos: map[string]int{"x": 0, "y": 12, "w": 12, "h": 4},
				Query: map[string]any{"expr": `duration_ms:>50 AND (db.system:postgresql OR db.system:redis)`, "signal": "logs"}},
		},
	}
}

// Dashboard 6: Service Health & Tracing — metrics-driven service overview.
// Shows the service-level picture that traces represent: which services are busy,
// which are slow, where errors happen. Uses VictoriaMetrics because dashboards
// can only target one datasource, and the metrics give instant visual value.
// A text panel links to Explore > Traces for trace drill-down.
func traceExplorer() dashboardDef {
	return dashboardDef{
		Title:          "Service Health & Tracing",
		Description:    "Service latency, DB performance per service, connection distribution, and resource usage. Drill into traces via Explore.",
		DatasourceType: "victoriametrics",
		Panels: []panel{
			// Row 1: Service-level stats
			{Title: "Request Rate", Type: "stat", GridPos: map[string]int{"x": 0, "y": 0, "w": 2, "h": 2},
				Query: map[string]any{"expr": `sum(rate(http_server_requests_total[5m]))`, "signal": "metrics", "showSparkline": true}},
			{Title: "Error Rate", Type: "stat", GridPos: map[string]int{"x": 2, "y": 0, "w": 2, "h": 2},
				Query: map[string]any{"expr": `sum(rate(http_server_errors_total[5m]))`, "signal": "metrics", "showSparkline": true,
					"thresholds": []map[string]any{{"value": 0.1, "color": "#D4A11E"}, {"value": 1, "color": "#D95C54"}}}},
			{Title: "P50 (ms)", Type: "stat", GridPos: map[string]int{"x": 4, "y": 0, "w": 2, "h": 2},
				Query: map[string]any{"expr": `avg(http_server_request_duration_p50_milliseconds)`, "signal": "metrics", "showSparkline": true, "unit": "ms"}},
			{Title: "P99 (ms)", Type: "stat", GridPos: map[string]int{"x": 6, "y": 0, "w": 2, "h": 2},
				Query: map[string]any{"expr": `avg(http_server_request_duration_p99_milliseconds)`, "signal": "metrics", "showSparkline": true, "unit": "ms",
					"thresholds": []map[string]any{{"value": 200, "color": "#D4A11E"}, {"value": 500, "color": "#D95C54"}}}},
			{Title: "Active Conns", Type: "stat", GridPos: map[string]int{"x": 8, "y": 0, "w": 2, "h": 2},
				Query: map[string]any{"expr": `sum(db_pool_active_connections)`, "signal": "metrics", "showSparkline": true}},
			{Title: "Avg Query (ms)", Type: "stat", GridPos: map[string]int{"x": 10, "y": 0, "w": 2, "h": 2},
				Query: map[string]any{"expr": `sum(rate(db_client_operation_duration_milliseconds_sum[5m])) / sum(rate(db_client_operation_duration_milliseconds_count[5m]))`, "signal": "metrics", "showSparkline": true, "unit": "ms"}},
			// Row 2: DB query duration by service (shows which service is slowest) + connections pie
			{Title: "DB Query Duration by Service", Type: "line_chart", GridPos: map[string]int{"x": 0, "y": 2, "w": 8, "h": 4},
				Query: map[string]any{"expr": `sum by (job) (rate(db_client_operation_duration_milliseconds_sum[5m])) / sum by (job) (rate(db_client_operation_duration_milliseconds_count[5m]))`, "signal": "metrics"}},
			{Title: "DB Connections", Type: "pie", GridPos: map[string]int{"x": 8, "y": 2, "w": 4, "h": 4},
				Query: map[string]any{"expr": `sum by (job) (db_pool_active_connections)`, "signal": "metrics"}},
			// Row 3: Per-service resource bar_gauges
			{Title: "Goroutines by Service", Type: "bar_gauge", GridPos: map[string]int{"x": 0, "y": 6, "w": 6, "h": 3},
				Query: map[string]any{"expr": `sum by (job) (process_runtime_goroutines)`, "signal": "metrics"}},
			{Title: "Idle Connections by Service", Type: "bar_gauge", GridPos: map[string]int{"x": 6, "y": 6, "w": 6, "h": 3},
				Query: map[string]any{"expr": `sum by (job) (db_pool_idle_connections)`, "signal": "metrics"}},
			// Row 4: Trace drill-down hint
			{Title: "Trace Drill-Down", Type: "text", GridPos: map[string]int{"x": 0, "y": 9, "w": 12, "h": 2},
				Query: map[string]any{"content": "To view individual distributed traces, go to **Explore > Traces** and search by service name. Click any trace to see the full span waterfall, timing breakdown, and cross-service dependencies."}},
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
		dbURL = "postgres://ace:ace@localhost:5432/ace?sslmode=disable"
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
