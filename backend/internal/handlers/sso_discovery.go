package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
)

// SSODiscoveryHandler serves public (unauthenticated) SSO provider info
// so the login page can show the correct SSO buttons for a given org.
type SSODiscoveryHandler struct {
	pool *pgxpool.Pool
}

// NewSSODiscoveryHandler creates an SSODiscoveryHandler.
func NewSSODiscoveryHandler(pool *pgxpool.Pool) *SSODiscoveryHandler {
	return &SSODiscoveryHandler{pool: pool}
}

// SSOProviderEntry is one item in the discovery response.
type SSOProviderEntry struct {
	Provider string `json:"provider"`
}

// ListProviders returns the enabled SSO providers for an org identified by slug.
// This endpoint is public — no authentication required.
// Non-existent orgs and orgs with no providers both return an empty array.
func (h *SSODiscoveryHandler) ListProviders(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")

	rows, err := h.pool.Query(r.Context(),
		`SELECT provider FROM sso_configs
		 WHERE organization_id = (SELECT id FROM organizations WHERE slug = $1)
		 AND enabled = true`, slug)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode([]SSOProviderEntry{})
		return
	}
	defer rows.Close()

	providers := []SSOProviderEntry{}
	for rows.Next() {
		var p SSOProviderEntry
		if err := rows.Scan(&p.Provider); err != nil {
			continue
		}
		providers = append(providers, p)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(providers)
}
