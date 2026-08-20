package sso

import (
	"context"
	"encoding/json"
	"fmt"
	"io"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/oauth2"

	"github.com/aceobservability/ace/backend/internal/models"
)

// FinishRequest is the input to Finish after the handler has verified the
// OAuth state cookie and extracted the authorization code.
type FinishRequest struct {
	Provider    Provider
	OrgSlug     string
	RedirectURL string
	Code        string
}

// FinishResult is the local user identity after exchange + existing-user lookup.
type FinishResult struct {
	UserID uuid.UUID
	Email  string
	Name   string
	OrgID  uuid.UUID
}

type googleUserInfo struct {
	ID            string `json:"id"`
	Email         string `json:"email"`
	VerifiedEmail bool   `json:"verified_email"`
	Name          string `json:"name"`
}

type microsoftUserInfo struct {
	ID                string `json:"id"`
	DisplayName       string `json:"displayName"`
	Mail              string `json:"mail"`
	UserPrincipalName string `json:"userPrincipalName"`
}

type idpIdentity struct {
	providerUserID string
	email          string
	name           string
	groups         []string
}

// Finish exchanges the authorization code, fetches identity from the IdP
// through the injected client, signs in an existing user (email match), and
// applies membership. Google/Microsoft never create users or insert viewer
// membership. Okta applies role mappings for existing users only (and respects
// manual role_source overrides).
func (m *Module) Finish(ctx context.Context, pool *pgxpool.Pool, req FinishRequest) (*FinishResult, error) {
	cfg, err := loadEnabledConfig(ctx, pool, req.OrgSlug, req.Provider)
	if err != nil {
		return nil, err
	}
	oauthCfg, err := oauth2Config(req.Provider, cfg, req.RedirectURL)
	if err != nil {
		return nil, err
	}

	idpCtx := m.clientContext(ctx)
	token, err := oauthCfg.Exchange(idpCtx, req.Code)
	if err != nil {
		return nil, fmt.Errorf("failed to exchange code for token")
	}

	identity, err := m.identityFromToken(idpCtx, req.Provider, oauthCfg, cfg, token)
	if err != nil {
		return nil, err
	}

	userID, email, name, err := findExistingUser(ctx, pool, identity.email)
	if err != nil {
		return nil, err
	}

	switch req.Provider {
	case ProviderGoogle, ProviderMicrosoft:
		// Sign-in only. Do not create org memberships for strangers.
	case ProviderOkta:
		if err := applyOktaMembership(ctx, pool, userID, cfg, identity.groups); err != nil {
			return nil, err
		}
	default:
		return nil, fmt.Errorf("unsupported SSO provider %q", req.Provider)
	}

	_, err = pool.Exec(ctx,
		`INSERT INTO user_auth_methods (user_id, provider, provider_user_id)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (user_id, provider) DO UPDATE SET provider_user_id = $3, updated_at = NOW()`,
		userID, string(req.Provider), identity.providerUserID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to link %s account", req.Provider)
	}

	return &FinishResult{
		UserID: userID,
		Email:  email,
		Name:   name,
		OrgID:  cfg.orgID,
	}, nil
}

func (m *Module) identityFromToken(
	ctx context.Context,
	provider Provider,
	oauthCfg *oauth2.Config,
	cfg *providerConfig,
	token *oauth2.Token,
) (*idpIdentity, error) {
	switch provider {
	case ProviderGoogle:
		return googleIdentity(ctx, oauthCfg, token)
	case ProviderMicrosoft:
		return microsoftIdentity(ctx, oauthCfg, token)
	case ProviderOkta:
		return oktaIdentity(ctx, cfg, token)
	default:
		return nil, fmt.Errorf("unsupported SSO provider %q", provider)
	}
}

func googleIdentity(ctx context.Context, oauthCfg *oauth2.Config, token *oauth2.Token) (*idpIdentity, error) {
	client := oauthCfg.Client(ctx, token)
	resp, err := client.Get(googleUserInfoURL)
	if err != nil {
		return nil, fmt.Errorf("failed to get user info")
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("user info request failed")
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read user info")
	}

	var userInfo googleUserInfo
	if err := json.Unmarshal(body, &userInfo); err != nil {
		return nil, fmt.Errorf("failed to parse user info")
	}
	if !userInfo.VerifiedEmail {
		return nil, fmt.Errorf("%w", ErrEmailUnverified)
	}
	return &idpIdentity{
		providerUserID: userInfo.ID,
		email:          userInfo.Email,
		name:           userInfo.Name,
	}, nil
}

func microsoftIdentity(ctx context.Context, oauthCfg *oauth2.Config, token *oauth2.Token) (*idpIdentity, error) {
	client := oauthCfg.Client(ctx, token)
	resp, err := client.Get(microsoftGraphURL)
	if err != nil {
		return nil, fmt.Errorf("failed to get user info")
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("user info request failed")
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read user info")
	}

	var userInfo microsoftUserInfo
	if err := json.Unmarshal(body, &userInfo); err != nil {
		return nil, fmt.Errorf("failed to parse user info")
	}
	email := userInfo.Mail
	if email == "" {
		email = userInfo.UserPrincipalName
	}
	if email == "" {
		return nil, fmt.Errorf("%w in user info", ErrNoEmail)
	}
	return &idpIdentity{
		providerUserID: userInfo.ID,
		email:          email,
		name:           userInfo.DisplayName,
	}, nil
}

