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
	"github.com/aceobservability/ace/backend/internal/authz"
	"github.com/aceobservability/ace/backend/internal/models"
)

func createTestFolderForPermissions(t *testing.T, folderHandler *FolderHandler, accessToken string, orgID uuid.UUID, name string) models.Folder {
	t.Helper()

	body := `{"name":"` + name + `"}`
	req := httptest.NewRequest(http.MethodPost, "/api/orgs/"+orgID.String()+"/folders", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.SetPathValue("orgId", orgID.String())
	w := httptest.NewRecorder()

	wrapped := auth.RequireAuth(testJWTManager, folderHandler.Create)
	wrapped(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("failed to create folder: %d - %s", w.Code, w.Body.String())
	}

	var folder models.Folder
	if err := json.NewDecoder(w.Body).Decode(&folder); err != nil {
		t.Fatalf("failed to decode folder: %v", err)
	}

	return folder
}

func createTestDashboardForPermissions(t *testing.T, dashboardHandler *DashboardHandler, accessToken string, orgID uuid.UUID, title string) models.Dashboard {
	t.Helper()

	body := `{"title":"` + title + `"}`
	req := httptest.NewRequest(http.MethodPost, "/api/orgs/"+orgID.String()+"/dashboards", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.SetPathValue("orgId", orgID.String())
	w := httptest.NewRecorder()

	wrapped := auth.RequireAuth(testJWTManager, dashboardHandler.Create)
	wrapped(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("failed to create dashboard: %d - %s", w.Code, w.Body.String())
	}

	var dashboard models.Dashboard
	if err := json.NewDecoder(w.Body).Decode(&dashboard); err != nil {
		t.Fatalf("failed to decode dashboard: %v", err)
	}

	return dashboard
}

func TestPermissionHandler_AdminCanManageFolderAndDashboardPermissions(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	permissionHandler := NewPermissionHandler(testPool)
	folderHandler := NewFolderHandler(testPool)
	dashboardHandler := NewDashboardHandler(testPool)
	groupHandler := NewGroupHandler(testPool)

	adminResp := createTestUser(t, authHandler, "testperm-admin@example.com")
	memberResp := createTestUser(t, authHandler, "testperm-member@example.com")
	memberUserID := mustGetUserIDByEmail(t, "testperm-member@example.com")

	org := createTestOrganization(t, orgHandler, adminResp.AccessToken, "perm-org")

	inviteUserToOrganization(
		t,
		orgHandler,
		adminResp.AccessToken,
		org.ID,
		"testperm-member@example.com",
		models.RoleViewer,
		memberResp.AccessToken,
	)

	group := createTestGroup(t, groupHandler, adminResp.AccessToken, org.ID, `{"name":"perm-ops"}`)

	addMemberBody := `{"user_id":"` + memberUserID.String() + `"}`
	addMemberReq := httptest.NewRequest(http.MethodPost, "/api/orgs/"+org.ID.String()+"/groups/"+group.ID.String()+"/members", bytes.NewBufferString(addMemberBody))
	addMemberReq.Header.Set("Content-Type", "application/json")
	addMemberReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	addMemberReq.SetPathValue("id", org.ID.String())
	addMemberReq.SetPathValue("groupId", group.ID.String())
	addMemberW := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, groupHandler.AddMember)(addMemberW, addMemberReq)
	if addMemberW.Code != http.StatusCreated {
		t.Fatalf("failed to add user to permission group: %d - %s", addMemberW.Code, addMemberW.Body.String())
	}

	folder := createTestFolderForPermissions(t, folderHandler, adminResp.AccessToken, org.ID, "Permissions Folder")
	dashboard := createTestDashboardForPermissions(t, dashboardHandler, adminResp.AccessToken, org.ID, "Permissions Dashboard")

	replaceFolderBody := `{"entries":[{"principal_type":"user","principal_id":"` + memberUserID.String() + `","permission":"edit"},{"principal_type":"group","principal_id":"` + group.ID.String() + `","permission":"view"}]}`
	replaceFolderReq := httptest.NewRequest(http.MethodPut, "/api/folders/"+folder.ID.String()+"/permissions", bytes.NewBufferString(replaceFolderBody))
	replaceFolderReq.Header.Set("Content-Type", "application/json")
	replaceFolderReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	replaceFolderReq.SetPathValue("id", folder.ID.String())
	replaceFolderW := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, permissionHandler.ReplaceFolderPermissions)(replaceFolderW, replaceFolderReq)
	if replaceFolderW.Code != http.StatusOK {
		t.Fatalf("expected status 200 replacing folder permissions, got %d: %s", replaceFolderW.Code, replaceFolderW.Body.String())
	}

	listFolderReq := httptest.NewRequest(http.MethodGet, "/api/folders/"+folder.ID.String()+"/permissions", nil)
	listFolderReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	listFolderReq.SetPathValue("id", folder.ID.String())
	listFolderW := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, permissionHandler.ListFolderPermissions)(listFolderW, listFolderReq)
	if listFolderW.Code != http.StatusOK {
		t.Fatalf("expected status 200 listing folder permissions, got %d: %s", listFolderW.Code, listFolderW.Body.String())
	}

	var folderPermissions []models.ResourcePermissionEntry
	if err := json.NewDecoder(listFolderW.Body).Decode(&folderPermissions); err != nil {
		t.Fatalf("failed to decode folder permissions: %v", err)
	}
	if len(folderPermissions) != 2 {
		t.Fatalf("expected 2 folder ACL entries, got %d", len(folderPermissions))
	}

	replaceDashboardBody := `{"entries":[{"principal_type":"user","principal_id":"` + memberUserID.String() + `","permission":"edit"}]}`
	replaceDashboardReq := httptest.NewRequest(http.MethodPut, "/api/dashboards/"+dashboard.ID.String()+"/permissions", bytes.NewBufferString(replaceDashboardBody))
	replaceDashboardReq.Header.Set("Content-Type", "application/json")
	replaceDashboardReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	replaceDashboardReq.SetPathValue("id", dashboard.ID.String())
	replaceDashboardW := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, permissionHandler.ReplaceDashboardPermissions)(replaceDashboardW, replaceDashboardReq)
	if replaceDashboardW.Code != http.StatusOK {
		t.Fatalf("expected status 200 replacing dashboard permissions, got %d: %s", replaceDashboardW.Code, replaceDashboardW.Body.String())
	}

	authzService := authz.NewService(testPool)

	folderPermission, err := authzService.ResolvePermission(
		context.Background(),
		memberUserID,
		org.ID,
		authz.ResourceTypeFolder,
		folder.ID,
	)
	if err != nil {
		t.Fatalf("expected no error resolving folder permission: %v", err)
	}
	if folderPermission != authz.PermissionEdit {
		t.Fatalf("expected folder permission %q, got %q", authz.PermissionEdit, folderPermission)
	}

	dashboardPermission, err := authzService.ResolvePermission(
		context.Background(),
		memberUserID,
		org.ID,
		authz.ResourceTypeDashboard,
		dashboard.ID,
	)
	if err != nil {
		t.Fatalf("expected no error resolving dashboard permission: %v", err)
	}
	if dashboardPermission != authz.PermissionEdit {
		t.Fatalf("expected dashboard permission %q, got %q", authz.PermissionEdit, dashboardPermission)
	}
}

