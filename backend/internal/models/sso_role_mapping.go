package models

import (
	"time"

	"github.com/google/uuid"
)

type SSOConfigRoleMapping struct {
	ID             uuid.UUID `json:"id"`
	OrganizationID uuid.UUID `json:"organization_id"`
	SSOConfigID    uuid.UUID `json:"sso_config_id"`
	SSOGroupName   string    `json:"sso_group_name"`
	AceRole        string    `json:"ace_role"`
	CreatedAt      time.Time `json:"created_at"`
}

type CreateSSOConfigRoleMappingRequest struct {
	SSOGroupName string `json:"sso_group_name"`
	AceRole      string `json:"ace_role"`
}
