package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.uber.org/zap"

	"github.com/aceobservability/ace/backend/internal/analytics"
	"github.com/aceobservability/ace/backend/internal/audit"
	"github.com/aceobservability/ace/backend/internal/auth"
	"github.com/aceobservability/ace/backend/internal/db"
	"github.com/aceobservability/ace/backend/internal/handlers"
	"github.com/aceobservability/ace/backend/internal/httplog"
	"github.com/aceobservability/ace/backend/internal/telemetry"
	"github.com/aceobservability/ace/backend/internal/valkey"
)

func main() {
	// Configure structured logging (must be first — other init steps log)
	logLevel := zap.NewAtomicLevel()
	if lvl := os.Getenv("LOG_LEVEL"); lvl != "" {
		if err := logLevel.UnmarshalText([]byte(lvl)); err != nil {
			log.Fatalf("invalid LOG_LEVEL %q: %v", lvl, err)
		}
	}
	cfg := zap.NewProductionConfig()
	cfg.Level = logLevel
	cfg.Sampling = nil // disable sampling — every request must be logged
	cfg.OutputPaths = []string{"stdout"}
	cfg.ErrorOutputPaths = []string{"stderr"}
	logger, err := cfg.Build()
	if err != nil {
		log.Fatalf("failed to initialize logger: %v", err)
	}
	defer func() { _ = logger.Sync() }()
	zap.ReplaceGlobals(logger)

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
		logger.Fatal("failed to connect to database", zap.Error(err))
	}
	defer pool.Close()

	// Run migrations
	if err := db.RunMigrations(context.Background(), pool); err != nil {
		logger.Fatal("failed to run migrations", zap.Error(err))
	}

	// Initialize JWT manager
	jwtManager, err := auth.NewJWTManager()
	if err != nil {
		logger.Fatal("failed to initialize JWT manager", zap.Error(err))
	}

	// Initialize Valkey client (optional - refresh tokens won't work without it)
	valkeyClient, err := valkey.NewClient()
	if err != nil {
		logger.Warn("valkey not available, refresh tokens disabled", zap.Error(err))
	} else {
		defer valkeyClient.Close()
		logger.Info("valkey connected")
	}

	telemetryShutdown := func(context.Context) error { return nil }
	shutdownTracing, err := telemetry.Setup(context.Background())
	if err != nil {
		logger.Warn("OpenTelemetry tracing setup failed", zap.Error(err))
	} else {
		telemetryShutdown = shutdownTracing
	}
	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if shutdownErr := telemetryShutdown(shutdownCtx); shutdownErr != nil {
			logger.Warn("OpenTelemetry tracing shutdown failed", zap.Error(shutdownErr))
		}
	}()

	analyticsService, err := analytics.NewFromEnv()
	if err != nil {
		logger.Warn("analytics disabled", zap.Error(err))
	}
	analytics.SetGlobal(analyticsService)
	defer func() {
		if closeErr := analyticsService.Close(); closeErr != nil {
			logger.Warn("PostHog shutdown failed", zap.Error(closeErr))
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
	googleSSOHandler := handlers.NewGoogleSSOHandler(pool, jwtManager, rdb)
	mux.HandleFunc("GET /api/auth/google/login", googleSSOHandler.Login)
	mux.HandleFunc("GET /api/auth/google/callback", googleSSOHandler.Callback)
	mux.HandleFunc("POST /api/orgs/{id}/sso/google", auth.RequireAuth(jwtManager, googleSSOHandler.ConfigureSSO))
	mux.HandleFunc("GET /api/orgs/{id}/sso/google", auth.RequireAuth(jwtManager, googleSSOHandler.GetSSOConfig))

	// Microsoft SSO routes
	microsoftSSOHandler := handlers.NewMicrosoftSSOHandler(pool, jwtManager, rdb)
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
	mux.HandleFunc("PUT /api/orgs/{id}/branding", auth.RequireAuth(jwtManager, orgHandler.UpdateBranding))

	// Audit log routes
	auditLogger := audit.NewLogger(pool)
	auditHandler := handlers.NewAuditHandler(pool)
	mux.HandleFunc("GET /api/orgs/{id}/audit-log", auth.RequireAuth(jwtManager, auditHandler.ListAuditLog))
	mux.HandleFunc("GET /api/orgs/{id}/audit-log/export", auth.RequireAuth(jwtManager, auditHandler.ExportAuditLog))

	// SSO role mapping routes
	roleMappingHandler := handlers.NewSSORoleMappingHandler(pool, auditLogger)
	mux.HandleFunc("GET /api/orgs/{id}/sso/{provider}/role-mappings", auth.RequireAuth(jwtManager, roleMappingHandler.ListMappings))
	mux.HandleFunc("POST /api/orgs/{id}/sso/{provider}/role-mappings", auth.RequireAuth(jwtManager, roleMappingHandler.CreateMapping))
	mux.HandleFunc("DELETE /api/orgs/{id}/sso/{provider}/role-mappings/{mappingId}", auth.RequireAuth(jwtManager, roleMappingHandler.DeleteMapping))

	// Okta SSO routes
	oktaSSOHandler := handlers.NewOktaSSOHandler(pool, jwtManager, rdb, auditLogger)
	mux.HandleFunc("GET /api/auth/okta/login", oktaSSOHandler.Login)
	mux.HandleFunc("GET /api/auth/okta/callback", oktaSSOHandler.Callback)
	mux.HandleFunc("POST /api/orgs/{id}/sso/okta", auth.RequireAuth(jwtManager, oktaSSOHandler.ConfigureSSO))
	mux.HandleFunc("GET /api/orgs/{id}/sso/okta", auth.RequireAuth(jwtManager, oktaSSOHandler.GetSSOConfig))
	mux.HandleFunc("POST /api/orgs/{id}/sso/okta/test", auth.RequireAuth(jwtManager, oktaSSOHandler.TestConnection))

	// Public SSO provider discovery (no auth required)
	ssoDiscoveryHandler := handlers.NewSSODiscoveryHandler(pool)
	mux.HandleFunc("GET /api/orgs/{slug}/sso/providers", ssoDiscoveryHandler.ListProviders)

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
	mux.HandleFunc("GET /api/orgs/{orgId}/datasources/{dsId}/trace-datasources", auth.RequireAuth(jwtManager, dsHandler.ListTraceDatasources))
	mux.HandleFunc("GET /api/datasources/{id}", auth.RequireAuth(jwtManager, dsHandler.Get))
	mux.HandleFunc("PUT /api/datasources/{id}", auth.RequireAuth(jwtManager, dsHandler.Update))
	mux.HandleFunc("DELETE /api/datasources/{id}", auth.RequireAuth(jwtManager, dsHandler.Delete))
	mux.HandleFunc("GET /api/datasources/{id}/labels", auth.RequireAuth(jwtManager, dsHandler.Labels))
	mux.HandleFunc("GET /api/datasources/{id}/labels/{name}/values", auth.RequireAuth(jwtManager, dsHandler.LabelValues))
	mux.HandleFunc("GET /api/datasources/{id}/metric-names", auth.RequireAuth(jwtManager, dsHandler.MetricNames))
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

	// GitHub Copilot auth routes
	githubCopilotHandler := handlers.NewGitHubCopilotHandler(pool, jwtManager)
	mux.HandleFunc("POST /api/auth/github/device", auth.RequireAuth(jwtManager, githubCopilotHandler.StartDeviceFlow))
	mux.HandleFunc("POST /api/auth/github/device/poll", auth.RequireAuth(jwtManager, githubCopilotHandler.PollDeviceFlow))
	mux.HandleFunc("GET /api/auth/github/connection", auth.RequireAuth(jwtManager, githubCopilotHandler.GetConnection))
	mux.HandleFunc("DELETE /api/auth/github/connection", auth.RequireAuth(jwtManager, githubCopilotHandler.Disconnect))

	// AI provider routes (org-scoped)
	aiHandler := handlers.NewAIHandler(pool)
	mux.HandleFunc("GET /api/orgs/{id}/ai/providers", auth.RequireAuth(jwtManager, auth.RequireOrgMember(pool, aiHandler.ListProviders)))
	mux.HandleFunc("GET /api/orgs/{id}/ai/models", auth.RequireAuth(jwtManager, auth.RequireOrgMember(pool, aiHandler.ListModels)))
	mux.HandleFunc("POST /api/orgs/{id}/ai/chat", auth.RequireAuth(jwtManager, auth.RequireOrgMember(pool, aiHandler.Chat)))
	mux.HandleFunc("POST /api/orgs/{id}/ai/providers", auth.RequireAuth(jwtManager, auth.RequireOrgMember(pool, aiHandler.CreateProvider)))
	mux.HandleFunc("PUT /api/orgs/{id}/ai/providers/{pid}", auth.RequireAuth(jwtManager, auth.RequireOrgMember(pool, aiHandler.UpdateProvider)))
	mux.HandleFunc("DELETE /api/orgs/{id}/ai/providers/{pid}", auth.RequireAuth(jwtManager, auth.RequireOrgMember(pool, aiHandler.DeleteProvider)))
	mux.HandleFunc("POST /api/orgs/{id}/ai/providers/{pid}/test", auth.RequireAuth(jwtManager, auth.RequireOrgMember(pool, aiHandler.TestProvider)))

	// Dashboard variable routes
	variableHandler := handlers.NewVariableHandler(pool)
	mux.HandleFunc("GET /api/dashboards/{id}/variables", auth.RequireAuth(jwtManager, variableHandler.List))
	mux.HandleFunc("POST /api/dashboards/{id}/variables", auth.RequireAuth(jwtManager, variableHandler.BulkCreate))
	mux.HandleFunc("PUT /api/variables/{varId}", auth.RequireAuth(jwtManager, variableHandler.Update))
	mux.HandleFunc("DELETE /api/variables/{varId}", auth.RequireAuth(jwtManager, variableHandler.Delete))

	// Grafana conversion route
	grafanaConverterHandler := handlers.NewGrafanaConverterHandler()
	mux.HandleFunc("POST /api/convert/grafana", auth.RequireAuth(jwtManager, grafanaConverterHandler.Convert))

	// Grafana auto-discovery routes
	grafanaDiscoveryHandler := handlers.NewGrafanaDiscoveryHandler()
	mux.HandleFunc("POST /api/grafana/connect", auth.RequireAuth(jwtManager, grafanaDiscoveryHandler.Connect))
	mux.HandleFunc("GET /api/grafana/dashboards", auth.RequireAuth(jwtManager, grafanaDiscoveryHandler.ListDashboards))
	mux.HandleFunc("GET /api/grafana/dashboards/{uid}", auth.RequireAuth(jwtManager, grafanaDiscoveryHandler.GetDashboard))

	// Apply middleware (httplog inside otelhttp so trace_id is available in context)
	handler := httplog.NewMiddleware(logger)(mux)
	handler = otelhttp.NewHandler(handler, "ace-api")
	handler = corsMiddleware(handler)
	handler = auditLogger.Middleware(handler)

	// Create server
	server := &http.Server{
		Addr:        ":8080",
		Handler:     handler,
		ReadTimeout: 15 * time.Second,
		// WriteTimeout is 0 to allow SSE streaming responses to run as long as
		// needed; per-request context timeouts handle individual request limits.
		WriteTimeout: 0,
		IdleTimeout:  60 * time.Second,
		ErrorLog:     log.New(zap.NewStdLog(logger).Writer(), "", 0),
	}

	// Start server in goroutine
	go func() {
		logger.Info("starting server", zap.String("addr", ":8080"))
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("server error", zap.Error(err))
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("shutting down server")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.Fatal("server forced to shutdown", zap.Error(err))
	}

	logger.Info("server stopped")
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