func TestDashboardHandler_Create_SetsDefaultDashboardPermissions(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	dashboardHandler := NewDashboardHandler(testPool)
	permissionHandler := NewPermissionHandler(testPool)
	authzService := authz.NewService(testPool)

	adminResp := createTestUser(t, authHandler, "testperm-default-admin@example.com")
	editorResp := createTestUser(t, authHandler, "testperm-default-editor@example.com")
	viewerResp := createTestUser(t, authHandler, "testperm-default-viewer@example.com")

	editorUserID := mustGetUserIDByEmail(t, "testperm-default-editor@example.com")
	viewerUserID := mustGetUserIDByEmail(t, "testperm-default-viewer@example.com")

	org := createTestOrganization(t, orgHandler, adminResp.AccessToken, "perm-default-org")

	inviteUserToOrganization(
		t,
		orgHandler,
		adminResp.AccessToken,
		org.ID,
		"testperm-default-editor@example.com",
		models.RoleEditor,
		editorResp.AccessToken,
	)

	inviteUserToOrganization(
		t,
		orgHandler,
		adminResp.AccessToken,
		org.ID,
		"testperm-default-viewer@example.com",
		models.RoleViewer,
		viewerResp.AccessToken,
	)

	dashboard := createTestDashboardForPermissions(t, dashboardHandler, editorResp.AccessToken, org.ID, "Default ACL Dashboard")

	editorPermission, err := authzService.ResolvePermission(
		context.Background(),
		editorUserID,
		org.ID,
		authz.ResourceTypeDashboard,
		dashboard.ID,
	)
	if err != nil {
		t.Fatalf("expected no error resolving creator permission: %v", err)
	}
	if editorPermission != authz.PermissionAdmin {
		t.Fatalf("expected creator dashboard permission %q, got %q", authz.PermissionAdmin, editorPermission)
	}

	viewerPermission, err := authzService.ResolvePermission(
		context.Background(),
		viewerUserID,
		org.ID,
		authz.ResourceTypeDashboard,
		dashboard.ID,
	)
	if err != nil {
		t.Fatalf("expected no error resolving member permission: %v", err)
	}
	if viewerPermission != authz.PermissionView {
		t.Fatalf("expected org member dashboard permission %q, got %q", authz.PermissionView, viewerPermission)
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/dashboards/"+dashboard.ID.String()+"/permissions", nil)
	listReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	listReq.SetPathValue("id", dashboard.ID.String())
	listW := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, permissionHandler.ListDashboardPermissions)(listW, listReq)
	if listW.Code != http.StatusOK {
		t.Fatalf("expected status 200 listing default dashboard permissions, got %d: %s", listW.Code, listW.Body.String())
	}

	var permissions []models.ResourcePermissionEntry
	if err := json.NewDecoder(listW.Body).Decode(&permissions); err != nil {
		t.Fatalf("failed to decode dashboard permissions: %v", err)
	}
	if len(permissions) != 3 {
		t.Fatalf("expected 3 default dashboard ACL entries, got %d", len(permissions))
	}
}

