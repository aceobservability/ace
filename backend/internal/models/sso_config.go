package models

import (
	"time"

	"github.com/google/uuid"
)

type SSOProvider string

const (
	SSOGoogle        SSOProvider = "google"
	SSOMicrosoft     SSOProvider = "microsoft"
	SSOOkta          SSOProvider = "okta"
	SSOGitHubCopilot SSOProvider = "github_copilot"
)

type SSOConfig struct {
	ID              uuid.UUID   `json:"id"`
	OrganizationID  uuid.UUID   `json:"organization_id"`
	Provider        SSOProvider `json:"provider"`
	ClientID        string      `json:"client_id"`
	ClientSecret    string      `json:"-"`
	TenantID        *string     `json:"tenant_id,omitempty"`
	Enabled         bool        `json:"enabled"`
	GroupsClaimName string      `json:"groups_claim_name"`
	DefaultRole     string      `json:"default_role"`
	CreatedAt       time.Time   `json:"created_at"`
	UpdatedAt       time.Time   `json:"updated_at"`
}

type CreateSSOConfigRequest struct {
	OrganizationID uuid.UUID   `json:"organization_id"`
	Provider       SSOProvider `json:"provider"`
	ClientID       string      `json:"client_id"`
	ClientSecret   string      `json:"client_secret"`
	TenantID       *string     `json:"tenant_id,omitempty"`
	Enabled        *bool       `json:"enabled,omitempty"`
}

type UpdateSSOConfigRequest struct {
	ClientID     *string `json:"client_id,omitempty"`
	ClientSecret *string `json:"client_secret,omitempty"`
	TenantID     *string `json:"tenant_id,omitempty"`
	Enabled      *bool   `json:"enabled,omitempty"`
}
