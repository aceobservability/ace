package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/google/uuid"
	"github.com/aceobservability/ace/backend/internal/auth"
	"github.com/aceobservability/ace/backend/internal/models"
	"github.com/redis/go-redis/v9"
)

func setupOrgTestWithRedis(t *testing.T) (*OrganizationHandler, *AuthHandler, func()) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("Failed to start miniredis: %v", err)
	}

	rdb := redis.NewClient(&redis.Options{
		Addr: mr.Addr(),
	})

	orgHandler := NewOrganizationHandler(testPool, rdb)
	authHandler := NewAuthHandler(testPool, testJWTManager, rdb)

	cleanup := func() {
		rdb.Close()
		mr.Close()
	}

	return orgHandler, authHandler, cleanup
}

func createTestUser(t *testing.T, authHandler *AuthHandler, email string) AuthResponse {
	ctx := context.Background()
	testPool.Exec(ctx, "DELETE FROM organization_memberships WHERE user_id IN (SELECT id FROM users WHERE email = $1)", email)
	testPool.Exec(ctx, "DELETE FROM users WHERE email = $1", email)

	regBody := `{"email":"` + email + `","password":"TestPassword123!","name":"Test User"}`
	regReq := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(regBody))
	regReq.Header.Set("Content-Type", "application/json")
	regW := httptest.NewRecorder()
	authHandler.Register(regW, regReq)

	if regW.Code != http.StatusCreated {
		t.Fatalf("Failed to register user: %d - %s", regW.Code, regW.Body.String())
	}

	var response AuthResponse
	json.NewDecoder(regW.Body).Decode(&response)
	return response
}

func TestCreateOrganization(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	ctx := context.Background()
	testPool.Exec(ctx, "DELETE FROM organizations WHERE slug = 'test-org'")

	userResp := createTestUser(t, authHandler, "testcreateorg@example.com")

	body := `{"name":"Test Organization","slug":"test-org"}`
	req := httptest.NewRequest("POST", "/api/orgs", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+userResp.AccessToken)
	w := httptest.NewRecorder()

	wrapped := auth.RequireAuth(testJWTManager, orgHandler.Create)
	wrapped(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("Expected status 201, got %d: %s", w.Code, w.Body.String())
	}

	var org models.Organization
	if err := json.NewDecoder(w.Body).Decode(&org); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if org.Name != "Test Organization" {
		t.Errorf("Expected name 'Test Organization', got '%s'", org.Name)
	}
	if org.Slug != "test-org" {
		t.Errorf("Expected slug 'test-org', got '%s'", org.Slug)
	}
}

func TestCreateOrganizationDuplicateSlug(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	ctx := context.Background()
	testPool.Exec(ctx, "DELETE FROM organizations WHERE slug = 'dupe-slug'")

	userResp := createTestUser(t, authHandler, "testdupeorg@example.com")

	// Create first org
	body := `{"name":"First Org","slug":"dupe-slug"}`
	req := httptest.NewRequest("POST", "/api/orgs", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+userResp.AccessToken)
	w := httptest.NewRecorder()

	wrapped := auth.RequireAuth(testJWTManager, orgHandler.Create)
	wrapped(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("Failed to create first org: %d", w.Code)
	}

	// Try to create second org with same slug
	body2 := `{"name":"Second Org","slug":"dupe-slug"}`
	req2 := httptest.NewRequest("POST", "/api/orgs", bytes.NewBufferString(body2))
	req2.Header.Set("Content-Type", "application/json")
	req2.Header.Set("Authorization", "Bearer "+userResp.AccessToken)
	w2 := httptest.NewRecorder()

	wrapped(w2, req2)

	if w2.Code != http.StatusConflict {
		t.Errorf("Expected status 409 for duplicate slug, got %d", w2.Code)
	}
}

