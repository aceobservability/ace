package sso

import (
	"testing"

	"github.com/aceobservability/ace/backend/internal/models"
)

func TestResolveRoleFromMappings(t *testing.T) {
	tests := []struct {
		name        string
		groups      []string
		mappings    []models.SSOConfigRoleMapping
		defaultRole string
		wantRole    string
	}{
		{
			name:        "no groups -> default",
			groups:      nil,
			mappings:    []models.SSOConfigRoleMapping{{SSOGroupName: "admins", AceRole: "admin"}},
			defaultRole: "viewer",
			wantRole:    "viewer",
		},
		{
			name:   "single match",
			groups: []string{"engineers"},
			mappings: []models.SSOConfigRoleMapping{
				{SSOGroupName: "engineers", AceRole: "editor"},
			},
			defaultRole: "viewer",
			wantRole:    "editor",
		},
		{
			name:   "highest privilege wins",
			groups: []string{"engineers", "admins"},
			mappings: []models.SSOConfigRoleMapping{
				{SSOGroupName: "engineers", AceRole: "editor"},
				{SSOGroupName: "admins", AceRole: "admin"},
			},
			defaultRole: "viewer",
			wantRole:    "admin",
		},
		{
			name:        "no mapping match -> default",
			groups:      []string{"unrelated-group"},
			mappings:    []models.SSOConfigRoleMapping{{SSOGroupName: "admins", AceRole: "admin"}},
			defaultRole: "viewer",
			wantRole:    "viewer",
		},
		{
			name:   "auditor is lateral to viewer (viewer wins)",
			groups: []string{"auditors", "readers"},
			mappings: []models.SSOConfigRoleMapping{
				{SSOGroupName: "auditors", AceRole: "auditor"},
				{SSOGroupName: "readers", AceRole: "viewer"},
			},
			defaultRole: "viewer",
			wantRole:    "viewer",
		},
		{
			name:   "only auditor matches",
			groups: []string{"compliance"},
			mappings: []models.SSOConfigRoleMapping{
				{SSOGroupName: "compliance", AceRole: "auditor"},
				{SSOGroupName: "readonly", AceRole: "viewer"},
			},
			defaultRole: "viewer",
			wantRole:    "auditor",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := ResolveRoleFromMappings(tc.groups, tc.mappings, tc.defaultRole)
			if got != tc.wantRole {
				t.Errorf("ResolveRoleFromMappings() = %q, want %q", got, tc.wantRole)
			}
		})
	}
}
