package sso

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
	"golang.org/x/oauth2"
)

type recordingTransport struct {
	mu   sync.Mutex
	urls []string
	base http.RoundTripper
}

func (t *recordingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	t.mu.Lock()
	t.urls = append(t.urls, req.URL.String())
	t.mu.Unlock()
	base := t.base
	if base == nil {
		base = http.DefaultTransport
	}
	return base.RoundTrip(req)
}

func (t *recordingTransport) seen(substr string) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	for _, u := range t.urls {
		if strings.Contains(u, substr) {
			return true
		}
	}
	return false
}

func setupOrgWithSSO(t *testing.T, provider, slug, tenantID string) (orgID uuid.UUID, cleanup func()) {
	t.Helper()
	if testPool == nil {
		t.Skip("database not available")
	}
	ctx := context.Background()
	err := testPool.QueryRow(ctx,
		`INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id`,
		"sso-mod-"+slug, slug,
	).Scan(&orgID)
	if err != nil {
		t.Fatalf("create org: %v", err)
	}
	if tenantID == "" {
		_, err = testPool.Exec(ctx,
			`INSERT INTO sso_configs (organization_id, provider, client_id, client_secret, enabled)
			 VALUES ($1, $2, 'cid', 'csecret', true)`,
			orgID, provider,
		)
	} else {
		_, err = testPool.Exec(ctx,
			`INSERT INTO sso_configs (organization_id, provider, client_id, client_secret, tenant_id, enabled)
			 VALUES ($1, $2, 'cid', 'csecret', $3, true)`,
			orgID, provider, tenantID,
		)
	}
	if err != nil {
		t.Fatalf("create sso config: %v", err)
	}
	cleanup = func() {
		testPool.Exec(ctx, `DELETE FROM user_auth_methods WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`, "%@"+slug+".example")
		testPool.Exec(ctx, `DELETE FROM organization_memberships WHERE organization_id = $1`, orgID)
		testPool.Exec(ctx, `DELETE FROM sso_role_mappings WHERE organization_id = $1`, orgID)
		testPool.Exec(ctx, `DELETE FROM sso_configs WHERE organization_id = $1`, orgID)
		testPool.Exec(ctx, `DELETE FROM users WHERE email LIKE $1`, "%@"+slug+".example")
		testPool.Exec(ctx, `DELETE FROM organizations WHERE id = $1`, orgID)
	}
	return orgID, cleanup
}

func TestStart_microsoftTenantIsPathSegment(t *testing.T) {
	slug := "ms-path-" + uuid.NewString()[:8]
	_, cleanup := setupOrgWithSSO(t, "microsoft", slug, "tenant-guid-not-a-host")
	defer cleanup()

	started, err := New(&http.Client{}).Start(context.Background(), testPool, StartRequest{
		Provider:    ProviderMicrosoft,
		OrgSlug:     slug,
		RedirectURL: "http://localhost:8080/api/auth/microsoft/callback",
	})
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	if !strings.Contains(started.AuthURL, "https://login.microsoftonline.com/tenant-guid-not-a-host/") {
		t.Fatalf("microsoft tenant_id must be a path segment, got %s", started.AuthURL)
	}
	if strings.HasPrefix(started.AuthURL, "https://tenant-guid-not-a-host") {
		t.Fatal("microsoft tenant_id must not become the IdP host")
	}
}

