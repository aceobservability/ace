package models

import (
	"time"

	"github.com/google/uuid"
)

type AuditLogEntry struct {
	ID             uuid.UUID  `json:"id"`
	OrganizationID uuid.UUID  `json:"organization_id"`
	ActorID        *uuid.UUID `json:"actor_id,omitempty"`
	ActorEmail     string     `json:"actor_email"`
	Action         string     `json:"action"`
	ResourceType   *string    `json:"resource_type,omitempty"`
	ResourceID     *uuid.UUID `json:"resource_id,omitempty"`
	ResourceName   *string    `json:"resource_name,omitempty"`
	Outcome        string     `json:"outcome"`
	IPAddress      *string    `json:"ip_address,omitempty"`
	Metadata       any        `json:"metadata,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
}
