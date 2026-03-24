package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
)

// helper: create org, optionally insert sso_configs rows, return cleanup func.
func setupDiscoveryFixture(t *testing.T, slug string, providers []struct {
	provider string
	enabled  bool
}) (uuid.UUID, func()) {
	t.Helper()
	if testPool == nil {
		t.Skip("Database not available")
	}
	ctx := context.Background()

	var orgID uuid.UUID
	err := testPool.QueryRow(ctx,
		`INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id`,
		"Org "+slug, slug,
	).Scan(&orgID)
	if err != nil {
		t.Fatalf("Failed to create test org: %v", err)
	}

	for _, p := range providers {
		_, err := testPool.Exec(ctx,
			`INSERT INTO sso_configs (organization_id, provider, client_id, client_secret, enabled)
			 VALUES ($1, $2, 'cid', 'csec', $3)`,
			orgID, p.provider, p.enabled,
		)
		if err != nil {
			t.Fatalf("Failed to insert sso_config: %v", err)
		}
	}

	cleanup := func() {
		testPool.Exec(ctx, `DELETE FROM sso_configs WHERE organization_id = $1`, orgID)
		testPool.Exec(ctx, `DELETE FROM organizations WHERE id = $1`, orgID)
	}
	return orgID, cleanup
}

func callListProviders(t *testing.T, slug string) *httptest.ResponseRecorder {
	t.Helper()
	handler := NewSSODiscoveryHandler(testPool)
	req := httptest.NewRequest("GET", "/api/orgs/"+slug+"/sso/providers", nil)
	req.SetPathValue("slug", slug)
	w := httptest.NewRecorder()
	handler.ListProviders(w, req)
	return w
}

// 1. Returns providers for org with configured SSO
func TestListProvidersReturnsConfigured(t *testing.T) {
	_, cleanup := setupDiscoveryFixture(t, "disc-has-sso", []struct {
		provider string
		enabled  bool
	}{
		{"google", true},
		{"okta", true},
	})
	defer cleanup()

	w := callListProviders(t, "disc-has-sso")

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var result []SSOProviderEntry
	if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if len(result) != 2 {
		t.Fatalf("Expected 2 providers, got %d", len(result))
	}

	names := map[string]bool{}
	for _, p := range result {
		names[p.Provider] = true
	}
	if !names["google"] || !names["okta"] {
		t.Errorf("Expected google and okta, got %v", result)
	}
}

// 2. Returns empty array for org with no SSO configured
func TestListProvidersEmptyWhenNoSSO(t *testing.T) {
	_, cleanup := setupDiscoveryFixture(t, "disc-no-sso", nil)
	defer cleanup()

	w := callListProviders(t, "disc-no-sso")

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d", w.Code)
	}

	var result []SSOProviderEntry
	if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}
	if len(result) != 0 {
		t.Errorf("Expected empty array, got %v", result)
	}
}

// 3. Returns empty array for non-existent org (no 404, no error)
func TestListProvidersNonExistentOrg(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	w := callListProviders(t, "org-does-not-exist-xyz")

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d", w.Code)
	}

	var result []SSOProviderEntry
	if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}
	if len(result) != 0 {
		t.Errorf("Expected empty array for non-existent org, got %v", result)
	}
}

// 4. Does not include disabled providers
func TestListProvidersExcludesDisabled(t *testing.T) {
	_, cleanup := setupDiscoveryFixture(t, "disc-mixed", []struct {
		provider string
		enabled  bool
	}{
		{"google", true},
		{"microsoft", false},
	})
	defer cleanup()

	w := callListProviders(t, "disc-mixed")

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d", w.Code)
	}

	var result []SSOProviderEntry
	if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if len(result) != 1 {
		t.Fatalf("Expected 1 provider, got %d: %v", len(result), result)
	}
	if result[0].Provider != "google" {
		t.Errorf("Expected google, got %s", result[0].Provider)
	}
}
