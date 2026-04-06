package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/aceobservability/ace/backend/internal/auth"
	"github.com/aceobservability/ace/backend/internal/models"
)

func createTestOrganization(t *testing.T, orgHandler *OrganizationHandler, accessToken string, namePrefix string) models.Organization {
	t.Helper()

	slug := namePrefix + "-" + uuid.NewString()
	body := `{"name":"` + namePrefix + `","slug":"` + slug + `"}`
	req := httptest.NewRequest(http.MethodPost, "/api/orgs", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+accessToken)
	w := httptest.NewRecorder()

	wrapped := auth.RequireAuth(testJWTManager, orgHandler.Create)
	wrapped(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("failed to create organization: %d - %s", w.Code, w.Body.String())
	}

	var org models.Organization
	if err := json.NewDecoder(w.Body).Decode(&org); err != nil {
		t.Fatalf("failed to decode organization: %v", err)
	}

	return org
}

func inviteUserToOrganization(
	t *testing.T,
	orgHandler *OrganizationHandler,
	adminToken string,
	orgID uuid.UUID,
	inviteEmail string,
	inviteRole models.MembershipRole,
	inviteeToken string,
) {
	t.Helper()

	inviteBody := `{"email":"` + inviteEmail + `","role":"` + string(inviteRole) + `"}`
	inviteReq := httptest.NewRequest(http.MethodPost, "/api/orgs/"+orgID.String()+"/invitations", bytes.NewBufferString(inviteBody))
	inviteReq.Header.Set("Content-Type", "application/json")
	inviteReq.Header.Set("Authorization", "Bearer "+adminToken)
	inviteReq.SetPathValue("id", orgID.String())
	inviteW := httptest.NewRecorder()

	inviteWrapped := auth.RequireAuth(testJWTManager, orgHandler.CreateInvitation)
	inviteWrapped(inviteW, inviteReq)

	if inviteW.Code != http.StatusCreated {
		t.Fatalf("failed to create invitation: %d - %s", inviteW.Code, inviteW.Body.String())
	}

	var invitation InvitationResponse
	if err := json.NewDecoder(inviteW.Body).Decode(&invitation); err != nil {
		t.Fatalf("failed to decode invitation: %v", err)
	}

	acceptReq := httptest.NewRequest(http.MethodPost, "/api/invitations/"+invitation.Token+"/accept", nil)
	acceptReq.Header.Set("Authorization", "Bearer "+inviteeToken)
	acceptReq.SetPathValue("token", invitation.Token)
	acceptW := httptest.NewRecorder()

	acceptWrapped := auth.RequireAuth(testJWTManager, orgHandler.AcceptInvitation)
	acceptWrapped(acceptW, acceptReq)

	if acceptW.Code != http.StatusCreated {
		t.Fatalf("failed to accept invitation: %d - %s", acceptW.Code, acceptW.Body.String())
	}
}

