package models

import (
	"time"

	"github.com/google/uuid"
)

type OrgBranding struct {
	PrimaryColor *string `json:"primary_color,omitempty"`
	LogoDataURI  *string `json:"logo_data_uri,omitempty"`
	AppTitle     *string `json:"app_title,omitempty"`
}

type Organization struct {
	ID        uuid.UUID   `json:"id"`
	Name      string      `json:"name"`
	Slug      string      `json:"slug"`
	CreatedAt time.Time   `json:"created_at"`
	UpdatedAt time.Time   `json:"updated_at"`
	Branding  OrgBranding `json:"branding"`
}

type CreateOrganizationRequest struct {
	Name string `json:"name"`
	Slug string `json:"slug"`
}

type UpdateOrganizationRequest struct {
	Name *string `json:"name,omitempty"`
	Slug *string `json:"slug,omitempty"`
}