func TestListOrganizations(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	ctx := context.Background()
	testPool.Exec(ctx, "DELETE FROM organizations WHERE slug = 'list-org'")

	userResp := createTestUser(t, authHandler, "testlistorg@example.com")

	// Create org
	createBody := `{"name":"List Org","slug":"list-org"}`
	createReq := httptest.NewRequest("POST", "/api/orgs", bytes.NewBufferString(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Authorization", "Bearer "+userResp.AccessToken)
	createW := httptest.NewRecorder()

	wrapped := auth.RequireAuth(testJWTManager, orgHandler.Create)
	wrapped(createW, createReq)

	// List orgs
	listReq := httptest.NewRequest("GET", "/api/orgs", nil)
	listReq.Header.Set("Authorization", "Bearer "+userResp.AccessToken)
	listW := httptest.NewRecorder()

	listWrapped := auth.RequireAuth(testJWTManager, orgHandler.List)
	listWrapped(listW, listReq)

	if listW.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d: %s", listW.Code, listW.Body.String())
	}

	var orgs []struct {
		models.Organization
		Role string `json:"role"`
	}
	json.NewDecoder(listW.Body).Decode(&orgs)

	found := false
	for _, org := range orgs {
		if org.Slug == "list-org" {
			found = true
			if org.Role != "admin" {
				t.Errorf("Expected role 'admin', got '%s'", org.Role)
			}
		}
	}
	if !found {
		t.Error("Expected to find 'list-org' in response")
	}
}

func TestGetOrganization(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	ctx := context.Background()
	testPool.Exec(ctx, "DELETE FROM organizations WHERE slug = 'get-org'")

	userResp := createTestUser(t, authHandler, "testgetorg@example.com")

	// Create org
	createBody := `{"name":"Get Org","slug":"get-org"}`
	createReq := httptest.NewRequest("POST", "/api/orgs", bytes.NewBufferString(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Authorization", "Bearer "+userResp.AccessToken)
	createW := httptest.NewRecorder()

	wrapped := auth.RequireAuth(testJWTManager, orgHandler.Create)
	wrapped(createW, createReq)

	var createdOrg models.Organization
	json.NewDecoder(createW.Body).Decode(&createdOrg)

	// Get org
	getReq := httptest.NewRequest("GET", "/api/orgs/"+createdOrg.ID.String(), nil)
	getReq.Header.Set("Authorization", "Bearer "+userResp.AccessToken)
	getReq.SetPathValue("id", createdOrg.ID.String())
	getW := httptest.NewRecorder()

	getWrapped := auth.RequireAuth(testJWTManager, orgHandler.Get)
	getWrapped(getW, getReq)

	if getW.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d: %s", getW.Code, getW.Body.String())
	}
}

func TestUpdateOrganization(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	ctx := context.Background()
	testPool.Exec(ctx, "DELETE FROM organizations WHERE slug IN ('update-org', 'updated-org')")

	userResp := createTestUser(t, authHandler, "testupdateorg@example.com")

	// Create org
	createBody := `{"name":"Update Org","slug":"update-org"}`
	createReq := httptest.NewRequest("POST", "/api/orgs", bytes.NewBufferString(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Authorization", "Bearer "+userResp.AccessToken)
	createW := httptest.NewRecorder()

	wrapped := auth.RequireAuth(testJWTManager, orgHandler.Create)
	wrapped(createW, createReq)

	var createdOrg models.Organization
	json.NewDecoder(createW.Body).Decode(&createdOrg)

	// Update org
	updateBody := `{"name":"Updated Name","slug":"updated-org"}`
	updateReq := httptest.NewRequest("PUT", "/api/orgs/"+createdOrg.ID.String(), bytes.NewBufferString(updateBody))
	updateReq.Header.Set("Content-Type", "application/json")
	updateReq.Header.Set("Authorization", "Bearer "+userResp.AccessToken)
	updateReq.SetPathValue("id", createdOrg.ID.String())
	updateW := httptest.NewRecorder()

	updateWrapped := auth.RequireAuth(testJWTManager, orgHandler.Update)
	updateWrapped(updateW, updateReq)

	if updateW.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d: %s", updateW.Code, updateW.Body.String())
	}

	var updatedOrg models.Organization
	json.NewDecoder(updateW.Body).Decode(&updatedOrg)

	if updatedOrg.Name != "Updated Name" {
		t.Errorf("Expected name 'Updated Name', got '%s'", updatedOrg.Name)
	}
	if updatedOrg.Slug != "updated-org" {
		t.Errorf("Expected slug 'updated-org', got '%s'", updatedOrg.Slug)
	}
}

func TestDeleteOrganization(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	ctx := context.Background()
	testPool.Exec(ctx, "DELETE FROM organizations WHERE slug = 'delete-org'")

	userResp := createTestUser(t, authHandler, "testdeleteorg@example.com")

	// Create org
	createBody := `{"name":"Delete Org","slug":"delete-org"}`
	createReq := httptest.NewRequest("POST", "/api/orgs", bytes.NewBufferString(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Authorization", "Bearer "+userResp.AccessToken)
	createW := httptest.NewRecorder()

	wrapped := auth.RequireAuth(testJWTManager, orgHandler.Create)
	wrapped(createW, createReq)

	var createdOrg models.Organization
	json.NewDecoder(createW.Body).Decode(&createdOrg)

	// Delete org
	deleteReq := httptest.NewRequest("DELETE", "/api/orgs/"+createdOrg.ID.String(), nil)
	deleteReq.Header.Set("Authorization", "Bearer "+userResp.AccessToken)
	deleteReq.SetPathValue("id", createdOrg.ID.String())
	deleteW := httptest.NewRecorder()

	deleteWrapped := auth.RequireAuth(testJWTManager, orgHandler.Delete)
	deleteWrapped(deleteW, deleteReq)

	if deleteW.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d: %s", deleteW.Code, deleteW.Body.String())
	}
}

func TestInviteUser(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	ctx := context.Background()
	testPool.Exec(ctx, "DELETE FROM organizations WHERE slug = 'invite-org'")

	userResp := createTestUser(t, authHandler, "testinviteorg@example.com")

	// Create org
	createBody := `{"name":"Invite Org","slug":"invite-org"}`
	createReq := httptest.NewRequest("POST", "/api/orgs", bytes.NewBufferString(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Authorization", "Bearer "+userResp.AccessToken)
	createW := httptest.NewRecorder()

	wrapped := auth.RequireAuth(testJWTManager, orgHandler.Create)
	wrapped(createW, createReq)

	var createdOrg models.Organization
	json.NewDecoder(createW.Body).Decode(&createdOrg)

	// Create invitation
	inviteBody := `{"email":"invited@example.com","role":"editor"}`
	inviteReq := httptest.NewRequest("POST", "/api/orgs/"+createdOrg.ID.String()+"/invitations", bytes.NewBufferString(inviteBody))
	inviteReq.Header.Set("Content-Type", "application/json")
	inviteReq.Header.Set("Authorization", "Bearer "+userResp.AccessToken)
	inviteReq.SetPathValue("id", createdOrg.ID.String())
	inviteW := httptest.NewRecorder()

	inviteWrapped := auth.RequireAuth(testJWTManager, orgHandler.CreateInvitation)
	inviteWrapped(inviteW, inviteReq)

	if inviteW.Code != http.StatusCreated {
		t.Errorf("Expected status 201, got %d: %s", inviteW.Code, inviteW.Body.String())
	}

	var invitation InvitationResponse
	json.NewDecoder(inviteW.Body).Decode(&invitation)

	if invitation.Token == "" {
		t.Error("Expected invitation token")
	}
	if invitation.Email != "invited@example.com" {
		t.Errorf("Expected email 'invited@example.com', got '%s'", invitation.Email)
	}
	if invitation.Role != "editor" {
		t.Errorf("Expected role 'editor', got '%s'", invitation.Role)
	}
}

func TestAcceptInvitation(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	ctx := context.Background()
	testPool.Exec(ctx, "DELETE FROM organizations WHERE slug = 'accept-org'")

	adminResp := createTestUser(t, authHandler, "testacceptadmin@example.com")

	// Create org
	createBody := `{"name":"Accept Org","slug":"accept-org"}`
	createReq := httptest.NewRequest("POST", "/api/orgs", bytes.NewBufferString(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	createW := httptest.NewRecorder()

	wrapped := auth.RequireAuth(testJWTManager, orgHandler.Create)
	wrapped(createW, createReq)

	var createdOrg models.Organization
	json.NewDecoder(createW.Body).Decode(&createdOrg)

	// Create another user (invitee)
	inviteeResp := createTestUser(t, authHandler, "testacceptinvitee@example.com")

	// Create invitation
	inviteBody := `{"email":"testacceptinvitee@example.com","role":"editor"}`
	inviteReq := httptest.NewRequest("POST", "/api/orgs/"+createdOrg.ID.String()+"/invitations", bytes.NewBufferString(inviteBody))
	inviteReq.Header.Set("Content-Type", "application/json")
	inviteReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	inviteReq.SetPathValue("id", createdOrg.ID.String())
	inviteW := httptest.NewRecorder()

	inviteWrapped := auth.RequireAuth(testJWTManager, orgHandler.CreateInvitation)
	inviteWrapped(inviteW, inviteReq)

	var invitation InvitationResponse
	json.NewDecoder(inviteW.Body).Decode(&invitation)

	// Accept invitation
	acceptReq := httptest.NewRequest("POST", "/api/invitations/"+invitation.Token+"/accept", nil)
	acceptReq.Header.Set("Authorization", "Bearer "+inviteeResp.AccessToken)
	acceptReq.SetPathValue("token", invitation.Token)
	acceptW := httptest.NewRecorder()

	acceptWrapped := auth.RequireAuth(testJWTManager, orgHandler.AcceptInvitation)
	acceptWrapped(acceptW, acceptReq)

	if acceptW.Code != http.StatusCreated {
		t.Errorf("Expected status 201, got %d: %s", acceptW.Code, acceptW.Body.String())
	}
}

func TestNonAdminCannotInvite(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	ctx := context.Background()
	testPool.Exec(ctx, "DELETE FROM organizations WHERE slug = 'nonadmin-org'")

	adminResp := createTestUser(t, authHandler, "testnonadminadmin@example.com")

	// Create org
	createBody := `{"name":"NonAdmin Org","slug":"nonadmin-org"}`
	createReq := httptest.NewRequest("POST", "/api/orgs", bytes.NewBufferString(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	createW := httptest.NewRecorder()

	wrapped := auth.RequireAuth(testJWTManager, orgHandler.Create)
	wrapped(createW, createReq)

	var createdOrg models.Organization
	json.NewDecoder(createW.Body).Decode(&createdOrg)

	// Create member user and accept invitation
	memberResp := createTestUser(t, authHandler, "testnonadminmember@example.com")

	// Invite member
	inviteBody := `{"email":"testnonadminmember@example.com","role":"viewer"}`
	inviteReq := httptest.NewRequest("POST", "/api/orgs/"+createdOrg.ID.String()+"/invitations", bytes.NewBufferString(inviteBody))
	inviteReq.Header.Set("Content-Type", "application/json")
	inviteReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	inviteReq.SetPathValue("id", createdOrg.ID.String())
	inviteW := httptest.NewRecorder()

	inviteWrapped := auth.RequireAuth(testJWTManager, orgHandler.CreateInvitation)
	inviteWrapped(inviteW, inviteReq)

	var invitation InvitationResponse
	json.NewDecoder(inviteW.Body).Decode(&invitation)

	// Accept invitation
	acceptReq := httptest.NewRequest("POST", "/api/invitations/"+invitation.Token+"/accept", nil)
	acceptReq.Header.Set("Authorization", "Bearer "+memberResp.AccessToken)
	acceptReq.SetPathValue("token", invitation.Token)
	acceptW := httptest.NewRecorder()

	acceptWrapped := auth.RequireAuth(testJWTManager, orgHandler.AcceptInvitation)
	acceptWrapped(acceptW, acceptReq)

	// Now member tries to invite someone else
	newInviteBody := `{"email":"another@example.com","role":"viewer"}`
	newInviteReq := httptest.NewRequest("POST", "/api/orgs/"+createdOrg.ID.String()+"/invitations", bytes.NewBufferString(newInviteBody))
	newInviteReq.Header.Set("Content-Type", "application/json")
	newInviteReq.Header.Set("Authorization", "Bearer "+memberResp.AccessToken)
	newInviteReq.SetPathValue("id", createdOrg.ID.String())
	newInviteW := httptest.NewRecorder()

	inviteWrapped(newInviteW, newInviteReq)

	if newInviteW.Code != http.StatusForbidden {
		t.Errorf("Expected status 403 for non-admin invite, got %d", newInviteW.Code)
	}
}

func TestListMembers(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	ctx := context.Background()
	testPool.Exec(ctx, "DELETE FROM organizations WHERE slug = 'members-org'")

	userResp := createTestUser(t, authHandler, "testmembersorg@example.com")

	// Create org
	createBody := `{"name":"Members Org","slug":"members-org"}`
	createReq := httptest.NewRequest("POST", "/api/orgs", bytes.NewBufferString(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Authorization", "Bearer "+userResp.AccessToken)
	createW := httptest.NewRecorder()

	wrapped := auth.RequireAuth(testJWTManager, orgHandler.Create)
	wrapped(createW, createReq)

	var createdOrg models.Organization
	json.NewDecoder(createW.Body).Decode(&createdOrg)

	// List members
	listReq := httptest.NewRequest("GET", "/api/orgs/"+createdOrg.ID.String()+"/members", nil)
	listReq.Header.Set("Authorization", "Bearer "+userResp.AccessToken)
	listReq.SetPathValue("id", createdOrg.ID.String())
	listW := httptest.NewRecorder()

	listWrapped := auth.RequireAuth(testJWTManager, orgHandler.ListMembers)
	listWrapped(listW, listReq)

	if listW.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d: %s", listW.Code, listW.Body.String())
	}

	var members []MemberResponse
	json.NewDecoder(listW.Body).Decode(&members)

	if len(members) != 1 {
		t.Errorf("Expected 1 member, got %d", len(members))
	}
	if members[0].Role != "admin" {
		t.Errorf("Expected role 'admin', got '%s'", members[0].Role)
	}
}

func TestUpdateMemberRole(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	ctx := context.Background()
	testPool.Exec(ctx, "DELETE FROM organizations WHERE slug = 'role-org'")

	adminResp := createTestUser(t, authHandler, "testroleadmin@example.com")
	memberResp := createTestUser(t, authHandler, "testrolemember@example.com")

	// Create org
	createBody := `{"name":"Role Org","slug":"role-org"}`
	createReq := httptest.NewRequest("POST", "/api/orgs", bytes.NewBufferString(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	createW := httptest.NewRecorder()

	wrapped := auth.RequireAuth(testJWTManager, orgHandler.Create)
	wrapped(createW, createReq)

	var createdOrg models.Organization
	json.NewDecoder(createW.Body).Decode(&createdOrg)

	// Invite member
	inviteBody := `{"email":"testrolemember@example.com","role":"viewer"}`
	inviteReq := httptest.NewRequest("POST", "/api/orgs/"+createdOrg.ID.String()+"/invitations", bytes.NewBufferString(inviteBody))
	inviteReq.Header.Set("Content-Type", "application/json")
	inviteReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	inviteReq.SetPathValue("id", createdOrg.ID.String())
	inviteW := httptest.NewRecorder()

	inviteWrapped := auth.RequireAuth(testJWTManager, orgHandler.CreateInvitation)
	inviteWrapped(inviteW, inviteReq)

	var invitation InvitationResponse
	json.NewDecoder(inviteW.Body).Decode(&invitation)

	// Accept invitation
	acceptReq := httptest.NewRequest("POST", "/api/invitations/"+invitation.Token+"/accept", nil)
	acceptReq.Header.Set("Authorization", "Bearer "+memberResp.AccessToken)
	acceptReq.SetPathValue("token", invitation.Token)
	acceptW := httptest.NewRecorder()

	acceptWrapped := auth.RequireAuth(testJWTManager, orgHandler.AcceptInvitation)
	acceptWrapped(acceptW, acceptReq)

	var membership models.OrganizationMembership
	json.NewDecoder(acceptW.Body).Decode(&membership)

	// Get member's user ID
	memberUserID := membership.UserID

	// Update role
	updateBody := `{"role":"editor"}`
	updateReq := httptest.NewRequest("PUT", "/api/orgs/"+createdOrg.ID.String()+"/members/"+memberUserID.String()+"/role", bytes.NewBufferString(updateBody))
	updateReq.Header.Set("Content-Type", "application/json")
	updateReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	updateReq.SetPathValue("id", createdOrg.ID.String())
	updateReq.SetPathValue("userId", memberUserID.String())
	updateW := httptest.NewRecorder()

	updateWrapped := auth.RequireAuth(testJWTManager, orgHandler.UpdateMemberRole)
	updateWrapped(updateW, updateReq)

	if updateW.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d: %s", updateW.Code, updateW.Body.String())
	}
}

func TestRemoveMember(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	ctx := context.Background()
	testPool.Exec(ctx, "DELETE FROM organizations WHERE slug = 'remove-org'")

	adminResp := createTestUser(t, authHandler, "testremoveadmin@example.com")
	memberResp := createTestUser(t, authHandler, "testremovemember@example.com")

	// Create org
	createBody := `{"name":"Remove Org","slug":"remove-org"}`
	createReq := httptest.NewRequest("POST", "/api/orgs", bytes.NewBufferString(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	createW := httptest.NewRecorder()

	wrapped := auth.RequireAuth(testJWTManager, orgHandler.Create)
	wrapped(createW, createReq)

	var createdOrg models.Organization
	json.NewDecoder(createW.Body).Decode(&createdOrg)

	// Invite member
	inviteBody := `{"email":"testremovemember@example.com","role":"viewer"}`
	inviteReq := httptest.NewRequest("POST", "/api/orgs/"+createdOrg.ID.String()+"/invitations", bytes.NewBufferString(inviteBody))
	inviteReq.Header.Set("Content-Type", "application/json")
	inviteReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	inviteReq.SetPathValue("id", createdOrg.ID.String())
	inviteW := httptest.NewRecorder()

	inviteWrapped := auth.RequireAuth(testJWTManager, orgHandler.CreateInvitation)
	inviteWrapped(inviteW, inviteReq)

	var invitation InvitationResponse
	json.NewDecoder(inviteW.Body).Decode(&invitation)

	// Accept invitation
	acceptReq := httptest.NewRequest("POST", "/api/invitations/"+invitation.Token+"/accept", nil)
	acceptReq.Header.Set("Authorization", "Bearer "+memberResp.AccessToken)
	acceptReq.SetPathValue("token", invitation.Token)
	acceptW := httptest.NewRecorder()

	acceptWrapped := auth.RequireAuth(testJWTManager, orgHandler.AcceptInvitation)
	acceptWrapped(acceptW, acceptReq)

	var membership models.OrganizationMembership
	json.NewDecoder(acceptW.Body).Decode(&membership)

	memberUserID := membership.UserID

	// Remove member
	removeReq := httptest.NewRequest("DELETE", "/api/orgs/"+createdOrg.ID.String()+"/members/"+memberUserID.String(), nil)
	removeReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	removeReq.SetPathValue("id", createdOrg.ID.String())
	removeReq.SetPathValue("userId", memberUserID.String())
	removeW := httptest.NewRecorder()

	removeWrapped := auth.RequireAuth(testJWTManager, orgHandler.RemoveMember)
	removeWrapped(removeW, removeReq)

	if removeW.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d: %s", removeW.Code, removeW.Body.String())
	}
}

func TestCannotRemoveLastAdmin(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	ctx := context.Background()
	testPool.Exec(ctx, "DELETE FROM organizations WHERE slug = 'lastadmin-org'")

	adminResp := createTestUser(t, authHandler, "testlastadmin@example.com")

	// Create org
	createBody := `{"name":"LastAdmin Org","slug":"lastadmin-org"}`
	createReq := httptest.NewRequest("POST", "/api/orgs", bytes.NewBufferString(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	createW := httptest.NewRecorder()

	wrapped := auth.RequireAuth(testJWTManager, orgHandler.Create)
	wrapped(createW, createReq)

	var createdOrg models.Organization
	json.NewDecoder(createW.Body).Decode(&createdOrg)

	// Get admin user ID from token
	claims, _ := testJWTManager.VerifyAccessToken(adminResp.AccessToken)
	adminUserID := claims.UserID

	// Try to remove self (last admin)
	removeReq := httptest.NewRequest("DELETE", "/api/orgs/"+createdOrg.ID.String()+"/members/"+adminUserID.String(), nil)
	removeReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	removeReq.SetPathValue("id", createdOrg.ID.String())
	removeReq.SetPathValue("userId", adminUserID.String())
	removeW := httptest.NewRecorder()

	removeWrapped := auth.RequireAuth(testJWTManager, orgHandler.RemoveMember)
	removeWrapped(removeW, removeReq)

	if removeW.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400 for removing last admin, got %d: %s", removeW.Code, removeW.Body.String())
	}
}

func TestInvalidSlugRejected(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	userResp := createTestUser(t, authHandler, "testinvalidslug@example.com")

	testCases := []struct {
		name string
		slug string
	}{
		{"too short", "ab"},
		{"starts with hyphen", "-invalid"},
		{"ends with hyphen", "invalid-"},
		{"has uppercase", "Invalid"},
		{"has spaces", "has spaces"},
		{"has underscore", "has_underscore"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			body := `{"name":"Test","slug":"` + tc.slug + `"}`
			req := httptest.NewRequest("POST", "/api/orgs", bytes.NewBufferString(body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", "Bearer "+userResp.AccessToken)
			w := httptest.NewRecorder()

			wrapped := auth.RequireAuth(testJWTManager, orgHandler.Create)
			wrapped(w, req)

			if w.Code != http.StatusBadRequest {
				t.Errorf("Expected status 400 for slug '%s', got %d", tc.slug, w.Code)
			}
		})
	}
}

func TestNonMemberCannotAccessOrg(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	ctx := context.Background()
	testPool.Exec(ctx, "DELETE FROM organizations WHERE slug = 'private-org'")

	adminResp := createTestUser(t, authHandler, "testprivateadmin@example.com")
	nonMemberResp := createTestUser(t, authHandler, "testprivatenonmember@example.com")

	// Create org
	createBody := `{"name":"Private Org","slug":"private-org"}`
	createReq := httptest.NewRequest("POST", "/api/orgs", bytes.NewBufferString(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	createW := httptest.NewRecorder()

	wrapped := auth.RequireAuth(testJWTManager, orgHandler.Create)
	wrapped(createW, createReq)

	var createdOrg models.Organization
	json.NewDecoder(createW.Body).Decode(&createdOrg)

	// Non-member tries to get org
	getReq := httptest.NewRequest("GET", "/api/orgs/"+createdOrg.ID.String(), nil)
	getReq.Header.Set("Authorization", "Bearer "+nonMemberResp.AccessToken)
	getReq.SetPathValue("id", createdOrg.ID.String())
	getW := httptest.NewRecorder()

	getWrapped := auth.RequireAuth(testJWTManager, orgHandler.Get)
	getWrapped(getW, getReq)

	if getW.Code != http.StatusForbidden {
		t.Errorf("Expected status 403 for non-member, got %d", getW.Code)
	}
}

func TestInvitationForDifferentEmailFails(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	ctx := context.Background()
	testPool.Exec(ctx, "DELETE FROM organizations WHERE slug = 'wrongemail-org'")

	adminResp := createTestUser(t, authHandler, "testwrongemailadmin@example.com")
	otherUserResp := createTestUser(t, authHandler, "testwrongemailother@example.com")

	// Create org
	createBody := `{"name":"WrongEmail Org","slug":"wrongemail-org"}`
	createReq := httptest.NewRequest("POST", "/api/orgs", bytes.NewBufferString(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	createW := httptest.NewRecorder()

	wrapped := auth.RequireAuth(testJWTManager, orgHandler.Create)
	wrapped(createW, createReq)

	var createdOrg models.Organization
	json.NewDecoder(createW.Body).Decode(&createdOrg)

	// Invite a specific email
	inviteBody := `{"email":"intended@example.com","role":"viewer"}`
	inviteReq := httptest.NewRequest("POST", "/api/orgs/"+createdOrg.ID.String()+"/invitations", bytes.NewBufferString(inviteBody))
	inviteReq.Header.Set("Content-Type", "application/json")
	inviteReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	inviteReq.SetPathValue("id", createdOrg.ID.String())
	inviteW := httptest.NewRecorder()

	inviteWrapped := auth.RequireAuth(testJWTManager, orgHandler.CreateInvitation)
	inviteWrapped(inviteW, inviteReq)

	var invitation InvitationResponse
	json.NewDecoder(inviteW.Body).Decode(&invitation)

	// Other user tries to accept invitation
	acceptReq := httptest.NewRequest("POST", "/api/invitations/"+invitation.Token+"/accept", nil)
	acceptReq.Header.Set("Authorization", "Bearer "+otherUserResp.AccessToken)
	acceptReq.SetPathValue("token", invitation.Token)
	acceptW := httptest.NewRecorder()

	acceptWrapped := auth.RequireAuth(testJWTManager, orgHandler.AcceptInvitation)
	acceptWrapped(acceptW, acceptReq)

	if acceptW.Code != http.StatusForbidden {
		t.Errorf("Expected status 403 for wrong email, got %d: %s", acceptW.Code, acceptW.Body.String())
	}
}

func TestInviteAlreadyMemberFails(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	ctx := context.Background()
	testPool.Exec(ctx, "DELETE FROM organizations WHERE slug = 'alreadymember-org'")

	adminResp := createTestUser(t, authHandler, "testalreadymemberadmin@example.com")
	memberResp := createTestUser(t, authHandler, "testalreadymember@example.com")

	// Create org
	createBody := `{"name":"AlreadyMember Org","slug":"alreadymember-org"}`
	createReq := httptest.NewRequest("POST", "/api/orgs", bytes.NewBufferString(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	createW := httptest.NewRecorder()

	wrapped := auth.RequireAuth(testJWTManager, orgHandler.Create)
	wrapped(createW, createReq)

	var createdOrg models.Organization
	json.NewDecoder(createW.Body).Decode(&createdOrg)

	// Invite member
	inviteBody := `{"email":"testalreadymember@example.com","role":"viewer"}`
	inviteReq := httptest.NewRequest("POST", "/api/orgs/"+createdOrg.ID.String()+"/invitations", bytes.NewBufferString(inviteBody))
	inviteReq.Header.Set("Content-Type", "application/json")
	inviteReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	inviteReq.SetPathValue("id", createdOrg.ID.String())
	inviteW := httptest.NewRecorder()

	inviteWrapped := auth.RequireAuth(testJWTManager, orgHandler.CreateInvitation)
	inviteWrapped(inviteW, inviteReq)

	var invitation InvitationResponse
	json.NewDecoder(inviteW.Body).Decode(&invitation)

	// Accept invitation
	acceptReq := httptest.NewRequest("POST", "/api/invitations/"+invitation.Token+"/accept", nil)
	acceptReq.Header.Set("Authorization", "Bearer "+memberResp.AccessToken)
	acceptReq.SetPathValue("token", invitation.Token)
	acceptW := httptest.NewRecorder()

	acceptWrapped := auth.RequireAuth(testJWTManager, orgHandler.AcceptInvitation)
	acceptWrapped(acceptW, acceptReq)

	// Try to invite the same member again
	inviteBody2 := `{"email":"testalreadymember@example.com","role":"editor"}`
	inviteReq2 := httptest.NewRequest("POST", "/api/orgs/"+createdOrg.ID.String()+"/invitations", bytes.NewBufferString(inviteBody2))
	inviteReq2.Header.Set("Content-Type", "application/json")
	inviteReq2.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	inviteReq2.SetPathValue("id", createdOrg.ID.String())
	inviteW2 := httptest.NewRecorder()

	inviteWrapped(inviteW2, inviteReq2)

	if inviteW2.Code != http.StatusConflict {
		t.Errorf("Expected status 409 for already member, got %d: %s", inviteW2.Code, inviteW2.Body.String())
	}
}

func TestUpdateMemberRoleSetsRoleSourceManual(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	ctx := context.Background()
	testPool.Exec(ctx, "DELETE FROM organizations WHERE slug = 'rolesrc-update-org'")

	adminResp := createTestUser(t, authHandler, "testrolesrcadmin@example.com")
	memberResp := createTestUser(t, authHandler, "testrolesrcmember@example.com")

	// Create org
	createBody := `{"name":"RoleSrc Update Org","slug":"rolesrc-update-org"}`
	createReq := httptest.NewRequest("POST", "/api/orgs", bytes.NewBufferString(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	createW := httptest.NewRecorder()

	wrapped := auth.RequireAuth(testJWTManager, orgHandler.Create)
	wrapped(createW, createReq)

	var createdOrg models.Organization
	json.NewDecoder(createW.Body).Decode(&createdOrg)

	// Invite member
	inviteBody := `{"email":"testrolesrcmember@example.com","role":"viewer"}`
	inviteReq := httptest.NewRequest("POST", "/api/orgs/"+createdOrg.ID.String()+"/invitations", bytes.NewBufferString(inviteBody))
	inviteReq.Header.Set("Content-Type", "application/json")
	inviteReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	inviteReq.SetPathValue("id", createdOrg.ID.String())
	inviteW := httptest.NewRecorder()

	inviteWrapped := auth.RequireAuth(testJWTManager, orgHandler.CreateInvitation)
	inviteWrapped(inviteW, inviteReq)

	var invitation InvitationResponse
	json.NewDecoder(inviteW.Body).Decode(&invitation)

	// Accept invitation
	acceptReq := httptest.NewRequest("POST", "/api/invitations/"+invitation.Token+"/accept", nil)
	acceptReq.Header.Set("Authorization", "Bearer "+memberResp.AccessToken)
	acceptReq.SetPathValue("token", invitation.Token)
	acceptW := httptest.NewRecorder()

	acceptWrapped := auth.RequireAuth(testJWTManager, orgHandler.AcceptInvitation)
	acceptWrapped(acceptW, acceptReq)

	var membership models.OrganizationMembership
	json.NewDecoder(acceptW.Body).Decode(&membership)
	memberUserID := membership.UserID

	// Simulate SSO by setting role_source to 'sso' directly in DB
	_, err := testPool.Exec(ctx,
		`UPDATE organization_memberships SET role_source = 'sso' WHERE organization_id = $1 AND user_id = $2`,
		createdOrg.ID, memberUserID,
	)
	if err != nil {
		t.Fatalf("Failed to set role_source to sso: %v", err)
	}

	// Admin updates member role — should set role_source back to 'manual'
	updateBody := `{"role":"editor"}`
	updateReq := httptest.NewRequest("PUT", "/api/orgs/"+createdOrg.ID.String()+"/members/"+memberUserID.String()+"/role", bytes.NewBufferString(updateBody))
	updateReq.Header.Set("Content-Type", "application/json")
	updateReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	updateReq.SetPathValue("id", createdOrg.ID.String())
	updateReq.SetPathValue("userId", memberUserID.String())
	updateW := httptest.NewRecorder()

	updateWrapped := auth.RequireAuth(testJWTManager, orgHandler.UpdateMemberRole)
	updateWrapped(updateW, updateReq)

	if updateW.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d: %s", updateW.Code, updateW.Body.String())
	}

	// Verify role_source is 'manual' in DB
	var roleSource string
	err = testPool.QueryRow(ctx,
		`SELECT role_source FROM organization_memberships WHERE organization_id = $1 AND user_id = $2`,
		createdOrg.ID, memberUserID,
	).Scan(&roleSource)
	if err != nil {
		t.Fatalf("Failed to query role_source: %v", err)
	}
	if roleSource != "manual" {
		t.Errorf("Expected role_source 'manual' after admin role update, got '%s'", roleSource)
	}
}

func TestAcceptInvitationSetsRoleSourceManual(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	ctx := context.Background()
	testPool.Exec(ctx, "DELETE FROM organizations WHERE slug = 'rolesrc-accept-org'")

	adminResp := createTestUser(t, authHandler, "testrolesrcacceptadmin@example.com")
	inviteeResp := createTestUser(t, authHandler, "testrolesrcacceptinvitee@example.com")

	// Create org
	createBody := `{"name":"RoleSrc Accept Org","slug":"rolesrc-accept-org"}`
	createReq := httptest.NewRequest("POST", "/api/orgs", bytes.NewBufferString(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	createW := httptest.NewRecorder()

	wrapped := auth.RequireAuth(testJWTManager, orgHandler.Create)
	wrapped(createW, createReq)

	var createdOrg models.Organization
	json.NewDecoder(createW.Body).Decode(&createdOrg)

	// Create invitation
	inviteBody := `{"email":"testrolesrcacceptinvitee@example.com","role":"editor"}`
	inviteReq := httptest.NewRequest("POST", "/api/orgs/"+createdOrg.ID.String()+"/invitations", bytes.NewBufferString(inviteBody))
	inviteReq.Header.Set("Content-Type", "application/json")
	inviteReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	inviteReq.SetPathValue("id", createdOrg.ID.String())
	inviteW := httptest.NewRecorder()

	inviteWrapped := auth.RequireAuth(testJWTManager, orgHandler.CreateInvitation)
	inviteWrapped(inviteW, inviteReq)

	var invitation InvitationResponse
	json.NewDecoder(inviteW.Body).Decode(&invitation)

	// Accept invitation
	acceptReq := httptest.NewRequest("POST", "/api/invitations/"+invitation.Token+"/accept", nil)
	acceptReq.Header.Set("Authorization", "Bearer "+inviteeResp.AccessToken)
	acceptReq.SetPathValue("token", invitation.Token)
	acceptW := httptest.NewRecorder()

	acceptWrapped := auth.RequireAuth(testJWTManager, orgHandler.AcceptInvitation)
	acceptWrapped(acceptW, acceptReq)

	if acceptW.Code != http.StatusCreated {
		t.Fatalf("Expected status 201, got %d: %s", acceptW.Code, acceptW.Body.String())
	}

	// Verify role_source is 'manual' in DB
	var membership models.OrganizationMembership
	json.NewDecoder(acceptW.Body).Decode(&membership)

	var roleSource string
	err := testPool.QueryRow(ctx,
		`SELECT role_source FROM organization_memberships WHERE organization_id = $1 AND user_id = $2`,
		createdOrg.ID, membership.UserID,
	).Scan(&roleSource)
	if err != nil {
		t.Fatalf("Failed to query role_source: %v", err)
	}
	if roleSource != "manual" {
		t.Errorf("Expected role_source 'manual' after invitation acceptance, got '%s'", roleSource)
	}

	// Also verify the response body includes role_source
	if membership.RoleSource != "manual" {
		t.Errorf("Expected role_source 'manual' in response body, got '%s'", membership.RoleSource)
	}
}

func TestCreateOrganizationSetsRoleSourceManual(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	ctx := context.Background()
	testPool.Exec(ctx, "DELETE FROM organizations WHERE slug = 'rolesrc-create-org'")

	userResp := createTestUser(t, authHandler, "testrolesrccreate@example.com")

	// Create org
	createBody := `{"name":"RoleSrc Create Org","slug":"rolesrc-create-org"}`
	createReq := httptest.NewRequest("POST", "/api/orgs", bytes.NewBufferString(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Authorization", "Bearer "+userResp.AccessToken)
	createW := httptest.NewRecorder()

	wrapped := auth.RequireAuth(testJWTManager, orgHandler.Create)
	wrapped(createW, createReq)

	if createW.Code != http.StatusCreated {
		t.Fatalf("Expected status 201, got %d: %s", createW.Code, createW.Body.String())
	}

	var createdOrg models.Organization
	json.NewDecoder(createW.Body).Decode(&createdOrg)

	// Get the user ID from JWT claims
	claims, _ := testJWTManager.VerifyAccessToken(userResp.AccessToken)

	// Verify role_source is 'manual' for the org creator
	var roleSource string
	err := testPool.QueryRow(ctx,
		`SELECT role_source FROM organization_memberships WHERE organization_id = $1 AND user_id = $2`,
		createdOrg.ID, claims.UserID,
	).Scan(&roleSource)
	if err != nil {
		t.Fatalf("Failed to query role_source: %v", err)
	}
	if roleSource != "manual" {
		t.Errorf("Expected role_source 'manual' for org creator, got '%s'", roleSource)
	}
}

// Ensure uuid is used
var _ = uuid.New