func TestStart_typedBoundaryErrors(t *testing.T) {
	if testPool == nil {
		t.Skip("database not available")
	}
	ctx := context.Background()
	mod := New(&http.Client{})

	_, err := mod.Start(ctx, testPool, StartRequest{
		Provider:    ProviderGoogle,
		OrgSlug:     "no-such-org-" + uuid.NewString()[:8],
		RedirectURL: "http://localhost:8080/cb",
	})
	if !errors.Is(err, ErrOrgNotFound) {
		t.Fatalf("missing org: %v, want ErrOrgNotFound", err)
	}

	slug := "sso-ncfg-" + uuid.NewString()[:8]
	var orgID uuid.UUID
	if err := testPool.QueryRow(ctx,
		`INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id`,
		"ncfg", slug,
	).Scan(&orgID); err != nil {
		t.Fatalf("org: %v", err)
	}
	defer testPool.Exec(ctx, `DELETE FROM organizations WHERE id = $1`, orgID)

	_, err = mod.Start(ctx, testPool, StartRequest{
		Provider:    ProviderGoogle,
		OrgSlug:     slug,
		RedirectURL: "http://localhost:8080/cb",
	})
	if !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("missing config: %v, want ErrNotConfigured", err)
	}
	if err.Error() != "google SSO not configured for this organization" {
		t.Fatalf("Error() = %q", err.Error())
	}

	if _, err := testPool.Exec(ctx,
		`INSERT INTO sso_configs (organization_id, provider, client_id, client_secret, enabled)
		 VALUES ($1, 'google', 'cid', 'csecret', false)`, orgID,
	); err != nil {
		t.Fatalf("config: %v", err)
	}
	defer testPool.Exec(ctx, `DELETE FROM sso_configs WHERE organization_id = $1`, orgID)

	_, err = mod.Start(ctx, testPool, StartRequest{
		Provider:    ProviderGoogle,
		OrgSlug:     slug,
		RedirectURL: "http://localhost:8080/cb",
	})
	if !errors.Is(err, ErrNotEnabled) {
		t.Fatalf("disabled: %v, want ErrNotEnabled", err)
	}
}

func TestGoogleIdentity_rejectsNon2xx(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"id":"x","email":"attacker@evil.example","verified_email":true,"name":"X"}`))
	}))
	defer srv.Close()

	prev := googleUserInfoURL
	googleUserInfoURL = srv.URL
	defer func() { googleUserInfoURL = prev }()

	identity, err := googleIdentity(context.Background(), &oauth2.Config{}, &oauth2.Token{AccessToken: "t"})
	if err == nil {
		t.Fatalf("401 userinfo must fail closed, got %+v", identity)
	}
	if identity != nil {
		t.Fatal("must not return identity from error body")
	}
}

func TestMicrosoftIdentity_rejectsNon2xx(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"id":"x","displayName":"X","mail":"attacker@evil.example"}`))
	}))
	defer srv.Close()

	prev := microsoftGraphURL
	microsoftGraphURL = srv.URL
	defer func() { microsoftGraphURL = prev }()

	identity, err := microsoftIdentity(context.Background(), &oauth2.Config{}, &oauth2.Token{AccessToken: "t"})
	if err == nil {
		t.Fatalf("500 graph must fail closed, got %+v", identity)
	}
	if identity != nil {
		t.Fatal("must not return identity from error body")
	}
}

