package models

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID           uuid.UUID `json:"id"`
	Email        string    `json:"email"`
	PasswordHash *string   `json:"-"`
	Name         *string   `json:"name,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type CreateUserRequest struct {
	Email    string  `json:"email"`
	Password *string `json:"password,omitempty"`
	Name     *string `json:"name,omitempty"`
}

type UpdateUserRequest struct {
	Email    *string `json:"email,omitempty"`
	Password *string `json:"password,omitempty"`
	Name     *string `json:"name,omitempty"`
}

type MembershipRole string

const (
	RoleAdmin   MembershipRole = "admin"
	RoleEditor  MembershipRole = "editor"
	RoleViewer  MembershipRole = "viewer"
	RoleAuditor MembershipRole = "auditor"
)

type OrganizationMembership struct {
	ID             uuid.UUID      `json:"id"`
	OrganizationID uuid.UUID      `json:"organization_id"`
	UserID         uuid.UUID      `json:"user_id"`
	Role           MembershipRole `json:"role"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
}

type CreateMembershipRequest struct {
	OrganizationID uuid.UUID      `json:"organization_id"`
	UserID         uuid.UUID      `json:"user_id"`
	Role           MembershipRole `json:"role"`
}

type UpdateMembershipRequest struct {
	Role *MembershipRole `json:"role,omitempty"`
}

type UserAuthMethod struct {
	ID             uuid.UUID `json:"id"`
	UserID         uuid.UUID `json:"user_id"`
	Provider       string    `json:"provider"`
	ProviderUserID string    `json:"provider_user_id"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}
