package sso

import "errors"

// Sentinels at the module/handler boundary. Handlers map these with errors.Is.
var (
	ErrGenerateState   = errors.New("failed to generate state")
	ErrEmailUnverified = errors.New("email not verified")
	ErrNoEmail         = errors.New("no email found")
	ErrOrgNotFound     = errors.New("organization not found")
	ErrIDToken         = errors.New("failed to verify ID token")
	ErrNotConfigured   = errors.New("SSO not configured for this organization")
	ErrNotEnabled      = errors.New("SSO is not enabled for this organization")
)