func TestFinish_googleUnknownEmailDoesNotCreateUser(t *testing.T) {
	slug := "g-nouser-" + uuid.NewString()[:8]
	email := "stranger@" + slug + ".example"
	orgID, cleanup := setupOrgWithSSO(t, "google", slug, "")
	defer cleanup()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "/token"):
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"access_token": "mock-access",
				"token_type":   "Bearer",
				"expires_in":   3600,
			})
		case strings.HasSuffix(r.URL.Path, "/userinfo"):
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(googleUserInfo{
				ID:            "google-stranger-1",
				Email:         email,
				VerifiedEmail: true,
				Name:          "Stranger",
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	prevEndpoint, prevUserInfo := googleEndpoint, googleUserInfoURL
	googleEndpoint = oauth2.Endpoint{AuthURL: srv.URL + "/auth", TokenURL: srv.URL + "/token"}
	googleUserInfoURL = srv.URL + "/userinfo"
	defer func() {
		googleEndpoint = prevEndpoint
		googleUserInfoURL = prevUserInfo
	}()

	mod := New(&http.Client{})
	ctx := context.Background()
	_, err := mod.Finish(ctx, testPool, FinishRequest{
		Provider:    ProviderGoogle,
		OrgSlug:     slug,
		RedirectURL: "http://localhost:8080/api/auth/google/callback",
		Code:        "auth-code",
	})
	if !errors.Is(err, ErrNoAccount) {
		t.Fatalf("Finish: %v, want ErrNoAccount", err)
	}

	var userCount int
	if err := testPool.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE email = $1`, email).Scan(&userCount); err != nil {
		t.Fatalf("count users: %v", err)
	}
	if userCount != 0 {
		t.Fatalf("must not create user for unknown Google email, count=%d", userCount)
	}

	var membershipCount int
	if err := testPool.QueryRow(ctx,
		`SELECT COUNT(*) FROM organization_memberships WHERE organization_id = $1`, orgID,
	).Scan(&membershipCount); err != nil {
		t.Fatalf("count memberships: %v", err)
	}
	if membershipCount != 0 {
		t.Fatalf("must not insert membership for stranger, count=%d", membershipCount)
	}
}

func TestFinish_googleExistingUserNoViewerInsert(t *testing.T) {
	slug := "g-finish-" + uuid.NewString()[:8]
	email := "user@" + slug + ".example"
	orgID, cleanup := setupOrgWithSSO(t, "google", slug, "")
	defer cleanup()

	ctx := context.Background()
	var existingID uuid.UUID
	if err := testPool.QueryRow(ctx,
		`INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id`,
		email, "Google User",
	).Scan(&existingID); err != nil {
		t.Fatalf("seed user: %v", err)
	}

	var hits struct {
		token, userinfo int
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "/token"):
			hits.token++
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"access_token": "mock-access",
				"token_type":   "Bearer",
				"expires_in":   3600,
			})
		case strings.HasSuffix(r.URL.Path, "/userinfo"):
			hits.userinfo++
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(googleUserInfo{
				ID:            "google-sub-1",
				Email:         email,
				VerifiedEmail: true,
				Name:          "Google User",
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	prevEndpoint, prevUserInfo := googleEndpoint, googleUserInfoURL
	googleEndpoint = oauth2.Endpoint{AuthURL: srv.URL + "/auth", TokenURL: srv.URL + "/token"}
	googleUserInfoURL = srv.URL + "/userinfo"
	defer func() {
		googleEndpoint = prevEndpoint
		googleUserInfoURL = prevUserInfo
	}()

	rec := &recordingTransport{base: http.DefaultTransport}
	mod := New(&http.Client{Transport: rec})

	var ssoConfigID uuid.UUID
	if err := testPool.QueryRow(ctx,
		`SELECT id FROM sso_configs WHERE organization_id = $1 AND provider = 'google'`, orgID,
	).Scan(&ssoConfigID); err != nil {
		t.Fatalf("sso config id: %v", err)
	}
	if _, err := testPool.Exec(ctx,
		`INSERT INTO sso_role_mappings (organization_id, sso_config_id, sso_group_name, ace_role)
		 VALUES ($1, $2, 'admins', 'admin')`, orgID, ssoConfigID,
	); err != nil {
		t.Fatalf("seed mapping: %v", err)
	}

	result, err := mod.Finish(ctx, testPool, FinishRequest{
		Provider:    ProviderGoogle,
		OrgSlug:     slug,
		RedirectURL: "http://localhost:8080/api/auth/google/callback",
		Code:        "auth-code",
	})
	if err != nil {
		t.Fatalf("Finish: %v", err)
	}
	if result.UserID != existingID {
		t.Errorf("user id = %s, want existing %s", result.UserID, existingID)
	}
	if result.Email != email {
		t.Errorf("email = %q, want %q", result.Email, email)
	}
	if hits.token != 1 || hits.userinfo != 1 {
		t.Fatalf("IdP hits token=%d userinfo=%d, want 1 each", hits.token, hits.userinfo)
	}
	if !rec.seen("/token") || !rec.seen("/userinfo") {
		t.Fatalf("injected client did not see token/userinfo: %v", rec.urls)
	}

	var membershipCount int
	if err := testPool.QueryRow(ctx,
		`SELECT COUNT(*) FROM organization_memberships WHERE user_id = $1 AND organization_id = $2`,
		result.UserID, orgID,
	).Scan(&membershipCount); err != nil {
		t.Fatalf("membership count: %v", err)
	}
	if membershipCount != 0 {
		t.Errorf("google login must not auto-insert viewer membership, count=%d", membershipCount)
	}

	var providerUserID string
	if err := testPool.QueryRow(ctx,
		`SELECT provider_user_id FROM user_auth_methods WHERE user_id = $1 AND provider = 'google'`,
		result.UserID,
	).Scan(&providerUserID); err != nil {
		t.Fatalf("auth method: %v", err)
	}
	if providerUserID != "google-sub-1" {
		t.Errorf("provider_user_id = %q", providerUserID)
	}
}

func TestFinish_microsoftUnknownEmailDoesNotCreateUser(t *testing.T) {
	slug := "ms-nouser-" + uuid.NewString()[:8]
	email := "stranger@" + slug + ".example"
	orgID, cleanup := setupOrgWithSSO(t, "microsoft", slug, "common")
	defer cleanup()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/token"):
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"access_token": "mock-ms",
				"token_type":   "Bearer",
				"expires_in":   3600,
			})
		default:
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(microsoftUserInfo{
				ID:          "ms-stranger-1",
				DisplayName: "MS Stranger",
				Mail:        email,
			})
		}
	}))
	defer srv.Close()

	prevGraph := microsoftGraphURL
	microsoftGraphURL = srv.URL + "/v1.0/me"
	defer func() { microsoftGraphURL = prevGraph }()

	rec := &recordingTransport{base: rewriteHost{target: srv.URL, base: http.DefaultTransport}}
	mod := New(&http.Client{Transport: rec})

	_, err := mod.Finish(context.Background(), testPool, FinishRequest{
		Provider:    ProviderMicrosoft,
		OrgSlug:     slug,
		RedirectURL: "http://localhost:8080/api/auth/microsoft/callback",
		Code:        "auth-code",
	})
	if !errors.Is(err, ErrNoAccount) {
		t.Fatalf("Finish: %v, want ErrNoAccount", err)
	}

	var userCount int
	if err := testPool.QueryRow(context.Background(), `SELECT COUNT(*) FROM users WHERE email = $1`, email).Scan(&userCount); err != nil {
		t.Fatalf("count users: %v", err)
	}
	if userCount != 0 {
		t.Fatalf("must not create user for unknown Microsoft email, count=%d", userCount)
	}

	var membershipCount int
	if err := testPool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM organization_memberships WHERE organization_id = $1`, orgID,
	).Scan(&membershipCount); err != nil {
		t.Fatalf("count memberships: %v", err)
	}
	if membershipCount != 0 {
		t.Fatalf("must not insert membership for stranger, count=%d", membershipCount)
	}
}

