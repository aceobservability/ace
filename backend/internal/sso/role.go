package sso

import "github.com/aceobservability/ace/backend/internal/models"

// rolePriority maps roles to a numeric priority. Higher number = more privilege.
// Auditor is deliberately ranked below viewer (lateral role).
var rolePriority = map[string]int{
	"auditor": 0,
	"viewer":  1,
	"editor":  2,
	"admin":   3,
}

// ResolveRoleFromMappings determines the highest-privilege Ace role for a user
// based on their SSO group memberships and the configured mappings.
//
// For each user group, it checks if there is a matching mapping and picks the
// role with the highest privilege: admin > editor > viewer. Auditor is treated
// as lateral to viewer -- when tied, viewer wins.
//
// If no mapping matches any of the user's groups, defaultRole is returned.
func ResolveRoleFromMappings(userGroups []string, mappings []models.SSOConfigRoleMapping, defaultRole string) string {
	bestRole := ""
	bestPriority := -1

	mappingByGroup := make(map[string]models.SSOConfigRoleMapping, len(mappings))
	for _, mapping := range mappings {
		mappingByGroup[mapping.SSOGroupName] = mapping
	}

	for _, group := range userGroups {
		mapping, ok := mappingByGroup[group]
		if !ok {
			continue
		}
		p, known := rolePriority[mapping.AceRole]
		if !known {
			continue
		}
		if p > bestPriority {
			bestPriority = p
			bestRole = mapping.AceRole
		}
	}

	if bestRole == "" {
		return defaultRole
	}
	return bestRole
}
