// Package mcp serves Ace as a remote Streamable HTTP MCP endpoint on the API process.
//
// Transport is MCP spec 2025-03-26 Streamable HTTP via the official Go SDK,
// mounted on stdlib ServeMux at /mcp. Auth is the same Ace access JWT as the
// rest of the API (Authorization: Bearer); there is no second token type.
package mcp

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/aceobservability/ace/backend/internal/auth"
	"github.com/aceobservability/ace/backend/internal/handlers"
)

const toolTimeout = 5 * time.Second

// NewHandler returns a Streamable HTTP MCP handler. Wrap it with auth.RequireAuth
// and mount it at /mcp and /mcp/ so the API route wins over any SPA catch-all.
func NewHandler(authHandler *handlers.AuthHandler, dsHandler *handlers.DataSourceHandler) http.Handler {
	s := &server{auth: authHandler, ds: dsHandler}
	mcpServer := mcp.NewServer(&mcp.Implementation{Name: "ace", Version: "1.0.0"}, nil)
	mcp.AddTool(mcpServer, &mcp.Tool{
		Name:        "whoami",
		Title:       "Who am I",
		Description: "Return the signed-in Ace user and their organization memberships. Same shape as GET /api/auth/me. Does not include secrets or tokens.",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true, Title: "Who am I"},
	}, s.whoami)
	mcp.AddTool(mcpServer, &mcp.Tool{
		Name:        "list_datasources",
		Title:       "List datasources",
		Description: "List datasources for an organization the caller belongs to. Returns id, name, and type only (no url, auth_type, or auth_config). Optional org_id; if omitted and the user belongs to exactly one organization, that organization is used. If the user belongs to multiple organizations, org_id is required.",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true, Title: "List datasources"},
	}, s.listDatasources)
	registerQueryTools(mcpServer, s)

	return mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server {
		return mcpServer
	}, nil)
}

type server struct {
	auth *handlers.AuthHandler
	ds   *handlers.DataSourceHandler
}

type whoamiOrg struct {
	OrganizationID   string `json:"organization_id"`
	OrganizationName string `json:"organization_name"`
	OrganizationSlug string `json:"organization_slug"`
	Role             string `json:"role"`
}

// whoamiOutput matches GET /api/auth/me (user + organizations/memberships).
type whoamiOutput struct {
	ID            string      `json:"id"`
	Email         string      `json:"email"`
	Name          *string     `json:"name,omitempty"`
	CreatedAt     time.Time   `json:"created_at"`
	Organizations []whoamiOrg `json:"organizations"`
}

func (s *server) whoami(ctx context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, whoamiOutput, error) {
	userID, ok := auth.GetUserID(ctx)
	if !ok {
		return nil, whoamiOutput{}, fmt.Errorf("unauthorized")
	}

	ctx, cancel := context.WithTimeout(ctx, toolTimeout)
	defer cancel()

	user, err := s.auth.GetUserWithOrgs(ctx, userID)
	if err != nil {
		return nil, whoamiOutput{}, fmt.Errorf("failed to load user")
	}
	return nil, whoamiFromUser(user), nil
}

func whoamiFromUser(user *handlers.UserResponse) whoamiOutput {
	out := whoamiOutput{
		ID:            user.ID.String(),
		Email:         user.Email,
		Name:          user.Name,
		CreatedAt:     user.CreatedAt,
		Organizations: []whoamiOrg{},
	}
	for _, m := range user.Orgs {
		out.Organizations = append(out.Organizations, whoamiOrg{
			OrganizationID:   m.OrganizationID.String(),
			OrganizationName: m.OrganizationName,
			OrganizationSlug: m.OrganizationSlug,
			Role:             m.Role,
		})
	}
	return out
}

type listDatasourcesInput struct {
	OrgID string `json:"org_id,omitempty" jsonschema:"Organization ID. Required if you belong to more than one organization."`
}

type datasourceOut struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
}

type listDatasourcesOutput struct {
	Datasources []datasourceOut `json:"datasources"`
	OrgID       string          `json:"org_id"`
}

func (s *server) listDatasources(ctx context.Context, _ *mcp.CallToolRequest, input listDatasourcesInput) (*mcp.CallToolResult, listDatasourcesOutput, error) {
	userID, ok := auth.GetUserID(ctx)
	if !ok {
		return nil, listDatasourcesOutput{}, fmt.Errorf("unauthorized")
	}

	ctx, cancel := context.WithTimeout(ctx, toolTimeout)
	defer cancel()

	user, err := s.auth.GetUserWithOrgs(ctx, userID)
	if err != nil {
		return nil, listDatasourcesOutput{}, fmt.Errorf("failed to load user")
	}

	orgID, err := resolveOrgID(user, input.OrgID)
	if err != nil {
		return nil, listDatasourcesOutput{}, err
	}

	summaries, err := s.ds.ListSummaries(ctx, userID, orgID)
	if err != nil {
		if errors.Is(err, handlers.ErrNotOrgMember) {
			return nil, listDatasourcesOutput{}, fmt.Errorf("not a member of this organization")
		}
		return nil, listDatasourcesOutput{}, fmt.Errorf("failed to list datasources")
	}

	out := listDatasourcesOutput{
		Datasources: []datasourceOut{},
		OrgID:       orgID.String(),
	}
	for _, ds := range summaries {
		out.Datasources = append(out.Datasources, datasourceOut{
			ID:   ds.ID.String(),
			Name: ds.Name,
			Type: string(ds.Type),
		})
	}
	return nil, out, nil
}

func resolveOrgID(user *handlers.UserResponse, orgIDArg string) (uuid.UUID, error) {
	if orgIDArg != "" {
		id, err := uuid.Parse(orgIDArg)
		if err != nil {
			return uuid.Nil, fmt.Errorf("invalid org_id")
		}
		for _, m := range user.Orgs {
			if m.OrganizationID == id {
				return id, nil
			}
		}
		return uuid.Nil, fmt.Errorf("not a member of this organization")
	}

	switch len(user.Orgs) {
	case 0:
		return uuid.Nil, fmt.Errorf("no organization memberships")
	case 1:
		return user.Orgs[0].OrganizationID, nil
	default:
		return uuid.Nil, fmt.Errorf("org_id is required because you belong to multiple organizations")
	}
}