func TestFinish_microsoftExistingUserNoViewerInsert(t *testing.T) {
	slug := "ms-finish-" + uuid.NewString()[:8]
	email := "user@" + slug + ".example"
	orgID, cleanup := setupOrgWithSSO(t, "microsoft", slug, "common")
	defer cleanup()

	ctx := context.Background()
	var existingID uuid.UUID
	if err := testPool.QueryRow(ctx,
		`INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id`,
		email, "MS User",
	).Scan(&existingID); err != nil {
		t.Fatalf("seed user: %v", err)
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/token"):
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"access_token": "mock-ms",
				"token_type":   "Bearer",
				"expires_in":   3600,
			})
		default:
			body, _ := io.ReadAll(r.Body)
			_ = body
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(microsoftUserInfo{
				ID:          "ms-sub-1",
				DisplayName: "MS User",
				Mail:        email,
			})
		}
	}))
	defer srv.Close()

	prevGraph := microsoftGraphURL
	microsoftGraphURL = srv.URL + "/v1.0/me"
	defer func() { microsoftGraphURL = prevGraph }()

	rec := &recordingTransport{base: rewriteHost{target: srv.URL, base: http.DefaultTransport}}
	mod := New(&http.Client{Transport: rec})

	result, err := mod.Finish(ctx, testPool, FinishRequest{
		Provider:    ProviderMicrosoft,
		OrgSlug:     slug,
		RedirectURL: "http://localhost:8080/api/auth/microsoft/callback",
		Code:        "auth-code",
	})
	if err != nil {
		t.Fatalf("Finish: %v", err)
	}
	if result.UserID != existingID {
		t.Errorf("user id = %s, want existing %s", result.UserID, existingID)
	}
	if result.Email != email {
		t.Errorf("email = %q, want %q", result.Email, email)
	}

	var membershipCount int
	if err := testPool.QueryRow(ctx,
		`SELECT COUNT(*) FROM organization_memberships WHERE user_id = $1 AND organization_id = $2`,
		result.UserID, orgID,
	).Scan(&membershipCount); err != nil {
		t.Fatalf("membership count: %v", err)
	}
	if membershipCount != 0 {
		t.Errorf("microsoft login must not auto-insert viewer membership, count=%d", membershipCount)
	}
	if !rec.seen("login.microsoftonline.com") && !rec.seen("/token") {
		t.Fatalf("injected client did not see token exchange: %v", rec.urls)
	}
}