func TestPermissionHandler_RejectsNonAdminAndCrossOrgPrincipal(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	permissionHandler := NewPermissionHandler(testPool)
	folderHandler := NewFolderHandler(testPool)
	groupHandler := NewGroupHandler(testPool)

	adminResp := createTestUser(t, authHandler, "testperm2-admin@example.com")
	viewerResp := createTestUser(t, authHandler, "testperm2-viewer@example.com")
	outsiderResp := createTestUser(t, authHandler, "testperm2-outsider@example.com")

	viewerUserID := mustGetUserIDByEmail(t, "testperm2-viewer@example.com")
	outsiderUserID := mustGetUserIDByEmail(t, "testperm2-outsider@example.com")

	orgA := createTestOrganization(t, orgHandler, adminResp.AccessToken, "perm-org-a")
	orgB := createTestOrganization(t, orgHandler, adminResp.AccessToken, "perm-org-b")

	inviteUserToOrganization(
		t,
		orgHandler,
		adminResp.AccessToken,
		orgA.ID,
		"testperm2-viewer@example.com",
		models.RoleViewer,
		viewerResp.AccessToken,
	)

	inviteUserToOrganization(
		t,
		orgHandler,
		adminResp.AccessToken,
		orgB.ID,
		"testperm2-outsider@example.com",
		models.RoleViewer,
		outsiderResp.AccessToken,
	)

	groupInOrgB := createTestGroup(t, groupHandler, adminResp.AccessToken, orgB.ID, `{"name":"perm-other-org-group"}`)

	folder := createTestFolderForPermissions(t, folderHandler, adminResp.AccessToken, orgA.ID, "Permission Guard Folder")

	baselineBody := `{"entries":[{"principal_type":"user","principal_id":"` + viewerUserID.String() + `","permission":"view"}]}`
	baselineReq := httptest.NewRequest(http.MethodPut, "/api/folders/"+folder.ID.String()+"/permissions", bytes.NewBufferString(baselineBody))
	baselineReq.Header.Set("Content-Type", "application/json")
	baselineReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	baselineReq.SetPathValue("id", folder.ID.String())
	baselineW := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, permissionHandler.ReplaceFolderPermissions)(baselineW, baselineReq)
	if baselineW.Code != http.StatusOK {
		t.Fatalf("expected status 200 setting baseline ACL, got %d: %s", baselineW.Code, baselineW.Body.String())
	}

	viewerListReq := httptest.NewRequest(http.MethodGet, "/api/folders/"+folder.ID.String()+"/permissions", nil)
	viewerListReq.Header.Set("Authorization", "Bearer "+viewerResp.AccessToken)
	viewerListReq.SetPathValue("id", folder.ID.String())
	viewerListW := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, permissionHandler.ListFolderPermissions)(viewerListW, viewerListReq)
	if viewerListW.Code != http.StatusForbidden {
		t.Fatalf("expected status 403 for non-admin list, got %d: %s", viewerListW.Code, viewerListW.Body.String())
	}

	crossOrgUserBody := `{"entries":[{"principal_type":"user","principal_id":"` + viewerUserID.String() + `","permission":"edit"},{"principal_type":"user","principal_id":"` + outsiderUserID.String() + `","permission":"view"}]}`
	crossOrgUserReq := httptest.NewRequest(http.MethodPut, "/api/folders/"+folder.ID.String()+"/permissions", bytes.NewBufferString(crossOrgUserBody))
	crossOrgUserReq.Header.Set("Content-Type", "application/json")
	crossOrgUserReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	crossOrgUserReq.SetPathValue("id", folder.ID.String())
	crossOrgUserW := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, permissionHandler.ReplaceFolderPermissions)(crossOrgUserW, crossOrgUserReq)
	if crossOrgUserW.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 for cross-org user principal, got %d: %s", crossOrgUserW.Code, crossOrgUserW.Body.String())
	}

	crossOrgGroupBody := `{"entries":[{"principal_type":"group","principal_id":"` + groupInOrgB.ID.String() + `","permission":"view"}]}`
	crossOrgGroupReq := httptest.NewRequest(http.MethodPut, "/api/folders/"+folder.ID.String()+"/permissions", bytes.NewBufferString(crossOrgGroupBody))
	crossOrgGroupReq.Header.Set("Content-Type", "application/json")
	crossOrgGroupReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	crossOrgGroupReq.SetPathValue("id", folder.ID.String())
	crossOrgGroupW := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, permissionHandler.ReplaceFolderPermissions)(crossOrgGroupW, crossOrgGroupReq)
	if crossOrgGroupW.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 for cross-org group principal, got %d: %s", crossOrgGroupW.Code, crossOrgGroupW.Body.String())
	}

	verifyReq := httptest.NewRequest(http.MethodGet, "/api/folders/"+folder.ID.String()+"/permissions", nil)
	verifyReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	verifyReq.SetPathValue("id", folder.ID.String())
	verifyW := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, permissionHandler.ListFolderPermissions)(verifyW, verifyReq)
	if verifyW.Code != http.StatusOK {
		t.Fatalf("expected status 200 when verifying ACL state, got %d: %s", verifyW.Code, verifyW.Body.String())
	}

	var permissions []models.ResourcePermissionEntry
	if err := json.NewDecoder(verifyW.Body).Decode(&permissions); err != nil {
		t.Fatalf("failed to decode permissions response: %v", err)
	}

	if len(permissions) != 1 {
		t.Fatalf("expected baseline ACL to remain unchanged after failed updates, got %d entries", len(permissions))
	}
	if permissions[0].PrincipalType != models.PrincipalTypeUser || permissions[0].PrincipalID != viewerUserID || permissions[0].Permission != models.ResourcePermissionView {
		t.Fatalf("expected baseline viewer view ACL to remain unchanged, got %+v", permissions[0])
	}
}

