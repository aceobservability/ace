package main

import (
	"strings"
	"testing"
)

func TestExtractRoutes(t *testing.T) {
	routes, err := extractRoutes("testdata/main.go")
	if err != nil {
		t.Fatalf("extractRoutes: %v", err)
	}

	if got := len(routes); got != 4 {
		t.Fatalf("expected 4 routes, got %d", got)
	}

	tests := []struct {
		idx       int
		method    string
		path      string
		auth      bool
		orgMember bool
		section   string
		typeName  string
		methName  string
	}{
		{0, "GET", "/api/health", false, false, "Health endpoint", "", "HealthCheck"},
		{1, "POST", "/api/auth/login", false, false, "Auth routes", "AuthHandler", "Login"},
		{2, "GET", "/api/auth/me", true, false, "Auth routes", "AuthHandler", "Me"},
		{3, "POST", "/api/orgs/{id}/items", true, true, "Org routes", "OrgHandler", "CreateItem"},
	}

	for _, tt := range tests {
		r := routes[tt.idx]
		if r.Method != tt.method {
			t.Errorf("route[%d].Method = %q, want %q", tt.idx, r.Method, tt.method)
		}
		if r.Path != tt.path {
			t.Errorf("route[%d].Path = %q, want %q", tt.idx, r.Path, tt.path)
		}
		if r.Auth != tt.auth {
			t.Errorf("route[%d].Auth = %v, want %v", tt.idx, r.Auth, tt.auth)
		}
		if r.OrgMember != tt.orgMember {
			t.Errorf("route[%d].OrgMember = %v, want %v", tt.idx, r.OrgMember, tt.orgMember)
		}
		if r.Section != tt.section {
			t.Errorf("route[%d].Section = %q, want %q", tt.idx, r.Section, tt.section)
		}
		if r.TypeName != tt.typeName {
			t.Errorf("route[%d].TypeName = %q, want %q", tt.idx, r.TypeName, tt.typeName)
		}
		if r.MethodName != tt.methName {
			t.Errorf("route[%d].MethodName = %q, want %q", tt.idx, r.MethodName, tt.methName)
		}
	}
}

func TestLoadHandlerDocs(t *testing.T) {
	docs, err := loadHandlerDocs("testdata/handlers")
	if err != nil {
		t.Fatalf("loadHandlerDocs: %v", err)
	}

	tests := map[string]string{
		"HealthCheck":       "HealthCheck returns server health status.",
		"AuthHandler.Login": "Login authenticates a user with email and password.",
		"AuthHandler.Me":    "Me returns the current user profile.",
	}

	for key, want := range tests {
		got, ok := docs[key]
		if !ok {
			t.Errorf("missing doc for %q", key)
			continue
		}
		if got != want {
			t.Errorf("docs[%q] = %q, want %q", key, got, want)
		}
	}

	// OrgHandler.CreateItem has no doc comment, should not appear.
	if _, ok := docs["OrgHandler.CreateItem"]; ok {
		t.Error("OrgHandler.CreateItem should not have a doc entry (comment is not a doc comment)")
	}
}

func TestRenderMarkdown(t *testing.T) {
	routes := []Route{
		{Method: "GET", Path: "/api/health", Section: "Health endpoint", MethodName: "HealthCheck", DocComment: "Returns server health status."},
		{Method: "POST", Path: "/api/auth/login", Section: "Auth routes", MethodName: "Login", DocComment: "Authenticates a user."},
		{Method: "GET", Path: "/api/auth/me", Auth: true, Section: "Auth routes", MethodName: "Me"},
	}

	md := renderMarkdown(routes)

	// Check structure.
	if !strings.Contains(md, "## Health endpoint") {
		t.Error("missing Health endpoint section")
	}
	if !strings.Contains(md, "## Auth routes") {
		t.Error("missing Auth routes section")
	}
	if !strings.Contains(md, "Returns server health status.") {
		t.Error("missing doc comment in output")
	}
	// Me has no DocComment, should fallback to MethodName.
	if !strings.Contains(md, "| Me |") {
		t.Error("missing fallback to method name for undocumented handler")
	}
	if !strings.Contains(md, "| Yes | -") {
		t.Error("missing auth flag")
	}
}