type rewriteHost struct {
	target string
	base   http.RoundTripper
}

func (r rewriteHost) RoundTrip(req *http.Request) (*http.Response, error) {
	clone := req.Clone(req.Context())
	u := *req.URL
	target := strings.TrimPrefix(r.target, "http://")
	target = strings.TrimPrefix(target, "https://")
	u.Scheme = "http"
	u.Host = target
	clone.URL = &u
	clone.Host = target
	return r.base.RoundTrip(clone)
}

func TestApplyOktaMembership_mappingApplyAndManualOverride(t *testing.T) {
	if testPool == nil {
		t.Skip("database not available")
	}
	ctx := context.Background()
	slug := "okta-map-" + uuid.NewString()[:8]

	var orgID uuid.UUID
	if err := testPool.QueryRow(ctx,
		`INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id`,
		"okta-map", slug,
	).Scan(&orgID); err != nil {
		t.Fatalf("org: %v", err)
	}
	defer testPool.Exec(ctx, `DELETE FROM organizations WHERE id = $1`, orgID)

	var userID uuid.UUID
	email := "okta@" + slug + ".example"
	if err := testPool.QueryRow(ctx,
		`INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id`,
		email, "Okta User",
	).Scan(&userID); err != nil {
		t.Fatalf("user: %v", err)
	}
	defer testPool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	defer testPool.Exec(ctx, `DELETE FROM organization_memberships WHERE user_id = $1`, userID)

	var cfgID uuid.UUID
	if err := testPool.QueryRow(ctx,
		`INSERT INTO sso_configs (organization_id, provider, client_id, client_secret, tenant_id, enabled, default_role)
		 VALUES ($1, 'okta', 'cid', 'csecret', 'dev.okta.com', true, 'viewer') RETURNING id`,
		orgID,
	).Scan(&cfgID); err != nil {
		t.Fatalf("sso config: %v", err)
	}
	defer testPool.Exec(ctx, `DELETE FROM sso_configs WHERE id = $1`, cfgID)

	if _, err := testPool.Exec(ctx,
		`INSERT INTO sso_role_mappings (organization_id, sso_config_id, sso_group_name, ace_role)
		 VALUES ($1, $2, 'admins', 'admin'), ($1, $2, 'editors', 'editor')`,
		orgID, cfgID,
	); err != nil {
		t.Fatalf("mappings: %v", err)
	}
	defer testPool.Exec(ctx, `DELETE FROM sso_role_mappings WHERE sso_config_id = $1`, cfgID)

	cfg := &providerConfig{id: cfgID, orgID: orgID, defaultRole: "viewer"}

	if err := applyOktaMembership(ctx, testPool, userID, cfg, []string{"admins"}); err != nil {
		t.Fatalf("insert sso membership: %v", err)
	}
	assertRole(t, ctx, userID, orgID, "admin", "sso")

	if err := applyOktaMembership(ctx, testPool, userID, cfg, []string{"editors"}); err != nil {
		t.Fatalf("update sso membership: %v", err)
	}
	assertRole(t, ctx, userID, orgID, "editor", "sso")

	if _, err := testPool.Exec(ctx,
		`UPDATE organization_memberships SET role = 'viewer', role_source = 'manual' WHERE user_id = $1 AND organization_id = $2`,
		userID, orgID,
	); err != nil {
		t.Fatalf("set manual: %v", err)
	}
	if err := applyOktaMembership(ctx, testPool, userID, cfg, []string{"admins"}); err != nil {
		t.Fatalf("manual override apply: %v", err)
	}
	assertRole(t, ctx, userID, orgID, "viewer", "manual")
}

func assertRole(t *testing.T, ctx context.Context, userID, orgID uuid.UUID, wantRole, wantSource string) {
	t.Helper()
	var role, source string
	if err := testPool.QueryRow(ctx,
		`SELECT role, role_source FROM organization_memberships WHERE user_id = $1 AND organization_id = $2`,
		userID, orgID,
	).Scan(&role, &source); err != nil {
		t.Fatalf("query role: %v", err)
	}
	if role != wantRole || source != wantSource {
		t.Fatalf("got role=%s source=%s, want role=%s source=%s", role, source, wantRole, wantSource)
	}
}