func TestFolderAndDashboardHandlers_ReturnForbiddenWhenACLExcludesUser(t *testing.T) {
	orgHandler, authHandler, cleanup := setupOrgTestWithRedis(t)
	defer cleanup()

	permissionHandler := NewPermissionHandler(testPool)
	folderHandler := NewFolderHandler(testPool)
	dashboardHandler := NewDashboardHandler(testPool)

	adminResp := createTestUser(t, authHandler, "testforbidden-admin@example.com")
	allowedResp := createTestUser(t, authHandler, "testforbidden-allowed@example.com")
	deniedResp := createTestUser(t, authHandler, "testforbidden-denied@example.com")

	allowedUserID := mustGetUserIDByEmail(t, "testforbidden-allowed@example.com")

	org := createTestOrganization(t, orgHandler, adminResp.AccessToken, "forbidden-resource-access")

	inviteUserToOrganization(
		t,
		orgHandler,
		adminResp.AccessToken,
		org.ID,
		"testforbidden-allowed@example.com",
		models.RoleViewer,
		allowedResp.AccessToken,
	)

	inviteUserToOrganization(
		t,
		orgHandler,
		adminResp.AccessToken,
		org.ID,
		"testforbidden-denied@example.com",
		models.RoleViewer,
		deniedResp.AccessToken,
	)

	folder := createTestFolderForPermissions(t, folderHandler, adminResp.AccessToken, org.ID, "Restricted Folder")
	dashboard := createTestDashboardForPermissions(t, dashboardHandler, adminResp.AccessToken, org.ID, "Restricted Dashboard")

	replaceFolderBody := `{"entries":[{"principal_type":"user","principal_id":"` + allowedUserID.String() + `","permission":"view"}]}`
	replaceFolderReq := httptest.NewRequest(http.MethodPut, "/api/folders/"+folder.ID.String()+"/permissions", bytes.NewBufferString(replaceFolderBody))
	replaceFolderReq.Header.Set("Content-Type", "application/json")
	replaceFolderReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	replaceFolderReq.SetPathValue("id", folder.ID.String())
	replaceFolderW := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, permissionHandler.ReplaceFolderPermissions)(replaceFolderW, replaceFolderReq)
	if replaceFolderW.Code != http.StatusOK {
		t.Fatalf("expected status 200 setting folder ACL, got %d: %s", replaceFolderW.Code, replaceFolderW.Body.String())
	}

	replaceDashboardBody := `{"entries":[{"principal_type":"user","principal_id":"` + allowedUserID.String() + `","permission":"view"}]}`
	replaceDashboardReq := httptest.NewRequest(http.MethodPut, "/api/dashboards/"+dashboard.ID.String()+"/permissions", bytes.NewBufferString(replaceDashboardBody))
	replaceDashboardReq.Header.Set("Content-Type", "application/json")
	replaceDashboardReq.Header.Set("Authorization", "Bearer "+adminResp.AccessToken)
	replaceDashboardReq.SetPathValue("id", dashboard.ID.String())
	replaceDashboardW := httptest.NewRecorder()

	auth.RequireAuth(testJWTManager, permissionHandler.ReplaceDashboardPermissions)(replaceDashboardW, replaceDashboardReq)
	if replaceDashboardW.Code != http.StatusOK {
		t.Fatalf("expected status 200 setting dashboard ACL, got %d: %s", replaceDashboardW.Code, replaceDashboardW.Body.String())
	}

	folderGetReq := httptest.NewRequest(http.MethodGet, "/api/folders/"+folder.ID.String(), nil)
	folderGetReq.Header.Set("Authorization", "Bearer "+deniedResp.AccessToken)
	folderGetReq.SetPathValue("id", folder.ID.String())
	folderGetW := httptest.NewRecorder()
	auth.RequireAuth(testJWTManager, folderHandler.Get)(folderGetW, folderGetReq)
	if folderGetW.Code != http.StatusForbidden {
		t.Fatalf("expected status 403 for denied folder get, got %d: %s", folderGetW.Code, folderGetW.Body.String())
	}

	folderUpdateReq := httptest.NewRequest(http.MethodPut, "/api/folders/"+folder.ID.String(), bytes.NewBufferString(`{"name":"Denied Rename"}`))
	folderUpdateReq.Header.Set("Content-Type", "application/json")
	folderUpdateReq.Header.Set("Authorization", "Bearer "+deniedResp.AccessToken)
	folderUpdateReq.SetPathValue("id", folder.ID.String())
	folderUpdateW := httptest.NewRecorder()
	auth.RequireAuth(testJWTManager, folderHandler.Update)(folderUpdateW, folderUpdateReq)
	if folderUpdateW.Code != http.StatusForbidden {
		t.Fatalf("expected status 403 for denied folder update, got %d: %s", folderUpdateW.Code, folderUpdateW.Body.String())
	}

	dashboardGetReq := httptest.NewRequest(http.MethodGet, "/api/dashboards/"+dashboard.ID.String(), nil)
	dashboardGetReq.Header.Set("Authorization", "Bearer "+deniedResp.AccessToken)
	dashboardGetReq.SetPathValue("id", dashboard.ID.String())
	dashboardGetW := httptest.NewRecorder()
	auth.RequireAuth(testJWTManager, dashboardHandler.Get)(dashboardGetW, dashboardGetReq)
	if dashboardGetW.Code != http.StatusForbidden {
		t.Fatalf("expected status 403 for denied dashboard get, got %d: %s", dashboardGetW.Code, dashboardGetW.Body.String())
	}

	dashboardUpdateReq := httptest.NewRequest(http.MethodPut, "/api/dashboards/"+dashboard.ID.String(), bytes.NewBufferString(`{"title":"Denied Rename"}`))
	dashboardUpdateReq.Header.Set("Content-Type", "application/json")
	dashboardUpdateReq.Header.Set("Authorization", "Bearer "+deniedResp.AccessToken)
	dashboardUpdateReq.SetPathValue("id", dashboard.ID.String())
	dashboardUpdateW := httptest.NewRecorder()
	auth.RequireAuth(testJWTManager, dashboardHandler.Update)(dashboardUpdateW, dashboardUpdateReq)
	if dashboardUpdateW.Code != http.StatusForbidden {
		t.Fatalf("expected status 403 for denied dashboard update, got %d: %s", dashboardUpdateW.Code, dashboardUpdateW.Body.String())
	}
}
