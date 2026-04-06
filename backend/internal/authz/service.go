package authz

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/aceobservability/ace/backend/internal/models"
)

type ResourceType string

const (
	ResourceTypeFolder    ResourceType = "folder"
	ResourceTypeDashboard ResourceType = "dashboard"
)

type Permission string

const (
	PermissionNone  Permission = "none"
	PermissionView  Permission = "view"
	PermissionEdit  Permission = "edit"
	PermissionAdmin Permission = "admin"
)

type Action string

const (
	ActionView  Action = "view"
	ActionEdit  Action = "edit"
	ActionAdmin Action = "admin"
)

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

func (s *Service) Can(
	ctx context.Context,
	userID, orgID uuid.UUID,
	resourceType ResourceType,
	resourceID uuid.UUID,
	action Action,
) (bool, error) {
	permission, err := s.ResolvePermission(ctx, userID, orgID, resourceType, resourceID)
	if err != nil {
		return false, err
	}

	return permission.Allows(action), nil
}

func (s *Service) ResolvePermission(
	ctx context.Context,
	userID, orgID uuid.UUID,
	resourceType ResourceType,
	resourceID uuid.UUID,
) (Permission, error) {
	role, err := s.organizationRole(ctx, userID, orgID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return PermissionNone, nil
		}
		return PermissionNone, fmt.Errorf("failed to load organization role: %w", err)
	}

	exists, err := s.resourceExists(ctx, orgID, resourceType, resourceID)
	if err != nil {
		return PermissionNone, err
	}
	if !exists {
		return PermissionNone, nil
	}

	if role == models.RoleAdmin {
		return PermissionAdmin, nil
	}

	resourceHasACL, err := s.resourceHasACL(ctx, orgID, resourceType, resourceID)
	if err != nil {
		return PermissionNone, fmt.Errorf("failed to check resource acl entries: %w", err)
	}

	if !resourceHasACL {
		return orgRoleFallbackPermission(role, resourceType), nil
	}

	permission, err := s.explicitPermission(ctx, userID, orgID, resourceType, resourceID)
	if err != nil {
		return PermissionNone, err
	}

	return permission, nil
}

func (p Permission) Allows(action Action) bool {
	required, ok := actionMinimumPermission(action)
	if !ok {
		return false
	}

	return permissionRank(p) >= permissionRank(required)
}

func (s *Service) organizationRole(ctx context.Context, userID, orgID uuid.UUID) (models.MembershipRole, error) {
	var role models.MembershipRole
	err := s.pool.QueryRow(ctx,
		`SELECT role FROM organization_memberships WHERE organization_id = $1 AND user_id = $2`,
		orgID,
		userID,
	).Scan(&role)

	return role, err
}

func (s *Service) resourceExists(
	ctx context.Context,
	orgID uuid.UUID,
	resourceType ResourceType,
	resourceID uuid.UUID,
) (bool, error) {
	var query string
	switch resourceType {
	case ResourceTypeFolder:
		query = `SELECT EXISTS (SELECT 1 FROM folders WHERE id = $1 AND organization_id = $2)`
	case ResourceTypeDashboard:
		query = `SELECT EXISTS (SELECT 1 FROM dashboards WHERE id = $1 AND organization_id = $2)`
	default:
		return false, fmt.Errorf("unsupported resource type %q", resourceType)
	}

	var exists bool
	err := s.pool.QueryRow(ctx, query, resourceID, orgID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("failed to verify resource existence: %w", err)
	}

	return exists, nil
}

func (s *Service) resourceHasACL(
	ctx context.Context,
	orgID uuid.UUID,
	resourceType ResourceType,
	resourceID uuid.UUID,
) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS (
			SELECT 1
			FROM resource_permissions
			WHERE organization_id = $1
				AND resource_type = $2
				AND resource_id = $3
		)`,
		orgID,
		resourceType,
		resourceID,
	).Scan(&exists)

	if err != nil {
		return false, err
	}

	return exists, nil
}

func (s *Service) explicitPermission(
	ctx context.Context,
	userID, orgID uuid.UUID,
	resourceType ResourceType,
	resourceID uuid.UUID,
) (Permission, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT rp.permission
		 FROM resource_permissions rp
		 WHERE rp.organization_id = $1
			AND rp.resource_type = $2
			AND rp.resource_id = $3
			AND (
				(rp.principal_type = 'user' AND rp.principal_id = $4)
				OR (
					rp.principal_type = 'group'
					AND EXISTS (
						SELECT 1
						FROM user_group_memberships gm
						WHERE gm.organization_id = $1
							AND gm.group_id = rp.principal_id
							AND gm.user_id = $4
					)
				)
			)`,
		orgID,
		resourceType,
		resourceID,
		userID,
	)
	if err != nil {
		return PermissionNone, fmt.Errorf("failed to query resource permissions: %w", err)
	}
	defer rows.Close()

	effective := PermissionNone
	for rows.Next() {
		var raw string
		if err := rows.Scan(&raw); err != nil {
			return PermissionNone, fmt.Errorf("failed to scan resource permission: %w", err)
		}

		permission := Permission(raw)
		effective = maxPermission(effective, permission)
	}

	if err := rows.Err(); err != nil {
		return PermissionNone, fmt.Errorf("failed to iterate resource permissions: %w", err)
	}

	return effective, nil
}

func orgRoleFallbackPermission(role models.MembershipRole, resourceType ResourceType) Permission {
	switch role {
	case models.RoleAdmin:
		return PermissionAdmin
	case models.RoleEditor:
		return PermissionEdit
	case models.RoleViewer:
		return PermissionView
	case models.RoleAuditor:
		switch resourceType {
		case ResourceTypeFolder, ResourceTypeDashboard:
			return PermissionView
		default:
			return PermissionNone
		}
	default:
		return PermissionNone
	}
}

func actionMinimumPermission(action Action) (Permission, bool) {
	switch action {
	case ActionView:
		return PermissionView, true
	case ActionEdit:
		return PermissionEdit, true
	case ActionAdmin:
		return PermissionAdmin, true
	default:
		return PermissionNone, false
	}
}

func permissionRank(permission Permission) int {
	switch permission {
	case PermissionView:
		return 1
	case PermissionEdit:
		return 2
	case PermissionAdmin:
		return 3
	default:
		return 0
	}
}

func maxPermission(first, second Permission) Permission {
	if permissionRank(second) > permissionRank(first) {
		return second
	}

	return first
}
