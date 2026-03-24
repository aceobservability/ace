package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/janhoon/dash/backend/internal/auth"
)

// --- helpers ----------------------------------------------------------------

// ctxWithUserAndOrg builds a context with authenticated user ID and org ID,
// mimicking what RequireAuth + RequireOrgMember inject.
func ctxWithUserAndOrg(userID, orgID uuid.UUID) context.Context {
	ctx := context.Background()
	ctx = context.WithValue(ctx, auth.UserIDKey, userID)
	ctx = auth.WithOrgID(ctx, orgID)
	return ctx
}

// --- mock AIProvider --------------------------------------------------------

type mockAIProvider struct {
	models   []AIModel
	modelErr error

	chatCalled bool
	chatReq    ChatRequest
	chatErr    error
	chatBody   string // body to write on Chat()
}

func (m *mockAIProvider) ListModels(_ context.Context) ([]AIModel, error) {
	return m.models, m.modelErr
}

func (m *mockAIProvider) Chat(_ context.Context, req ChatRequest, w http.ResponseWriter) error {
	m.chatCalled = true
	m.chatReq = req
	if m.chatErr != nil {
		return m.chatErr
	}
	w.Header().Set("Content-Type", "application/json")
	if m.chatBody != "" {
		w.Write([]byte(m.chatBody))
	} else {
		w.Write([]byte(`{"choices":[]}`))
	}
	return nil
}

// === ListProviders tests ====================================================

func TestListProviders_EmptyArray_WhenNoProviders(t *testing.T) {
	// With a nil pool we cannot query DB; the handler should gracefully
	// return an empty array when both DB paths fail.
	h := NewAIHandler(nil)

	userID := uuid.New()
	orgID := uuid.New()
	req := httptest.NewRequest("GET", "/api/orgs/"+orgID.String()+"/ai/providers", nil)
	req = req.WithContext(ctxWithUserAndOrg(userID, orgID))

	rr := httptest.NewRecorder()
	h.ListProviders(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var body []interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("response is not a JSON array: %v", err)
	}
	if len(body) != 0 {
		t.Errorf("expected empty array, got %d elements", len(body))
	}
}

// === ListModels tests =======================================================

