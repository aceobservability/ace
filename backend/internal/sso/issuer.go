package sso

import (
	"context"
	"fmt"
	"strings"

	"github.com/coreos/go-oidc/v3/oidc"

	"github.com/aceobservability/ace/backend/internal/ssrf"
)

// ValidateIssuer checks that an Okta tenant_id can be used as an IdP host.
// Issuer and token URLs are built as https://{tenant} and
// https://{tenant}/oauth2/v1/token, then passed through ssrf.ValidateURL
// (fail-closed at configure time). Private, loopback, and cloud-metadata
// hosts are rejected. Microsoft tenant_id is a path segment, not a host,
// and must not go through this function.
func ValidateIssuer(tenantID string) error {
	tenantID = strings.TrimSpace(tenantID)
	if tenantID == "" {
		return fmt.Errorf("tenant_id must be a valid hostname (e.g. dev-12345.okta.com)")
	}
	if strings.Contains(tenantID, "://") || strings.ContainsAny(tenantID, " /@\\") {
		return fmt.Errorf("tenant_id must be a valid hostname (e.g. dev-12345.okta.com)")
	}

	issuer := "https://" + tenantID
	tokenURL := issuer + "/oauth2/v1/token"
	if _, err := ssrf.ValidateURL(issuer); err != nil {
		return fmt.Errorf("invalid Okta issuer: %w", err)
	}
	if _, err := ssrf.ValidateURL(tokenURL); err != nil {
		return fmt.Errorf("invalid Okta token URL: %w", err)
	}
	return nil
}

// TestIssuer runs OIDC discovery against the Okta domain using the injected
// client (production: SafeClient). URL policy is applied first so metadata
// and private hosts fail closed without a default-client fallback.
func (m *Module) TestIssuer(ctx context.Context, tenantID string) error {
	if err := ValidateIssuer(tenantID); err != nil {
		return err
	}
	issuerURL := "https://" + tenantID
	_, err := oidc.NewProvider(m.clientContext(ctx), issuerURL)
	return err
}
