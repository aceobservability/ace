package main

import "net/http"

func main() {
	mux := http.NewServeMux()

	// Health endpoint
	mux.HandleFunc("GET /api/health", handlers.HealthCheck)

	// Auth routes
	authHandler := handlers.NewAuthHandler()
	mux.HandleFunc("POST /api/auth/login", authHandler.Login)
	mux.HandleFunc("GET /api/auth/me", auth.RequireAuth(jwtManager, authHandler.Me))

	// Org routes
	orgHandler := handlers.NewOrgHandler()
	mux.HandleFunc("POST /api/orgs/{id}/items", auth.RequireAuth(jwtManager, auth.RequireOrgMember(pool, orgHandler.CreateItem)))
}