func createTestGroup(t *testing.T, groupHandler *GroupHandler, accessToken string, orgID uuid.UUID, body string) models.UserGroup {
	t.Helper()

	req := httptest.NewRequest(http.MethodPost, "/api/orgs/"+orgID.String()+"/groups", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.SetPathValue("id", orgID.String())
	w := httptest.NewRecorder()

	wrapped := auth.RequireAuth(testJWTManager, groupHandler.Create)
	wrapped(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("failed to create group: %d - %s", w.Code, w.Body.String())
	}

	var group models.UserGroup
	if err := json.NewDecoder(w.Body).Decode(&group); err != nil {
		t.Fatalf("failed to decode group: %v", err)
	}

	return group
}

func mustGetUserIDByEmail(t *testing.T, email string) uuid.UUID {
	t.Helper()

	var userID uuid.UUID
	err := testPool.QueryRow(context.Background(), `SELECT id FROM users WHERE email = $1`, email).Scan(&userID)
	if err != nil {
		t.Fatalf("failed to load user id for %s: %v", email, err)
	}

	return userID
}

func TestGroupCRUD(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	groupHandler := NewGroupHandler(testPool)
	adminResp := createTestUser(t, authHandler, "testgroupcrud-admin@example.com")
	org := createTestOrganization(t, orgHandler, adminResp.AccessToken, "group-crud")

	createBody := `{"name":"SRE Team","description":"Handles on-call and alerts"}`
	createReq := httptest.NewRequest(http.MethodPost, "/api/orgs/"+org.ID.String()+"/groups", bytes.NewBufferString(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	createReq.SetPathValue("id", org.ID.String())
	createW := httptest.NewRecorder()

	wrappedCreate := auth.RequireAuth(testJWTManager, groupHandler.Create)
	wrappedCreate(createW, createReq)

	if createW.Code != http.StatusCreated {
		t.Fatalf("expected status 201, got %d: %s", createW.Code, createW.Body.String())
	}

	var createdGroup models.UserGroup
	if err := json.NewDecoder(createW.Body).Decode(&createdGroup); err != nil {
		t.Fatalf("failed to decode created group: %v", err)
	}

	if createdGroup.OrganizationID != org.ID {
		t.Fatalf("expected organization_id %s, got %s", org.ID, createdGroup.OrganizationID)
	}
	if createdGroup.Name != "SRE Team" {
		t.Fatalf("expected group name SRE Team, got %s", createdGroup.Name)
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/orgs/"+org.ID.String()+"/groups", nil)
	listReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	listReq.SetPathValue("id", org.ID.String())
	listW := httptest.NewRecorder()

	wrappedList := auth.RequireAuth(testJWTManager, groupHandler.List)
	wrappedList(listW, listReq)

	if listW.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", listW.Code, listW.Body.String())
	}

	var listedGroups []models.UserGroup
	if err := json.NewDecoder(listW.Body).Decode(&listedGroups); err != nil {
		t.Fatalf("failed to decode list response: %v", err)
	}

	found := false
	for _, group := range listedGroups {
		if group.ID == createdGroup.ID {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected created group %s in list response", createdGroup.ID)
	}

	updateBody := `{"name":"Platform Team"}`
	updateReq := httptest.NewRequest(http.MethodPut, "/api/orgs/"+org.ID.String()+"/groups/"+createdGroup.ID.String(), bytes.NewBufferString(updateBody))
	updateReq.Header.Set("Content-Type", "application/json")
	updateReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	updateReq.SetPathValue("id", org.ID.String())
	updateReq.SetPathValue("groupId", createdGroup.ID.String())
	updateW := httptest.NewRecorder()

	wrappedUpdate := auth.RequireAuth(testJWTManager, groupHandler.Update)
	wrappedUpdate(updateW, updateReq)

	if updateW.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", updateW.Code, updateW.Body.String())
	}

	var updatedGroup models.UserGroup
	if err := json.NewDecoder(updateW.Body).Decode(&updatedGroup); err != nil {
		t.Fatalf("failed to decode updated group: %v", err)
	}
	if updatedGroup.Name != "Platform Team" {
		t.Fatalf("expected updated name Platform Team, got %s", updatedGroup.Name)
	}

	deleteReq := httptest.NewRequest(http.MethodDelete, "/api/orgs/"+org.ID.String()+"/groups/"+createdGroup.ID.String(), nil)
	deleteReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	deleteReq.SetPathValue("id", org.ID.String())
	deleteReq.SetPathValue("groupId", createdGroup.ID.String())
	deleteW := httptest.NewRecorder()

	wrappedDelete := auth.RequireAuth(testJWTManager, groupHandler.Delete)
	wrappedDelete(deleteW, deleteReq)

	if deleteW.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", deleteW.Code, deleteW.Body.String())
	}
}

func TestGroupWriteRequiresAdmin(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	groupHandler := NewGroupHandler(testPool)
	adminResp := createTestUser(t, authHandler, "testgroupadmin-admin@example.com")
	viewerResp := createTestUser(t, authHandler, "testgroupadmin-viewer@example.com")
	org := createTestOrganization(t, orgHandler, adminResp.AccessToken, "group-role")

	inviteUserToOrganization(
		t,
		orgHandler,
		adminResp.AccessToken,
		org.ID,
		"testgroupadmin-viewer@example.com",
		models.RoleViewer,
		viewerResp.AccessToken,
	)

	createBody := `{"name":"Admins"}`
	createReq := httptest.NewRequest(http.MethodPost, "/api/orgs/"+org.ID.String()+"/groups", bytes.NewBufferString(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	createReq.SetPathValue("id", org.ID.String())
	createW := httptest.NewRecorder()

	wrappedCreate := auth.RequireAuth(testJWTManager, groupHandler.Create)
	wrappedCreate(createW, createReq)

	if createW.Code != http.StatusCreated {
		t.Fatalf("failed to create admin group: %d - %s", createW.Code, createW.Body.String())
	}

	var createdGroup models.UserGroup
	if err := json.NewDecoder(createW.Body).Decode(&createdGroup); err != nil {
		t.Fatalf("failed to decode created group: %v", err)
	}

	viewerCreateReq := httptest.NewRequest(http.MethodPost, "/api/orgs/"+org.ID.String()+"/groups", bytes.NewBufferString(`{"name":"Viewers"}`))
	viewerCreateReq.Header.Set("Content-Type", "application/json")
	viewerCreateReq.Header.Set("Authorization", "Bearer "+viewerResp.AccessToken)
	viewerCreateReq.SetPathValue("id", org.ID.String())
	viewerCreateW := httptest.NewRecorder()

	wrappedCreate(viewerCreateW, viewerCreateReq)
	if viewerCreateW.Code != http.StatusForbidden {
		t.Fatalf("expected status 403 for viewer create, got %d: %s", viewerCreateW.Code, viewerCreateW.Body.String())
	}

	viewerUpdateReq := httptest.NewRequest(http.MethodPut, "/api/orgs/"+org.ID.String()+"/groups/"+createdGroup.ID.String(), bytes.NewBufferString(`{"name":"Renamed"}`))
	viewerUpdateReq.Header.Set("Content-Type", "application/json")
	viewerUpdateReq.Header.Set("Authorization", "Bearer "+viewerResp.AccessToken)
	viewerUpdateReq.SetPathValue("id", org.ID.String())
	viewerUpdateReq.SetPathValue("groupId", createdGroup.ID.String())
	viewerUpdateW := httptest.NewRecorder()

	wrappedUpdate := auth.RequireAuth(testJWTManager, groupHandler.Update)
	wrappedUpdate(viewerUpdateW, viewerUpdateReq)
	if viewerUpdateW.Code != http.StatusForbidden {
		t.Fatalf("expected status 403 for viewer update, got %d: %s", viewerUpdateW.Code, viewerUpdateW.Body.String())
	}

	viewerDeleteReq := httptest.NewRequest(http.MethodDelete, "/api/orgs/"+org.ID.String()+"/groups/"+createdGroup.ID.String(), nil)
	viewerDeleteReq.Header.Set("Authorization", "Bearer "+viewerResp.AccessToken)
	viewerDeleteReq.SetPathValue("id", org.ID.String())
	viewerDeleteReq.SetPathValue("groupId", createdGroup.ID.String())
	viewerDeleteW := httptest.NewRecorder()

	wrappedDelete := auth.RequireAuth(testJWTManager, groupHandler.Delete)
	wrappedDelete(viewerDeleteW, viewerDeleteReq)
	if viewerDeleteW.Code != http.StatusForbidden {
		t.Fatalf("expected status 403 for viewer delete, got %d: %s", viewerDeleteW.Code, viewerDeleteW.Body.String())
	}
}

func TestGroupListIsOrgScoped(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	groupHandler := NewGroupHandler(testPool)
	adminResp := createTestUser(t, authHandler, "testgroupscope-admin@example.com")
	orgA := createTestOrganization(t, orgHandler, adminResp.AccessToken, "group-scope-a")
	orgB := createTestOrganization(t, orgHandler, adminResp.AccessToken, "group-scope-b")

	wrappedCreate := auth.RequireAuth(testJWTManager, groupHandler.Create)

	createAReq := httptest.NewRequest(http.MethodPost, "/api/orgs/"+orgA.ID.String()+"/groups", bytes.NewBufferString(`{"name":"Group A"}`))
	createAReq.Header.Set("Content-Type", "application/json")
	createAReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	createAReq.SetPathValue("id", orgA.ID.String())
	createAW := httptest.NewRecorder()
	wrappedCreate(createAW, createAReq)
	if createAW.Code != http.StatusCreated {
		t.Fatalf("failed to create group A: %d - %s", createAW.Code, createAW.Body.String())
	}

	createBReq := httptest.NewRequest(http.MethodPost, "/api/orgs/"+orgB.ID.String()+"/groups", bytes.NewBufferString(`{"name":"Group B"}`))
	createBReq.Header.Set("Content-Type", "application/json")
	createBReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	createBReq.SetPathValue("id", orgB.ID.String())
	createBW := httptest.NewRecorder()
	wrappedCreate(createBW, createBReq)
	if createBW.Code != http.StatusCreated {
		t.Fatalf("failed to create group B: %d - %s", createBW.Code, createBW.Body.String())
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/orgs/"+orgA.ID.String()+"/groups", nil)
	listReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	listReq.SetPathValue("id", orgA.ID.String())
	listW := httptest.NewRecorder()

	wrappedList := auth.RequireAuth(testJWTManager, groupHandler.List)
	wrappedList(listW, listReq)

	if listW.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", listW.Code, listW.Body.String())
	}

	var groups []models.UserGroup
	if err := json.NewDecoder(listW.Body).Decode(&groups); err != nil {
		t.Fatalf("failed to decode groups: %v", err)
	}

	if len(groups) != 1 {
		t.Fatalf("expected 1 group for org A, got %d", len(groups))
	}

	if groups[0].OrganizationID != orgA.ID {
		t.Fatalf("expected organization_id %s, got %s", orgA.ID, groups[0].OrganizationID)
	}
}

func TestGroupMembershipLifecycle(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	groupHandler := NewGroupHandler(testPool)
	adminResp := createTestUser(t, authHandler, "testgroupmember-admin@example.com")
	memberResp := createTestUser(t, authHandler, "testgroupmember-user@example.com")
	memberUserID := mustGetUserIDByEmail(t, "testgroupmember-user@example.com")
	org := createTestOrganization(t, orgHandler, adminResp.AccessToken, "group-member-lifecycle")

	inviteUserToOrganization(
		t,
		orgHandler,
		adminResp.AccessToken,
		org.ID,
		"testgroupmember-user@example.com",
		models.RoleViewer,
		memberResp.AccessToken,
	)

	group := createTestGroup(t, groupHandler, adminResp.AccessToken, org.ID, `{"name":"OnCall"}`)

	addBody := `{"user_id":"` + memberUserID.String() + `"}`
	addReq := httptest.NewRequest(http.MethodPost, "/api/orgs/"+org.ID.String()+"/groups/"+group.ID.String()+"/members", bytes.NewBufferString(addBody))
	addReq.Header.Set("Content-Type", "application/json")
	addReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	addReq.SetPathValue("id", org.ID.String())
	addReq.SetPathValue("groupId", group.ID.String())
	addW := httptest.NewRecorder()

	wrappedAdd := auth.RequireAuth(testJWTManager, groupHandler.AddMember)
	wrappedAdd(addW, addReq)

	if addW.Code != http.StatusCreated {
		t.Fatalf("expected status 201, got %d: %s", addW.Code, addW.Body.String())
	}

	var membership models.UserGroupMembership
	if err := json.NewDecoder(addW.Body).Decode(&membership); err != nil {
		t.Fatalf("failed to decode group membership: %v", err)
	}
	if membership.UserID != memberUserID {
		t.Fatalf("expected user_id %s, got %s", memberUserID, membership.UserID)
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/orgs/"+org.ID.String()+"/groups/"+group.ID.String()+"/members", nil)
	listReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	listReq.SetPathValue("id", org.ID.String())
	listReq.SetPathValue("groupId", group.ID.String())
	listW := httptest.NewRecorder()

	wrappedList := auth.RequireAuth(testJWTManager, groupHandler.ListMembers)
	wrappedList(listW, listReq)

	if listW.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", listW.Code, listW.Body.String())
	}

	var members []models.UserGroupMembership
	if err := json.NewDecoder(listW.Body).Decode(&members); err != nil {
		t.Fatalf("failed to decode member list: %v", err)
	}

	if len(members) != 1 {
		t.Fatalf("expected 1 member, got %d", len(members))
	}
	if members[0].UserID != memberUserID {
		t.Fatalf("expected listed user_id %s, got %s", memberUserID, members[0].UserID)
	}

	removeReq := httptest.NewRequest(http.MethodDelete, "/api/orgs/"+org.ID.String()+"/groups/"+group.ID.String()+"/members/"+memberUserID.String(), nil)
	removeReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	removeReq.SetPathValue("id", org.ID.String())
	removeReq.SetPathValue("groupId", group.ID.String())
	removeReq.SetPathValue("userId", memberUserID.String())
	removeW := httptest.NewRecorder()

	wrappedRemove := auth.RequireAuth(testJWTManager, groupHandler.RemoveMember)
	wrappedRemove(removeW, removeReq)

	if removeW.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", removeW.Code, removeW.Body.String())
	}

	listAfterReq := httptest.NewRequest(http.MethodGet, "/api/orgs/"+org.ID.String()+"/groups/"+group.ID.String()+"/members", nil)
	listAfterReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	listAfterReq.SetPathValue("id", org.ID.String())
	listAfterReq.SetPathValue("groupId", group.ID.String())
	listAfterW := httptest.NewRecorder()
	wrappedList(listAfterW, listAfterReq)

	if listAfterW.Code != http.StatusOK {
		t.Fatalf("expected status 200 after removal, got %d: %s", listAfterW.Code, listAfterW.Body.String())
	}

	var membersAfter []models.UserGroupMembership
	if err := json.NewDecoder(listAfterW.Body).Decode(&membersAfter); err != nil {
		t.Fatalf("failed to decode member list after removal: %v", err)
	}
	if len(membersAfter) != 0 {
		t.Fatalf("expected no members after removal, got %d", len(membersAfter))
	}
}

func TestGroupMembershipWriteRequiresAdmin(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	groupHandler := NewGroupHandler(testPool)
	adminResp := createTestUser(t, authHandler, "testgroupmemberrole-admin@example.com")
	viewerResp := createTestUser(t, authHandler, "testgroupmemberrole-viewer@example.com")
	targetResp := createTestUser(t, authHandler, "testgroupmemberrole-target@example.com")
	targetUserID := mustGetUserIDByEmail(t, "testgroupmemberrole-target@example.com")
	org := createTestOrganization(t, orgHandler, adminResp.AccessToken, "group-member-role")

	inviteUserToOrganization(
		t,
		orgHandler,
		adminResp.AccessToken,
		org.ID,
		"testgroupmemberrole-viewer@example.com",
		models.RoleViewer,
		viewerResp.AccessToken,
	)

	inviteUserToOrganization(
		t,
		orgHandler,
		adminResp.AccessToken,
		org.ID,
		"testgroupmemberrole-target@example.com",
		models.RoleEditor,
		targetResp.AccessToken,
	)

	group := createTestGroup(t, groupHandler, adminResp.AccessToken, org.ID, `{"name":"Ops"}`)

	viewerAddBody := `{"user_id":"` + targetUserID.String() + `"}`
	viewerAddReq := httptest.NewRequest(http.MethodPost, "/api/orgs/"+org.ID.String()+"/groups/"+group.ID.String()+"/members", bytes.NewBufferString(viewerAddBody))
	viewerAddReq.Header.Set("Content-Type", "application/json")
	viewerAddReq.Header.Set("Authorization", "Bearer "+viewerResp.AccessToken)
	viewerAddReq.SetPathValue("id", org.ID.String())
	viewerAddReq.SetPathValue("groupId", group.ID.String())
	viewerAddW := httptest.NewRecorder()

	wrappedAdd := auth.RequireAuth(testJWTManager, groupHandler.AddMember)
	wrappedAdd(viewerAddW, viewerAddReq)
	if viewerAddW.Code != http.StatusForbidden {
		t.Fatalf("expected status 403 for viewer add, got %d: %s", viewerAddW.Code, viewerAddW.Body.String())
	}

	adminAddReq := httptest.NewRequest(http.MethodPost, "/api/orgs/"+org.ID.String()+"/groups/"+group.ID.String()+"/members", bytes.NewBufferString(viewerAddBody))
	adminAddReq.Header.Set("Content-Type", "application/json")
	adminAddReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	adminAddReq.SetPathValue("id", org.ID.String())
	adminAddReq.SetPathValue("groupId", group.ID.String())
	adminAddW := httptest.NewRecorder()
	wrappedAdd(adminAddW, adminAddReq)
	if adminAddW.Code != http.StatusCreated {
		t.Fatalf("failed to seed group membership for remove test: %d - %s", adminAddW.Code, adminAddW.Body.String())
	}

	viewerRemoveReq := httptest.NewRequest(http.MethodDelete, "/api/orgs/"+org.ID.String()+"/groups/"+group.ID.String()+"/members/"+targetUserID.String(), nil)
	viewerRemoveReq.Header.Set("Authorization", "Bearer "+viewerResp.AccessToken)
	viewerRemoveReq.SetPathValue("id", org.ID.String())
	viewerRemoveReq.SetPathValue("groupId", group.ID.String())
	viewerRemoveReq.SetPathValue("userId", targetUserID.String())
	viewerRemoveW := httptest.NewRecorder()

	wrappedRemove := auth.RequireAuth(testJWTManager, groupHandler.RemoveMember)
	wrappedRemove(viewerRemoveW, viewerRemoveReq)
	if viewerRemoveW.Code != http.StatusForbidden {
		t.Fatalf("expected status 403 for viewer remove, got %d: %s", viewerRemoveW.Code, viewerRemoveW.Body.String())
	}
}

func TestGroupMembershipRejectsCrossOrgAndDuplicate(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	groupHandler := NewGroupHandler(testPool)
	adminResp := createTestUser(t, authHandler, "testgroupmembercross-admin@example.com")
	orgA := createTestOrganization(t, orgHandler, adminResp.AccessToken, "group-member-cross-a")
	orgB := createTestOrganization(t, orgHandler, adminResp.AccessToken, "group-member-cross-b")
	targetResp := createTestUser(t, authHandler, "testgroupmembercross-target@example.com")
	targetUserID := mustGetUserIDByEmail(t, "testgroupmembercross-target@example.com")

	inviteUserToOrganization(
		t,
		orgHandler,
		adminResp.AccessToken,
		orgB.ID,
		"testgroupmembercross-target@example.com",
		models.RoleViewer,
		targetResp.AccessToken,
	)

	group := createTestGroup(t, groupHandler, adminResp.AccessToken, orgA.ID, `{"name":"Analytics"}`)

	crossOrgBody := `{"user_id":"` + targetUserID.String() + `"}`
	crossOrgReq := httptest.NewRequest(http.MethodPost, "/api/orgs/"+orgA.ID.String()+"/groups/"+group.ID.String()+"/members", bytes.NewBufferString(crossOrgBody))
	crossOrgReq.Header.Set("Content-Type", "application/json")
	crossOrgReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	crossOrgReq.SetPathValue("id", orgA.ID.String())
	crossOrgReq.SetPathValue("groupId", group.ID.String())
	crossOrgW := httptest.NewRecorder()

	wrappedAdd := auth.RequireAuth(testJWTManager, groupHandler.AddMember)
	wrappedAdd(crossOrgW, crossOrgReq)
	if crossOrgW.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 for cross-org add, got %d: %s", crossOrgW.Code, crossOrgW.Body.String())
	}

	memberResp := createTestUser(t, authHandler, "testgroupmembercross-member@example.com")
	memberUserID := mustGetUserIDByEmail(t, "testgroupmembercross-member@example.com")
	inviteUserToOrganization(
		t,
		orgHandler,
		adminResp.AccessToken,
		orgA.ID,
		"testgroupmembercross-member@example.com",
		models.RoleViewer,
		memberResp.AccessToken,
	)

	memberBody := `{"user_id":"` + memberUserID.String() + `"}`
	firstAddReq := httptest.NewRequest(http.MethodPost, "/api/orgs/"+orgA.ID.String()+"/groups/"+group.ID.String()+"/members", bytes.NewBufferString(memberBody))
	firstAddReq.Header.Set("Content-Type", "application/json")
	firstAddReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	firstAddReq.SetPathValue("id", orgA.ID.String())
	firstAddReq.SetPathValue("groupId", group.ID.String())
	firstAddW := httptest.NewRecorder()
	wrappedAdd(firstAddW, firstAddReq)
	if firstAddW.Code != http.StatusCreated {
		t.Fatalf("expected first add to succeed, got %d: %s", firstAddW.Code, firstAddW.Body.String())
	}

	duplicateAddReq := httptest.NewRequest(http.MethodPost, "/api/orgs/"+orgA.ID.String()+"/groups/"+group.ID.String()+"/members", bytes.NewBufferString(memberBody))
	duplicateAddReq.Header.Set("Content-Type", "application/json")
	duplicateAddReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	duplicateAddReq.SetPathValue("id", orgA.ID.String())
	duplicateAddReq.SetPathValue("groupId", group.ID.String())
	duplicateAddW := httptest.NewRecorder()
	wrappedAdd(duplicateAddW, duplicateAddReq)

	if duplicateAddW.Code != http.StatusConflict {
		t.Fatalf("expected status 409 for duplicate add, got %d: %s", duplicateAddW.Code, duplicateAddW.Body.String())
	}
}
