// Package sso implements organization SSO login (Google, Microsoft, Okta).
//
// Identity-provider HTTP uses the *http.Client passed to New — production
// injects ssrf.SafeClient so IdP hosts cannot be private/RFC1918. Never use
// ssrf.DatasourceClient here (that allow-list would permit on-prem IdPs,
// which are not a product need). See docs/adr/0003-outbound-http-ssrf-policy-seams.md.
package sso

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"net/http"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

// Provider is an organization SSO identity provider. Copilot device-flow is
// out of scope for this package.
type Provider string

const (
	ProviderGoogle    Provider = "google"
	ProviderMicrosoft Provider = "microsoft"
	ProviderOkta      Provider = "okta"
)

// Overridable in tests so exchange/userinfo can target httptest servers.
// Production keeps the real Google/Microsoft endpoints.
var (
	googleEndpoint    = google.Endpoint
	googleUserInfoURL = "https://www.googleapis.com/oauth2/v2/userinfo"
	microsoftGraphURL = "https://graph.microsoft.com/v1.0/me"
)

// Module owns SSO Start / Finish / TestIssuer. Handlers are HTTP adapters
// (cookies, hash redirect). One injected client is used for every IdP call.
type Module struct {
	client *http.Client
}

// New returns a login module that performs all IdP HTTP through client.
// client must be non-nil — there is no package-level default (that would
// silently use http.DefaultClient and bypass SSRF policy).
func New(client *http.Client) *Module {
	if client == nil {
		panic("sso.New: http client is required (inject ssrf.SafeClient)")
	}
	return &Module{client: client}
}

// clientContext attaches the injected client for oauth2.Exchange / oauth2
// userinfo and oidc.NewProvider / Verify. Both keys are set so neither
// library falls back to http.DefaultClient.
func (m *Module) clientContext(ctx context.Context) context.Context {
	ctx = context.WithValue(ctx, oauth2.HTTPClient, m.client)
	return oidc.ClientContext(ctx, m.client)
}

// StartRequest is the input to Start.
type StartRequest struct {
	Provider    Provider
	OrgSlug     string
	RedirectURL string
}

// StartResult is the authorization-code redirect to send the browser to.
type StartResult struct {
	AuthURL string
	State   string
}

// Start loads the enabled provider config and returns the IdP authorize URL.
// It does not talk to the IdP over HTTP (authorize is a browser redirect).
func (m *Module) Start(ctx context.Context, pool *pgxpool.Pool, req StartRequest) (*StartResult, error) {
	cfg, err := loadEnabledConfig(ctx, pool, req.OrgSlug, req.Provider)
	if err != nil {
		return nil, err
	}
	oauthCfg, err := oauth2Config(req.Provider, cfg, req.RedirectURL)
	if err != nil {
		return nil, err
	}
	state, err := generateState()
	if err != nil {
		return nil, fmt.Errorf("%w", ErrGenerateState)
	}
	return &StartResult{
		AuthURL: oauthCfg.AuthCodeURL(state),
		State:   state,
	}, nil
}

func generateState() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}

type providerConfig struct {
	id              uuid.UUID
	orgID           uuid.UUID
	clientID        string
	clientSecret    string
	tenantID        string
	groupsClaimName string
	defaultRole     string
}

func loadEnabledConfig(ctx context.Context, pool *pgxpool.Pool, orgSlug string, provider Provider) (*providerConfig, error) {
	var orgID uuid.UUID
	err := pool.QueryRow(ctx, `SELECT id FROM organizations WHERE slug = $1`, orgSlug).Scan(&orgID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("%w", ErrOrgNotFound)
		}
		return nil, err
	}

	var cfg providerConfig
	var tenantID *string
	var enabled bool
	err = pool.QueryRow(ctx,
		`SELECT id, organization_id, client_id, client_secret, tenant_id, enabled, groups_claim_name, default_role
		 FROM sso_configs WHERE organization_id = $1 AND provider = $2`,
		orgID, string(provider),
	).Scan(&cfg.id, &cfg.orgID, &cfg.clientID, &cfg.clientSecret, &tenantID, &enabled, &cfg.groupsClaimName, &cfg.defaultRole)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("%s %w", provider, ErrNotConfigured)
		}
		return nil, err
	}
	if !enabled {
		return nil, fmt.Errorf("%s %w", provider, ErrNotEnabled)
	}

	if tenantID != nil {
		cfg.tenantID = *tenantID
	}
	cfg.orgID = orgID
	return &cfg, nil
}

func oauth2Config(provider Provider, cfg *providerConfig, redirectURL string) (*oauth2.Config, error) {
	switch provider {
	case ProviderGoogle:
		return &oauth2.Config{
			ClientID:     cfg.clientID,
			ClientSecret: cfg.clientSecret,
			RedirectURL:  redirectURL,
			Scopes:       []string{"email", "profile"},
			Endpoint:     googleEndpoint,
		}, nil
	case ProviderMicrosoft:
		tenant, err := ValidateMicrosoftTenant(cfg.tenantID)
		if err != nil {
			return nil, err
		}
		return &oauth2.Config{
			ClientID:     cfg.clientID,
			ClientSecret: cfg.clientSecret,
			RedirectURL:  redirectURL,
			Scopes:       []string{"openid", "email", "profile", "User.Read"},
			Endpoint: oauth2.Endpoint{
				AuthURL:  fmt.Sprintf("https://login.microsoftonline.com/%s/oauth2/v2.0/authorize", tenant),
				TokenURL: fmt.Sprintf("https://login.microsoftonline.com/%s/oauth2/v2.0/token", tenant),
			},
		}, nil
	case ProviderOkta:
		if cfg.tenantID == "" {
			return nil, fmt.Errorf("okta SSO domain not configured")
		}
		return &oauth2.Config{
			ClientID:     cfg.clientID,
			ClientSecret: cfg.clientSecret,
			RedirectURL:  redirectURL,
			Scopes:       []string{"openid", "email", "profile", "groups"},
			Endpoint: oauth2.Endpoint{
				AuthURL:  fmt.Sprintf("https://%s/oauth2/v1/authorize", cfg.tenantID),
				TokenURL: fmt.Sprintf("https://%s/oauth2/v1/token", cfg.tenantID),
			},
		}, nil
	default:
		return nil, fmt.Errorf("unsupported SSO provider %q", provider)
	}
}