func TestListModels_UnknownProvider_Returns404(t *testing.T) {
	h := NewAIHandler(nil)

	userID := uuid.New()
	orgID := uuid.New()
	req := httptest.NewRequest("GET", "/api/orgs/"+orgID.String()+"/ai/models?provider_id=nonexistent", nil)
	req = req.WithContext(ctxWithUserAndOrg(userID, orgID))

	rr := httptest.NewRecorder()
	h.ListModels(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestListModels_MissingProviderID_Returns400(t *testing.T) {
	h := NewAIHandler(nil)

	userID := uuid.New()
	orgID := uuid.New()
	req := httptest.NewRequest("GET", "/api/orgs/"+orgID.String()+"/ai/models", nil)
	req = req.WithContext(ctxWithUserAndOrg(userID, orgID))

	rr := httptest.NewRecorder()
	h.ListModels(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d: %s", rr.Code, rr.Body.String())
	}
}

// === Chat tests =============================================================

func TestChat_SystemPromptPrepended_ForKnownDatasource(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-for-ai-handler-tests")

	h := NewAIHandler(nil)

	mock := &mockAIProvider{}
	// Inject the mock via the testProvider bypass.
	h.testProvider = mock

	userID := uuid.New()
	orgID := uuid.New()

	chatBody := map[string]interface{}{
		"provider_id":     "test-provider",
		"model":           "gpt-4o",
		"datasource_type": "prometheus",
		"messages":        []map[string]string{{"role": "user", "content": "help me write a query"}},
		"stream":          false,
	}
	bodyBytes, _ := json.Marshal(chatBody)

	req := httptest.NewRequest("POST", "/api/orgs/"+orgID.String()+"/ai/chat", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(ctxWithUserAndOrg(userID, orgID))

	rr := httptest.NewRecorder()
	h.Chat(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	if !mock.chatCalled {
		t.Fatal("expected Chat to be called on provider")
	}

	// Verify system prompt was prepended
	if len(mock.chatReq.Messages) < 2 {
		t.Fatalf("expected at least 2 messages (system + user), got %d", len(mock.chatReq.Messages))
	}

	var firstMsg struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
	if err := json.Unmarshal(mock.chatReq.Messages[0], &firstMsg); err != nil {
		t.Fatalf("failed to unmarshal first message: %v", err)
	}
	if firstMsg.Role != "system" {
		t.Errorf("expected first message role 'system', got '%s'", firstMsg.Role)
	}
	expectedPrompt := SystemPrompts["prometheus"]
	if firstMsg.Content != expectedPrompt {
		t.Errorf("expected prometheus system prompt, got: %s", firstMsg.Content)
	}
}

func TestChat_DefaultSystemPrompt_WhenDatasourceUnknown(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-for-ai-handler-tests")

	h := NewAIHandler(nil)
	mock := &mockAIProvider{}
	h.testProvider = mock

	userID := uuid.New()
	orgID := uuid.New()

	chatBody := map[string]interface{}{
		"provider_id":     "test-provider",
		"model":           "gpt-4o",
		"datasource_type": "unknown_type",
		"messages":        []map[string]string{{"role": "user", "content": "hi"}},
		"stream":          false,
	}
	bodyBytes, _ := json.Marshal(chatBody)

	req := httptest.NewRequest("POST", "/api/orgs/"+orgID.String()+"/ai/chat", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(ctxWithUserAndOrg(userID, orgID))

	rr := httptest.NewRecorder()
	h.Chat(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var firstMsg struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
	json.Unmarshal(mock.chatReq.Messages[0], &firstMsg)
	if firstMsg.Content != DefaultSystemPrompt {
		t.Errorf("expected DefaultSystemPrompt, got: %s", firstMsg.Content)
	}
}

func TestChat_CopilotProvider_RoutesByProviderID(t *testing.T) {
	// When provider_id is "copilot" and there's no DB, we get an error
	// about not being able to load the copilot connection. This verifies
	// the routing logic tries the copilot path.
	h := NewAIHandler(nil)

	userID := uuid.New()
	orgID := uuid.New()

	chatBody := map[string]interface{}{
		"provider_id": "copilot",
		"model":       "gpt-4o",
		"messages":    []map[string]string{{"role": "user", "content": "hi"}},
		"stream":      false,
	}
	bodyBytes, _ := json.Marshal(chatBody)

	req := httptest.NewRequest("POST", "/api/orgs/"+orgID.String()+"/ai/chat", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(ctxWithUserAndOrg(userID, orgID))

	rr := httptest.NewRecorder()
	h.Chat(rr, req)

	// With nil pool, loading copilot connection should fail
	if rr.Code == http.StatusOK {
		t.Error("expected non-200 when copilot connection cannot be loaded")
	}
	if !strings.Contains(rr.Body.String(), "copilot") && !strings.Contains(rr.Body.String(), "GitHub") {
		t.Errorf("expected error related to copilot/GitHub, got: %s", rr.Body.String())
	}
}

func TestChat_UUIDProvider_RoutesByProviderID(t *testing.T) {
	// When provider_id is a UUID and there's no DB, we get an error about
	// not being able to load the provider. This verifies UUID routing.
	h := NewAIHandler(nil)

	userID := uuid.New()
	orgID := uuid.New()
	providerID := uuid.New()

	chatBody := map[string]interface{}{
		"provider_id": providerID.String(),
		"model":       "gpt-4o",
		"messages":    []map[string]string{{"role": "user", "content": "hi"}},
		"stream":      false,
	}
	bodyBytes, _ := json.Marshal(chatBody)

	req := httptest.NewRequest("POST", "/api/orgs/"+orgID.String()+"/ai/chat", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(ctxWithUserAndOrg(userID, orgID))

	rr := httptest.NewRecorder()
	h.Chat(rr, req)

	// With nil pool, provider lookup fails
	if rr.Code == http.StatusOK {
		t.Error("expected non-200 when provider cannot be loaded from DB")
	}
}

func TestChat_InvalidBody_Returns400(t *testing.T) {
	h := NewAIHandler(nil)

	userID := uuid.New()
	orgID := uuid.New()

	req := httptest.NewRequest("POST", "/api/orgs/"+orgID.String()+"/ai/chat", strings.NewReader("not json"))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(ctxWithUserAndOrg(userID, orgID))

	rr := httptest.NewRecorder()
	h.Chat(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 on invalid body, got %d", rr.Code)
	}
}

func TestChat_EmptyMessages_Returns400(t *testing.T) {
	h := NewAIHandler(nil)

	userID := uuid.New()
	orgID := uuid.New()

	chatBody := map[string]interface{}{
		"provider_id": "test",
		"model":       "gpt-4o",
		"messages":    []interface{}{},
		"stream":      false,
	}
	bodyBytes, _ := json.Marshal(chatBody)

	req := httptest.NewRequest("POST", "/api/orgs/"+orgID.String()+"/ai/chat", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(ctxWithUserAndOrg(userID, orgID))

	rr := httptest.NewRecorder()
	h.Chat(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 on empty messages, got %d", rr.Code)
	}
}

// === CRUD tests =============================================================

func TestCreateProvider_NonAdmin_Returns403(t *testing.T) {
	// With nil pool, the admin check query will fail, which should be 403.
	h := NewAIHandler(nil)

	userID := uuid.New()
	orgID := uuid.New()

	body := map[string]interface{}{
		"provider_type": "openai",
		"display_name":  "OpenAI",
		"base_url":      "https://api.openai.com/v1",
		"api_key":       "sk-test",
		"enabled":       true,
	}
	bodyBytes, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/api/orgs/"+orgID.String()+"/ai/providers", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(ctxWithUserAndOrg(userID, orgID))

	rr := httptest.NewRecorder()
	h.CreateProvider(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("expected 403 for non-admin (nil pool fails admin check), got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestUpdateProvider_NonAdmin_Returns403(t *testing.T) {
	h := NewAIHandler(nil)

	userID := uuid.New()
	orgID := uuid.New()
	providerID := uuid.New()

	body := map[string]interface{}{
		"display_name": "Updated",
	}
	bodyBytes, _ := json.Marshal(body)

	req := httptest.NewRequest("PUT", "/api/orgs/"+orgID.String()+"/ai/providers/"+providerID.String(), bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	req.SetPathValue("pid", providerID.String())
	req = req.WithContext(ctxWithUserAndOrg(userID, orgID))

	rr := httptest.NewRecorder()
	h.UpdateProvider(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestDeleteProvider_NonAdmin_Returns403(t *testing.T) {
	h := NewAIHandler(nil)

	userID := uuid.New()
	orgID := uuid.New()
	providerID := uuid.New()

	req := httptest.NewRequest("DELETE", "/api/orgs/"+orgID.String()+"/ai/providers/"+providerID.String(), nil)
	req.SetPathValue("pid", providerID.String())
	req = req.WithContext(ctxWithUserAndOrg(userID, orgID))

	rr := httptest.NewRecorder()
	h.DeleteProvider(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestTestProvider_NonAdmin_Returns403(t *testing.T) {
	h := NewAIHandler(nil)

	userID := uuid.New()
	orgID := uuid.New()
	providerID := uuid.New()

	req := httptest.NewRequest("POST", "/api/orgs/"+orgID.String()+"/ai/providers/"+providerID.String()+"/test", nil)
	req.SetPathValue("pid", providerID.String())
	req = req.WithContext(ctxWithUserAndOrg(userID, orgID))

	rr := httptest.NewRecorder()
	h.TestProvider(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d: %s", rr.Code, rr.Body.String())
	}
}

// === Tool degradation tests =================================================

func TestChat_ToolDegradation_RetriesWithoutTools(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-for-ai-handler-tests")

	h := NewAIHandler(nil)

	callCount := 0
	mock := &mockToolDegradationProvider{
		onChat: func(req ChatRequest, w http.ResponseWriter) error {
			callCount++
			if callCount == 1 {
				// First call with tools: simulate tool-incompatibility error
				return fmt.Errorf("provider returned 400: tools/functions not supported")
			}
			// Second call without tools: succeed
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"choices":[{"message":{"role":"assistant","content":"response without tools"}}]}`))
			return nil
		},
	}
	h.testProvider = mock

	userID := uuid.New()
	orgID := uuid.New()

	chatBody := map[string]interface{}{
		"provider_id": "test-provider",
		"model":       "gpt-4o",
		"messages":    []map[string]string{{"role": "user", "content": "hi"}},
		"tools":       []map[string]interface{}{{"type": "function", "function": map[string]string{"name": "test_tool"}}},
		"stream":      false,
	}
	bodyBytes, _ := json.Marshal(chatBody)

	req := httptest.NewRequest("POST", "/api/orgs/"+orgID.String()+"/ai/chat", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(ctxWithUserAndOrg(userID, orgID))

	rr := httptest.NewRecorder()
	h.Chat(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 after retry, got %d: %s", rr.Code, rr.Body.String())
	}

	if callCount != 2 {
		t.Errorf("expected 2 chat calls (initial + retry), got %d", callCount)
	}

	if rr.Header().Get("X-Tools-Unsupported") != "true" {
		t.Error("expected X-Tools-Unsupported header to be 'true'")
	}
}

func TestChat_ToolDegradation_NonToolError_NotRetried(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-for-ai-handler-tests")

	h := NewAIHandler(nil)

	callCount := 0
	mock := &mockToolDegradationProvider{
		onChat: func(req ChatRequest, w http.ResponseWriter) error {
			callCount++
			return fmt.Errorf("provider returned 500: internal server error")
		},
	}
	h.testProvider = mock

	userID := uuid.New()
	orgID := uuid.New()

	chatBody := map[string]interface{}{
		"provider_id": "test-provider",
		"model":       "gpt-4o",
		"messages":    []map[string]string{{"role": "user", "content": "hi"}},
		"tools":       []map[string]interface{}{{"type": "function", "function": map[string]string{"name": "test_tool"}}},
		"stream":      false,
	}
	bodyBytes, _ := json.Marshal(chatBody)

	req := httptest.NewRequest("POST", "/api/orgs/"+orgID.String()+"/ai/chat", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(ctxWithUserAndOrg(userID, orgID))

	rr := httptest.NewRecorder()
	h.Chat(rr, req)

	// Should not retry for non-tool errors
	if callCount != 1 {
		t.Errorf("expected 1 chat call (no retry for non-tool error), got %d", callCount)
	}

	// Should return an error (502 for provider error)
	if rr.Code == http.StatusOK {
		t.Error("expected non-200 for provider error")
	}
}

// === Provider response security test ========================================

func TestProviderResponse_NeverContainsAPIKey(t *testing.T) {
	// This is a unit-level check: the providerToJSON helper must strip api_key.
	p := providerRow{
		ID:             uuid.New(),
		ProviderType:   "openai",
		DisplayName:    "OpenAI",
		BaseURL:        "https://api.openai.com/v1",
		APIKey:         stringPtr("sk-secret-key-12345"),
		Enabled:        true,
		ModelsOverride: nil,
	}

	j := providerToJSON(p)
	encoded, _ := json.Marshal(j)
	if strings.Contains(string(encoded), "sk-secret") {
		t.Error("providerToJSON leaked api_key into response")
	}
	if strings.Contains(string(encoded), "api_key") {
		t.Error("providerToJSON included api_key field in response")
	}
}

// === helpers for tool degradation test ======================================

type mockToolDegradationProvider struct {
	onChat func(req ChatRequest, w http.ResponseWriter) error
}

func (m *mockToolDegradationProvider) ListModels(_ context.Context) ([]AIModel, error) {
	return nil, nil
}

func (m *mockToolDegradationProvider) Chat(_ context.Context, req ChatRequest, w http.ResponseWriter) error {
	return m.onChat(req, w)
}

// helper
func stringPtr(s string) *string {
	return &s
}