func oktaIdentity(ctx context.Context, cfg *providerConfig, token *oauth2.Token) (*idpIdentity, error) {
	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok || rawIDToken == "" {
		return nil, fmt.Errorf("no id_token in token response")
	}

	issuerURL := fmt.Sprintf("https://%s", cfg.tenantID)
	provider, err := oidc.NewProvider(ctx, issuerURL)
	if err != nil {
		return nil, fmt.Errorf("failed to create OIDC provider")
	}

	verifier := provider.Verifier(&oidc.Config{ClientID: cfg.clientID})
	idToken, err := verifier.Verify(ctx, rawIDToken)
	if err != nil {
		return nil, fmt.Errorf("%w", ErrIDToken)
	}

	var rawClaims map[string]json.RawMessage
	if err := idToken.Claims(&rawClaims); err != nil {
		return nil, fmt.Errorf("failed to parse ID token claims")
	}

	var email, name string
	if emailRaw, ok := rawClaims["email"]; ok {
		_ = json.Unmarshal(emailRaw, &email)
	}
	if nameRaw, ok := rawClaims["name"]; ok {
		_ = json.Unmarshal(nameRaw, &name)
	}
	if email == "" {
		return nil, fmt.Errorf("%w in ID token", ErrNoEmail)
	}

	var userGroups []string
	groupsClaim := cfg.groupsClaimName
	if groupsClaim == "" {
		groupsClaim = "groups"
	}
	if groupsRaw, ok := rawClaims[groupsClaim]; ok {
		_ = json.Unmarshal(groupsRaw, &userGroups)
	}

	return &idpIdentity{
		providerUserID: idToken.Subject,
		email:          email,
		name:           name,
		groups:         userGroups,
	}, nil
}

func findExistingUser(ctx context.Context, pool *pgxpool.Pool, email string) (uuid.UUID, string, string, error) {
	var userID uuid.UUID
	var userEmail string
	var userName *string

	err := pool.QueryRow(ctx,
		`SELECT id, email, name FROM users WHERE email = $1`,
		email,
	).Scan(&userID, &userEmail, &userName)
	if err == pgx.ErrNoRows {
		return uuid.Nil, "", "", ErrNoAccount
	}
	if err != nil {
		return uuid.Nil, "", "", fmt.Errorf("failed to check user")
	}

	displayName := ""
	if userName != nil {
		displayName = *userName
	}
	return userID, userEmail, displayName, nil
}

func applyOktaMembership(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID, cfg *providerConfig, userGroups []string) error {
	var mappings []models.SSOConfigRoleMapping
	rows, err := pool.Query(ctx,
		`SELECT id, organization_id, sso_config_id, sso_group_name, ace_role, created_at
		 FROM sso_role_mappings
		 WHERE sso_config_id = $1`,
		cfg.id,
	)
	if err != nil {
		return fmt.Errorf("failed to query role mappings")
	}
	defer rows.Close()

	for rows.Next() {
		var mapping models.SSOConfigRoleMapping
		if err := rows.Scan(&mapping.ID, &mapping.OrganizationID, &mapping.SSOConfigID, &mapping.SSOGroupName, &mapping.AceRole, &mapping.CreatedAt); err != nil {
			return fmt.Errorf("failed to scan role mapping")
		}
		mappings = append(mappings, mapping)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("failed to iterate role mappings")
	}

	defaultRole := cfg.defaultRole
	if defaultRole == "" {
		defaultRole = "viewer"
	}
	resolvedRole := ResolveRoleFromMappings(userGroups, mappings, defaultRole)

	var existingRole, existingRoleSource string
	err = pool.QueryRow(ctx,
		`SELECT role, role_source FROM organization_memberships WHERE user_id = $1 AND organization_id = $2`,
		userID, cfg.orgID,
	).Scan(&existingRole, &existingRoleSource)

	if err == pgx.ErrNoRows {
		_, err = pool.Exec(ctx,
			`INSERT INTO organization_memberships (user_id, organization_id, role, role_source) VALUES ($1, $2, $3, 'sso')`,
			userID, cfg.orgID, resolvedRole,
		)
		if err != nil {
			return fmt.Errorf("failed to add user to organization")
		}
		return nil
	}
	if err != nil {
		return fmt.Errorf("failed to check membership")
	}
	if existingRoleSource == "sso" {
		_, err = pool.Exec(ctx,
			`UPDATE organization_memberships SET role = $1, updated_at = NOW() WHERE user_id = $2 AND organization_id = $3`,
			resolvedRole, userID, cfg.orgID,
		)
		if err != nil {
			return fmt.Errorf("failed to update membership role")
		}
	}
	return nil
}
