package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/janhoon/dash/backend/internal/analytics"
	"github.com/janhoon/dash/backend/internal/auth"
	"github.com/janhoon/dash/backend/internal/db"
	"github.com/janhoon/dash/backend/internal/handlers"
	"github.com/janhoon/dash/backend/internal/telemetry"
	"github.com/janhoon/dash/backend/internal/valkey"
	"github.com/redis/go-redis/v9"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

func main() {
	// Get database URL from environment
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://dash:dash@localhost:5432/dash?sslmode=disable"
	}

	// Get Prometheus URL from environment
	prometheusURL := os.Getenv("PROMETHEUS_URL")
	if prometheusURL == "" {
		prometheusURL = "http://localhost:9090"
	}

	// Connect to database
	pool, err := db.Connect(context.Background(), dbURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()

	// Run migrations
	if err := db.RunMigrations(context.Background(), pool); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	// Initialize JWT manager
	jwtManager, err := auth.NewJWTManager()
	if err != nil {
		log.Fatalf("Failed to initialize JWT manager: %v", err)
	}

	// Initialize Valkey client (optional - refresh tokens won't work without it)
	valkeyClient, err := valkey.NewClient()
	if err != nil {
		log.Printf("Warning: Valkey not available, refresh tokens disabled: %v", err)
	} else {
		defer valkeyClient.Close()
		log.Println("Valkey connected successfully")
	}

	telemetryShutdown := func(context.Context) error { return nil }
	shutdownTracing, err := telemetry.Setup(context.Background())
	if err != nil {
		log.Printf("Warning: OpenTelemetry tracing setup failed: %v", err)
	} else {
		telemetryShutdown = shutdownTracing
	}
	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if shutdownErr := telemetryShutdown(shutdownCtx); shutdownErr != nil {
			log.Printf("Warning: OpenTelemetry tracing shutdown failed: %v", shutdownErr)
		}
	}()

	analyticsService, err := analytics.NewFromEnv()
	if err != nil {
		log.Printf("Warning: analytics disabled: %v", err)
	}
	analytics.SetGlobal(analyticsService)
	defer func() {
		if closeErr := analyticsService.Close(); closeErr != nil {
			log.Printf("Warning: PostHog shutdown failed: %v", closeErr)
		}
	}()

	// Setup router
	mux := http.NewServeMux()

	// Health check endpoint
	mux.HandleFunc("GET /api/health", handlers.HealthCheck)

	// Auth routes
	var rdb *redis.Client
	if valkeyClient != nil {
		rdb = valkeyClient.GetRedis()
	}
	authHandler := handlers.NewAuthHandler(pool, jwtManager, rdb)
	mux.HandleFunc("POST /api/auth/register", authHandler.Register)
	mux.HandleFunc("POST /api/auth/login", authHandler.Login)
	mux.HandleFunc("GET /api/auth/me", auth.RequireAuth(jwtManager, authHandler.Me))
	mux.HandleFunc("GET /api/auth/me/methods", auth.RequireAuth(jwtManager, authHandler.GetAuthMethods))
	mux.HandleFunc("DELETE /api/auth/me/methods/{id}", auth.RequireAuth(jwtManager, authHandler.UnlinkAuthMethod))
	mux.HandleFunc("POST /api/auth/refresh", authHandler.Refresh)
	mux.HandleFunc("POST /api/auth/logout", authHandler.Logout)
	mux.HandleFunc("POST /api/auth/logout-all", auth.RequireAuth(jwtManager, authHandler.LogoutAll))

	// Google SSO routes
	googleSSOHandler := handlers.NewGoogleSSOHandler(pool, jwtManager)
	mux.HandleFunc("GET /api/auth/google/login", googleSSOHandler.Login)
	mux.HandleFunc("GET /api/auth/google/callback", googleSSOHandler.Callback)
	mux.HandleFunc("POST /api/orgs/{id}/sso/google", auth.RequireAuth(jwtManager, googleSSOHandler.ConfigureSSO))
	mux.HandleFunc("GET /api/orgs/{id}/sso/google", auth.RequireAuth(jwtManager, googleSSOHandler.GetSSOConfig))

	// Microsoft SSO routes
	microsoftSSOHandler := handlers.NewMicrosoftSSOHandler(pool, jwtManager)
	mux.HandleFunc("GET /api/auth/microsoft/login", microsoftSSOHandler.Login)
	mux.HandleFunc("GET /api/auth/microsoft/callback", microsoftSSOHandler.Callback)
	mux.HandleFunc("POST /api/orgs/{id}/sso/microsoft", auth.RequireAuth(jwtManager, microsoftSSOHandler.ConfigureSSO))
	mux.HandleFunc("GET /api/orgs/{id}/sso/microsoft", auth.RequireAuth(jwtManager, microsoftSSOHandler.GetSSOConfig))

	// Organization routes
	orgHandler := handlers.NewOrganizationHandler(pool, rdb)
	mux.HandleFunc("POST /api/orgs", auth.RequireAuth(jwtManager, orgHandler.Create))
	mux.HandleFunc("GET /api/orgs", auth.RequireAuth(jwtManager, orgHandler.List))
	mux.HandleFunc("GET /api/orgs/{id}", auth.RequireAuth(jwtManager, orgHandler.Get))
	mux.HandleFunc("PUT /api/orgs/{id}", auth.RequireAuth(jwtManager, orgHandler.Update))
	mux.HandleFunc("DELETE /api/orgs/{id}", auth.RequireAuth(jwtManager, orgHandler.Delete))
	mux.HandleFunc("POST /api/orgs/{id}/invitations", auth.RequireAuth(jwtManager, orgHandler.CreateInvitation))
	mux.HandleFunc("POST /api/invitations/{token}/accept", auth.RequireAuth(jwtManager, orgHandler.AcceptInvitation))
	mux.HandleFunc("GET /api/orgs/{id}/members", auth.RequireAuth(jwtManager, orgHandler.ListMembers))
	mux.HandleFunc("PUT /api/orgs/{id}/members/{userId}/role", auth.RequireAuth(jwtManager, orgHandler.UpdateMemberRole))
	mux.HandleFunc("DELETE /api/orgs/{id}/members/{userId}", auth.RequireAuth(jwtManager, orgHandler.RemoveMember))

	// User group routes
	groupHandler := handlers.NewGroupHandler(pool)
	mux.HandleFunc("POST /api/orgs/{id}/groups", auth.RequireAuth(jwtManager, groupHandler.Create))
	mux.HandleFunc("GET /api/orgs/{id}/groups", auth.RequireAuth(jwtManager, groupHandler.List))
	mux.HandleFunc("PUT /api/orgs/{id}/groups/{groupId}", auth.RequireAuth(jwtManager, groupHandler.Update))
	mux.HandleFunc("DELETE /api/orgs/{id}/groups/{groupId}", auth.RequireAuth(jwtManager, groupHandler.Delete))
	mux.HandleFunc("GET /api/orgs/{id}/groups/{groupId}/members", auth.RequireAuth(jwtManager, groupHandler.ListMembers))
	mux.HandleFunc("POST /api/orgs/{id}/groups/{groupId}/members", auth.RequireAuth(jwtManager, groupHandler.AddMember))
	mux.HandleFunc("DELETE /api/orgs/{id}/groups/{groupId}/members/{userId}", auth.RequireAuth(jwtManager, groupHandler.RemoveMember))

	// Dashboard routes (org-scoped for list/create, dashboard ID for get/update/delete)
	dashboardHandler := handlers.NewDashboardHandler(pool)
	mux.HandleFunc("POST /api/orgs/{orgId}/dashboards", auth.RequireAuth(jwtManager, dashboardHandler.Create))
	mux.HandleFunc("GET /api/orgs/{orgId}/dashboards", auth.RequireAuth(jwtManager, dashboardHandler.List))
	mux.HandleFunc("GET /api/dashboards/{id}", auth.RequireAuth(jwtManager, dashboardHandler.Get))
	mux.HandleFunc("PUT /api/dashboards/{id}", auth.RequireAuth(jwtManager, dashboardHandler.Update))
	mux.HandleFunc("DELETE /api/dashboards/{id}", auth.RequireAuth(jwtManager, dashboardHandler.Delete))
	mux.HandleFunc("GET /api/dashboards/{id}/export", auth.RequireAuth(jwtManager, dashboardHandler.Export))
	mux.HandleFunc("POST /api/orgs/{orgId}/dashboards/import", auth.RequireAuth(jwtManager, dashboardHandler.Import))

	// Folder routes
	folderHandler := handlers.NewFolderHandler(pool)
	mux.HandleFunc("POST /api/orgs/{orgId}/folders", auth.RequireAuth(jwtManager, folderHandler.Create))
	mux.HandleFunc("GET /api/orgs/{orgId}/folders", auth.RequireAuth(jwtManager, folderHandler.List))
	mux.HandleFunc("GET /api/folders/{id}", auth.RequireAuth(jwtManager, folderHandler.Get))
	mux.HandleFunc("PUT /api/folders/{id}", auth.RequireAuth(jwtManager, folderHandler.Update))
	mux.HandleFunc("DELETE /api/folders/{id}", auth.RequireAuth(jwtManager, folderHandler.Delete))

	// Resource permission routes
	permissionHandler := handlers.NewPermissionHandler(pool)
	mux.HandleFunc("GET /api/folders/{id}/permissions", auth.RequireAuth(jwtManager, permissionHandler.ListFolderPermissions))
	mux.HandleFunc("PUT /api/folders/{id}/permissions", auth.RequireAuth(jwtManager, permissionHandler.ReplaceFolderPermissions))
	mux.HandleFunc("GET /api/dashboards/{id}/permissions", auth.RequireAuth(jwtManager, permissionHandler.ListDashboardPermissions))
	mux.HandleFunc("PUT /api/dashboards/{id}/permissions", auth.RequireAuth(jwtManager, permissionHandler.ReplaceDashboardPermissions))

	// Panel routes
	panelHandler := handlers.NewPanelHandler(pool)
	mux.HandleFunc("POST /api/dashboards/{id}/panels", auth.RequireAuth(jwtManager, panelHandler.Create))
	mux.HandleFunc("GET /api/dashboards/{id}/panels", auth.RequireAuth(jwtManager, panelHandler.ListByDashboard))
	mux.HandleFunc("PUT /api/panels/{id}", auth.RequireAuth(jwtManager, panelHandler.Update))
	mux.HandleFunc("DELETE /api/panels/{id}", auth.RequireAuth(jwtManager, panelHandler.Delete))

	// Prometheus data source routes (legacy, backwards compatible)
	prometheusHandler := handlers.NewPrometheusHandler(prometheusURL)
	mux.HandleFunc("GET /api/datasources/prometheus/query", prometheusHandler.Query)
	mux.HandleFunc("GET /api/datasources/prometheus/metrics", prometheusHandler.Metrics)
	mux.HandleFunc("GET /api/datasources/prometheus/labels", prometheusHandler.Labels)
	mux.HandleFunc("GET /api/datasources/prometheus/label/{name}/values", prometheusHandler.LabelValues)

	// Multi-source datasource routes
	dsHandler := handlers.NewDataSourceHandler(pool)
	mux.HandleFunc("POST /api/orgs/{orgId}/datasources/test", auth.RequireAuth(jwtManager, dsHandler.TestConnectionDraft))
	mux.HandleFunc("POST /api/orgs/{orgId}/datasources", auth.RequireAuth(jwtManager, dsHandler.Create))
	mux.HandleFunc("GET /api/orgs/{orgId}/datasources", auth.RequireAuth(jwtManager, dsHandler.List))
	mux.HandleFunc("GET /api/datasources/{id}", auth.RequireAuth(jwtManager, dsHandler.Get))
	mux.HandleFunc("PUT /api/datasources/{id}", auth.RequireAuth(jwtManager, dsHandler.Update))
	mux.HandleFunc("DELETE /api/datasources/{id}", auth.RequireAuth(jwtManager, dsHandler.Delete))
	mux.HandleFunc("GET /api/datasources/{id}/labels", auth.RequireAuth(jwtManager, dsHandler.Labels))
	mux.HandleFunc("GET /api/datasources/{id}/labels/{name}/values", auth.RequireAuth(jwtManager, dsHandler.LabelValues))
	mux.HandleFunc("POST /api/datasources/{id}/query", auth.RequireAuth(jwtManager, dsHandler.Query))
	mux.HandleFunc("GET /api/datasources/{id}/traces/{traceId}", auth.RequireAuth(jwtManager, dsHandler.GetTrace))
	mux.HandleFunc("GET /api/datasources/{id}/traces/{traceId}/service-graph", auth.RequireAuth(jwtManager, dsHandler.TraceServiceGraph))
	mux.HandleFunc("POST /api/datasources/{id}/traces/search", auth.RequireAuth(jwtManager, dsHandler.SearchTraces))
	mux.HandleFunc("GET /api/datasources/{id}/traces/services", auth.RequireAuth(jwtManager, dsHandler.TraceServices))
	mux.HandleFunc("POST /api/datasources/{id}/stream", auth.RequireAuth(jwtManager, dsHandler.Stream))
	mux.HandleFunc("POST /api/datasources/{id}/test", auth.RequireAuth(jwtManager, dsHandler.TestConnection))

	// VMAlert proxy routes
	vmAlertHandler := handlers.NewVMAlertHandler(pool)
	mux.HandleFunc("GET /api/datasources/{id}/vmalert/alerts", auth.RequireAuth(jwtManager, vmAlertHandler.Alerts))
	mux.HandleFunc("GET /api/datasources/{id}/vmalert/groups", auth.RequireAuth(jwtManager, vmAlertHandler.Groups))
	mux.HandleFunc("GET /api/datasources/{id}/vmalert/rules", auth.RequireAuth(jwtManager, vmAlertHandler.Rules))
	mux.HandleFunc("GET /api/datasources/{id}/vmalert/health", auth.RequireAuth(jwtManager, vmAlertHandler.Health))

	// AlertManager proxy routes
	alertManagerHandler := handlers.NewAlertManagerHandler(pool)
	mux.HandleFunc("GET /api/datasources/{id}/alertmanager/alerts", auth.RequireAuth(jwtManager, alertManagerHandler.ListAlerts))
	mux.HandleFunc("GET /api/datasources/{id}/alertmanager/silences", auth.RequireAuth(jwtManager, alertManagerHandler.ListSilences))
	mux.HandleFunc("POST /api/datasources/{id}/alertmanager/silences", auth.RequireAuth(jwtManager, alertManagerHandler.CreateSilence))
	mux.HandleFunc("DELETE /api/datasources/{id}/alertmanager/silences/{silenceId}", auth.RequireAuth(jwtManager, alertManagerHandler.ExpireSilence))
	mux.HandleFunc("GET /api/datasources/{id}/alertmanager/receivers", auth.RequireAuth(jwtManager, alertManagerHandler.ListReceivers))
	mux.HandleFunc("GET /api/datasources/{id}/alertmanager/health", auth.RequireAuth(jwtManager, alertManagerHandler.Health))

	// Grafana conversion route
	grafanaConverterHandler := handlers.NewGrafanaConverterHandler()
	mux.HandleFunc("POST /api/convert/grafana", auth.RequireAuth(jwtManager, grafanaConverterHandler.Convert))

	// Apply middleware
	handler := corsMiddleware(otelhttp.NewHandler(mux, "ace-api"))

	// Create server
	server := &http.Server{
		Addr:         ":8080",
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in goroutine
	go func() {
		log.Println("Starting server on :8080")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exiting")
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
