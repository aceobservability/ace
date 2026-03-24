package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/janhoon/dash/backend/internal/crypto"
)

func TestOpenAICompatibleProvider_ListModels(t *testing.T) {
	// Mock server returns a valid OpenAI models list
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/models" {
			t.Errorf("expected path /models, got %s", r.URL.Path)
		}
		if r.Method != "GET" {
			t.Errorf("expected GET, got %s", r.Method)
		}
		// Verify Authorization header is present
		auth := r.Header.Get("Authorization")
		if auth != "Bearer test-api-key" {
			t.Errorf("expected Authorization 'Bearer test-api-key', got '%s'", auth)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"data": []map[string]interface{}{
				{
					"id":       "gpt-4o",
					"object":   "model",
					"owned_by": "openai",
				},
				{
					"id":       "gpt-4o-mini",
					"object":   "model",
					"owned_by": "openai",
				},
				{
					"id":       "llama-3.1-70b",
					"object":   "model",
					"owned_by": "meta",
				},
			},
		})
	}))
	defer mockServer.Close()

	provider := NewOpenAICompatibleProvider(mockServer.URL, "test-api-key", "TestProvider")

	models, err := provider.ListModels(context.Background())
	if err != nil {
		t.Fatalf("ListModels returned error: %v", err)
	}

	if len(models) != 3 {
		t.Fatalf("expected 3 models, got %d", len(models))
	}

	// Check first model
	if models[0].ID != "gpt-4o" {
		t.Errorf("expected model ID 'gpt-4o', got '%s'", models[0].ID)
	}
	if models[0].Name != "gpt-4o" {
		t.Errorf("expected model Name 'gpt-4o', got '%s'", models[0].Name)
	}
	if models[0].Vendor != "openai" {
		t.Errorf("expected model Vendor 'openai', got '%s'", models[0].Vendor)
	}

	// Check third model vendor mapping
	if models[2].Vendor != "meta" {
		t.Errorf("expected model Vendor 'meta', got '%s'", models[2].Vendor)
	}
}

func TestOpenAICompatibleProvider_ListModels_NoAPIKey(t *testing.T) {
	// Mock server for Ollama-style provider (no API key)
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify NO Authorization header is sent
		auth := r.Header.Get("Authorization")
		if auth != "" {
			t.Errorf("expected no Authorization header for keyless provider, got '%s'", auth)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"data": []map[string]interface{}{
				{
					"id":       "llama3:latest",
					"object":   "model",
					"owned_by": "library",
				},
			},
		})
	}))
	defer mockServer.Close()

	provider := NewOpenAICompatibleProvider(mockServer.URL, "", "Ollama")

	models, err := provider.ListModels(context.Background())
	if err != nil {
		t.Fatalf("ListModels returned error: %v", err)
	}

	if len(models) != 1 {
		t.Fatalf("expected 1 model, got %d", len(models))
	}
	if models[0].ID != "llama3:latest" {
		t.Errorf("expected model ID 'llama3:latest', got '%s'", models[0].ID)
	}
}

func TestOpenAICompatibleProvider_ListModels_ServerError(t *testing.T) {
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error": "internal server error"}`))
	}))
	defer mockServer.Close()

	provider := NewOpenAICompatibleProvider(mockServer.URL, "test-key", "TestProvider")

	_, err := provider.ListModels(context.Background())
	if err == nil {
		t.Fatal("expected error on server 500, got nil")
	}
	if !strings.Contains(err.Error(), "500") {
		t.Errorf("expected error to contain '500', got: %s", err.Error())
	}
}

func TestOpenAICompatibleProvider_Chat_NonStreaming(t *testing.T) {
	expectedResponse := `{"id":"chatcmpl-123","object":"chat.completion","choices":[{"index":0,"message":{"role":"assistant","content":"Hello!"},"finish_reason":"stop"}]}`

	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat/completions" {
			t.Errorf("expected path /chat/completions, got %s", r.URL.Path)
		}
		if r.Method != "POST" {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("expected Content-Type application/json, got %s", r.Header.Get("Content-Type"))
		}
		if r.Header.Get("Authorization") != "Bearer test-api-key" {
			t.Errorf("expected Authorization 'Bearer test-api-key', got '%s'", r.Header.Get("Authorization"))
		}

		// Verify request body
		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("failed to decode request body: %v", err)
		}
		if body["model"] != "gpt-4o" {
			t.Errorf("expected model 'gpt-4o', got '%v'", body["model"])
		}
		if body["stream"] != false {
			t.Errorf("expected stream false, got %v", body["stream"])
		}

		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(expectedResponse))
	}))
	defer mockServer.Close()

	provider := NewOpenAICompatibleProvider(mockServer.URL, "test-api-key", "TestProvider")

	chatReq := ChatRequest{
		Model:    "gpt-4o",
		Messages: []json.RawMessage{json.RawMessage(`{"role":"user","content":"Hi"}`)},
		Stream:   false,
	}

	recorder := httptest.NewRecorder()
	err := provider.Chat(context.Background(), chatReq, recorder)
	if err != nil {
		t.Fatalf("Chat returned error: %v", err)
	}

	// Verify Content-Type is application/json
	if ct := recorder.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("expected Content-Type 'application/json', got '%s'", ct)
	}

	// Verify response body is passed through
	respBody := recorder.Body.String()
	if respBody != expectedResponse {
		t.Errorf("expected response body %q, got %q", expectedResponse, respBody)
	}
}

func TestOpenAICompatibleProvider_Chat_Streaming(t *testing.T) {
	chunk1 := `data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"Hel"},"finish_reason":null}]}`
	chunk2 := `data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"lo!"},"finish_reason":null}]}`
	chunk3 := `data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}`
	chunkDone := `data: [DONE]`

	sseBody := fmt.Sprintf("%s\n\n%s\n\n%s\n\n%s\n\n", chunk1, chunk2, chunk3, chunkDone)

	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify stream=true in body
		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("failed to decode request body: %v", err)
		}
		if body["stream"] != true {
			t.Errorf("expected stream true, got %v", body["stream"])
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(sseBody))
	}))
	defer mockServer.Close()

	provider := NewOpenAICompatibleProvider(mockServer.URL, "test-api-key", "TestProvider")

	chatReq := ChatRequest{
		Model:    "gpt-4o",
		Messages: []json.RawMessage{json.RawMessage(`{"role":"user","content":"Hi"}`)},
		Stream:   true,
	}

	recorder := httptest.NewRecorder()
	err := provider.Chat(context.Background(), chatReq, recorder)
	if err != nil {
		t.Fatalf("Chat returned error: %v", err)
	}

	// Verify streaming response headers
	if ct := recorder.Header().Get("Content-Type"); ct != "text/event-stream" {
		t.Errorf("expected Content-Type 'text/event-stream', got '%s'", ct)
	}
	if cc := recorder.Header().Get("Cache-Control"); cc != "no-cache" {
		t.Errorf("expected Cache-Control 'no-cache', got '%s'", cc)
	}

	// Verify the SSE content was passed through
	respBody := recorder.Body.String()
	if !strings.Contains(respBody, "data: {") {
		t.Errorf("expected SSE data in response, got: %s", respBody)
	}
	if !strings.Contains(respBody, "[DONE]") {
		t.Errorf("expected [DONE] in response, got: %s", respBody)
	}
	if !strings.Contains(respBody, "Hel") {
		t.Errorf("expected 'Hel' chunk content in response, got: %s", respBody)
	}
	if !strings.Contains(respBody, "lo!") {
		t.Errorf("expected 'lo!' chunk content in response, got: %s", respBody)
	}
}

func TestOpenAICompatibleProvider_Chat_UpstreamError(t *testing.T) {
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
		w.Write([]byte(`{"error":{"message":"rate limit exceeded"}}`))
	}))
	defer mockServer.Close()

	provider := NewOpenAICompatibleProvider(mockServer.URL, "test-api-key", "TestProvider")

	chatReq := ChatRequest{
		Model:    "gpt-4o",
		Messages: []json.RawMessage{json.RawMessage(`{"role":"user","content":"Hi"}`)},
		Stream:   false,
	}

	recorder := httptest.NewRecorder()
	err := provider.Chat(context.Background(), chatReq, recorder)
	if err == nil {
		t.Fatal("expected error on upstream 429, got nil")
	}
	if !strings.Contains(err.Error(), "429") {
		t.Errorf("expected error to contain '429', got: %s", err.Error())
	}
}

func TestOpenAICompatibleProvider_Chat_WithTools(t *testing.T) {
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		bodyBytes, _ := io.ReadAll(r.Body)
		var body map[string]interface{}
		json.Unmarshal(bodyBytes, &body)

		// Verify tools are passed through
		tools, ok := body["tools"]
		if !ok {
			t.Error("expected tools in request body")
		}
		toolsArr, ok := tools.([]interface{})
		if !ok || len(toolsArr) == 0 {
			t.Error("expected non-empty tools array")
		}

		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"id":"chatcmpl-123","choices":[{"message":{"role":"assistant","tool_calls":[{"id":"call_1","type":"function","function":{"name":"get_weather","arguments":"{}"}}]}}]}`))
	}))
	defer mockServer.Close()

	provider := NewOpenAICompatibleProvider(mockServer.URL, "test-api-key", "TestProvider")

	chatReq := ChatRequest{
		Model:    "gpt-4o",
		Messages: []json.RawMessage{json.RawMessage(`{"role":"user","content":"What's the weather?"}`)},
		Tools:    []json.RawMessage{json.RawMessage(`{"type":"function","function":{"name":"get_weather"}}`)},
		Stream:   false,
	}

	recorder := httptest.NewRecorder()
	err := provider.Chat(context.Background(), chatReq, recorder)
	if err != nil {
		t.Fatalf("Chat returned error: %v", err)
	}

	if !strings.Contains(recorder.Body.String(), "tool_calls") {
		t.Error("expected tool_calls in response")
	}
}

// --- CopilotProvider tests ---

// encryptTestToken encrypts a plaintext token for use in tests.
// Requires JWT_SECRET to be set (test runner sets it).
func encryptTestToken(t *testing.T, plaintext string) string {
	t.Helper()
	enc, err := crypto.EncryptToken(plaintext)
	if err != nil {
		t.Fatalf("failed to encrypt test token: %v", err)
	}
	return enc
}

// copilotModelsPayload returns a Copilot models API response with enabled and disabled models.
func copilotModelsPayload() string {
	return `{
		"data": [
			{
				"id": "gpt-4o",
				"name": "GPT-4o",
				"vendor": "openai",
				"model_picker_enabled": true,
				"model_picker_category": "chat",
				"preview": false,
				"policy": {"state": "enabled"},
				"supported_endpoints": ["/chat/completions"]
			},
			{
				"id": "claude-sonnet-4",
				"name": "Claude Sonnet 4",
				"vendor": "anthropic",
				"model_picker_enabled": true,
				"model_picker_category": "chat",
				"preview": false,
				"policy": {"state": "enabled"},
				"supported_endpoints": ["/chat/completions"]
			},
			{
				"id": "disabled-model",
				"name": "Disabled Model",
				"vendor": "test",
				"model_picker_enabled": false,
				"model_picker_category": "chat",
				"preview": false,
				"policy": {"state": "enabled"},
				"supported_endpoints": ["/chat/completions"]
			},
			{
				"id": "policy-blocked",
				"name": "Policy Blocked",
				"vendor": "test",
				"model_picker_enabled": true,
				"model_picker_category": "chat",
				"preview": false,
				"policy": {"state": "disabled"},
				"supported_endpoints": ["/chat/completions"]
			},
			{
				"id": "embeddings-only",
				"name": "Embeddings Only",
				"vendor": "test",
				"model_picker_enabled": true,
				"model_picker_category": "embeddings",
				"preview": false,
				"policy": {"state": "enabled"},
				"supported_endpoints": ["/embeddings"]
			}
		]
	}`
}

// copilotHeaders are the headers the CopilotProvider must send on every request.
var copilotExpectedHeaders = map[string]string{
	"Editor-Version":         "vscode/1.100.0",
	"Editor-Plugin-Version":  "copilot/1.300.0",
	"User-Agent":             "GithubCopilot/1.300.0",
	"Copilot-Integration-Id": "vscode-chat",
}

// verifyCopilotHeaders checks that all required Copilot headers are present.
func verifyCopilotHeaders(t *testing.T, r *http.Request) {
	t.Helper()
	for k, v := range copilotExpectedHeaders {
		if got := r.Header.Get(k); got != v {
			t.Errorf("expected header %s=%q, got %q", k, v, got)
		}
	}
}

func TestCopilotProvider_ListModels(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-for-copilot-tests")
	// Track token endpoint calls to verify caching later
	var tokenCalls int32

	copilotToken := "tid=test-copilot-session-token"
	expiresAt := time.Now().Unix() + 3600 // 1 hour from now

	// Mock Copilot API (models endpoint)
	copilotAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		verifyCopilotHeaders(t, r)

		if r.Header.Get("Authorization") != "Bearer "+copilotToken {
			t.Errorf("expected Authorization 'Bearer %s', got '%s'", copilotToken, r.Header.Get("Authorization"))
		}

		if r.URL.Path == "/models" && r.Method == "GET" {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(copilotModelsPayload()))
			return
		}
		t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
		w.WriteHeader(http.StatusNotFound)
	}))
	defer copilotAPI.Close()

	// Mock GitHub token endpoint
	tokenServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&tokenCalls, 1)

		if r.URL.Path != "/copilot_internal/v2/token" {
			t.Errorf("expected path /copilot_internal/v2/token, got %s", r.URL.Path)
		}
		if r.Method != "GET" {
			t.Errorf("expected GET, got %s", r.Method)
		}

		// The token endpoint uses "token <ghToken>" auth
		auth := r.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "token ") {
			t.Errorf("expected Authorization to start with 'token ', got '%s'", auth)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"token":      copilotToken,
			"expires_at": expiresAt,
			"endpoints":  map[string]string{"api": copilotAPI.URL},
		})
	}))
	defer tokenServer.Close()

	encToken := encryptTestToken(t, "ghp_test_github_token")

	// Clear the cache before test
	copilotTokenCache.Range(func(key, value interface{}) bool {
		copilotTokenCache.Delete(key)
		return true
	})

	provider := &CopilotProvider{
		EncryptedGHToken: encToken,
		tokenEndpoint:    tokenServer.URL + "/copilot_internal/v2/token",
	}

	models, err := provider.ListModels(context.Background())
	if err != nil {
		t.Fatalf("ListModels returned error: %v", err)
	}

	// Should only include enabled models with model_picker_enabled=true, policy.state=enabled, and /chat/completions support
	if len(models) != 2 {
		t.Fatalf("expected 2 filtered models, got %d: %+v", len(models), models)
	}

	// Verify first model
	if models[0].ID != "gpt-4o" {
		t.Errorf("expected first model ID 'gpt-4o', got '%s'", models[0].ID)
	}
	if models[0].Name != "GPT-4o" {
		t.Errorf("expected first model Name 'GPT-4o', got '%s'", models[0].Name)
	}
	if models[0].Vendor != "openai" {
		t.Errorf("expected first model Vendor 'openai', got '%s'", models[0].Vendor)
	}

	// Verify second model
	if models[1].ID != "claude-sonnet-4" {
		t.Errorf("expected second model ID 'claude-sonnet-4', got '%s'", models[1].ID)
	}
	if models[1].Vendor != "anthropic" {
		t.Errorf("expected second model Vendor 'anthropic', got '%s'", models[1].Vendor)
	}

	// Verify token endpoint was called exactly once
	if calls := atomic.LoadInt32(&tokenCalls); calls != 1 {
		t.Errorf("expected 1 token endpoint call, got %d", calls)
	}
}

func TestCopilotProvider_ListModels_TokenCaching(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-for-copilot-tests")
	var tokenCalls int32

	copilotToken := "tid=cached-session-token"
	expiresAt := time.Now().Unix() + 3600

	copilotAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(copilotModelsPayload()))
	}))
	defer copilotAPI.Close()

	tokenServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&tokenCalls, 1)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"token":      copilotToken,
			"expires_at": expiresAt,
			"endpoints":  map[string]string{"api": copilotAPI.URL},
		})
	}))
	defer tokenServer.Close()

	encToken := encryptTestToken(t, "ghp_caching_test_token")

	// Clear the cache before test
	copilotTokenCache.Range(func(key, value interface{}) bool {
		copilotTokenCache.Delete(key)
		return true
	})

	provider := &CopilotProvider{
		EncryptedGHToken: encToken,
		tokenEndpoint:    tokenServer.URL + "/copilot_internal/v2/token",
	}

	// First call — should hit the token endpoint
	_, err := provider.ListModels(context.Background())
	if err != nil {
		t.Fatalf("first ListModels call returned error: %v", err)
	}

	// Second call — should reuse the cached token
	_, err = provider.ListModels(context.Background())
	if err != nil {
		t.Fatalf("second ListModels call returned error: %v", err)
	}

	// Token endpoint should have been called exactly ONCE (second call uses cache)
	if calls := atomic.LoadInt32(&tokenCalls); calls != 1 {
		t.Errorf("expected token endpoint to be called 1 time (caching), got %d", calls)
	}
}

func TestCopilotProvider_ListModels_TokenExpired(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-for-copilot-tests")
	var tokenCalls int32

	copilotAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(copilotModelsPayload()))
	}))
	defer copilotAPI.Close()

	tokenServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&tokenCalls, 1)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"token":      "tid=fresh-token",
			"expires_at": time.Now().Unix() + 3600,
			"endpoints":  map[string]string{"api": copilotAPI.URL},
		})
	}))
	defer tokenServer.Close()

	encToken := encryptTestToken(t, "ghp_expired_test_token")

	// Clear cache, then seed an expired entry
	copilotTokenCache.Range(func(key, value interface{}) bool {
		copilotTokenCache.Delete(key)
		return true
	})

	// Pre-seed cache with an expired token (expiresAt in the past)
	copilotTokenCache.Store(hashToken("ghp_expired_test_token"), cachedCopilotToken{
		token:       "tid=expired",
		apiEndpoint: copilotAPI.URL,
		expiresAt:   time.Now().Unix() - 10, // already expired
	})

	provider := &CopilotProvider{
		EncryptedGHToken: encToken,
		tokenEndpoint:    tokenServer.URL + "/copilot_internal/v2/token",
	}

	_, err := provider.ListModels(context.Background())
	if err != nil {
		t.Fatalf("ListModels returned error: %v", err)
	}

	// Should have fetched a new token since the cached one was expired
	if calls := atomic.LoadInt32(&tokenCalls); calls != 1 {
		t.Errorf("expected 1 token fetch for expired cache, got %d", calls)
	}
}

func TestCopilotProvider_Chat_NonStreaming(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-for-copilot-tests")
	expectedResponse := `{"id":"chatcmpl-456","object":"chat.completion","choices":[{"index":0,"message":{"role":"assistant","content":"Hello from Copilot!"},"finish_reason":"stop"}]}`

	copilotToken := "tid=chat-test-token"
	expiresAt := time.Now().Unix() + 3600

	copilotAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		verifyCopilotHeaders(t, r)

		if r.URL.Path != "/chat/completions" {
			t.Errorf("expected path /chat/completions, got %s", r.URL.Path)
		}
		if r.Method != "POST" {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if r.Header.Get("Authorization") != "Bearer "+copilotToken {
			t.Errorf("expected Authorization 'Bearer %s', got '%s'", copilotToken, r.Header.Get("Authorization"))
		}

		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("failed to decode request body: %v", err)
		}
		if body["model"] != "gpt-4o" {
			t.Errorf("expected model 'gpt-4o', got '%v'", body["model"])
		}
		if body["stream"] != false {
			t.Errorf("expected stream false, got %v", body["stream"])
		}

		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(expectedResponse))
	}))
	defer copilotAPI.Close()

	tokenServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"token":      copilotToken,
			"expires_at": expiresAt,
			"endpoints":  map[string]string{"api": copilotAPI.URL},
		})
	}))
	defer tokenServer.Close()

	encToken := encryptTestToken(t, "ghp_chat_nonstream_token")

	copilotTokenCache.Range(func(key, value interface{}) bool {
		copilotTokenCache.Delete(key)
		return true
	})

	provider := &CopilotProvider{
		EncryptedGHToken: encToken,
		tokenEndpoint:    tokenServer.URL + "/copilot_internal/v2/token",
	}

	chatReq := ChatRequest{
		Model:    "gpt-4o",
		Messages: []json.RawMessage{json.RawMessage(`{"role":"user","content":"Hi"}`)},
		Stream:   false,
	}

	recorder := httptest.NewRecorder()
	err := provider.Chat(context.Background(), chatReq, recorder)
	if err != nil {
		t.Fatalf("Chat returned error: %v", err)
	}

	if ct := recorder.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("expected Content-Type 'application/json', got '%s'", ct)
	}

	respBody := recorder.Body.String()
	if respBody != expectedResponse {
		t.Errorf("expected response body %q, got %q", expectedResponse, respBody)
	}
}

func TestCopilotProvider_Chat_Streaming(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-for-copilot-tests")
	chunk1 := `data: {"id":"chatcmpl-789","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"Hel"},"finish_reason":null}]}`
	chunk2 := `data: {"id":"chatcmpl-789","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"lo!"},"finish_reason":null}]}`
	chunk3 := `data: {"id":"chatcmpl-789","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}`
	chunkDone := `data: [DONE]`

	sseBody := fmt.Sprintf("%s\n\n%s\n\n%s\n\n%s\n\n", chunk1, chunk2, chunk3, chunkDone)

	copilotToken := "tid=stream-test-token"
	expiresAt := time.Now().Unix() + 3600

	copilotAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		verifyCopilotHeaders(t, r)

		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("failed to decode request body: %v", err)
		}
		if body["stream"] != true {
			t.Errorf("expected stream true, got %v", body["stream"])
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(sseBody))
	}))
	defer copilotAPI.Close()

	tokenServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"token":      copilotToken,
			"expires_at": expiresAt,
			"endpoints":  map[string]string{"api": copilotAPI.URL},
		})
	}))
	defer tokenServer.Close()

	encToken := encryptTestToken(t, "ghp_chat_stream_token")

	copilotTokenCache.Range(func(key, value interface{}) bool {
		copilotTokenCache.Delete(key)
		return true
	})

	provider := &CopilotProvider{
		EncryptedGHToken: encToken,
		tokenEndpoint:    tokenServer.URL + "/copilot_internal/v2/token",
	}

	chatReq := ChatRequest{
		Model:    "claude-sonnet-4",
		Messages: []json.RawMessage{json.RawMessage(`{"role":"user","content":"Hi"}`)},
		Stream:   true,
	}

	recorder := httptest.NewRecorder()
	err := provider.Chat(context.Background(), chatReq, recorder)
	if err != nil {
		t.Fatalf("Chat returned error: %v", err)
	}

	if ct := recorder.Header().Get("Content-Type"); ct != "text/event-stream" {
		t.Errorf("expected Content-Type 'text/event-stream', got '%s'", ct)
	}
	if cc := recorder.Header().Get("Cache-Control"); cc != "no-cache" {
		t.Errorf("expected Cache-Control 'no-cache', got '%s'", cc)
	}

	respBody := recorder.Body.String()
	if !strings.Contains(respBody, "data: {") {
		t.Errorf("expected SSE data in response, got: %s", respBody)
	}
	if !strings.Contains(respBody, "[DONE]") {
		t.Errorf("expected [DONE] in response, got: %s", respBody)
	}
	if !strings.Contains(respBody, "Hel") {
		t.Errorf("expected 'Hel' chunk content in response, got: %s", respBody)
	}
	if !strings.Contains(respBody, "lo!") {
		t.Errorf("expected 'lo!' chunk content in response, got: %s", respBody)
	}
}

func TestCopilotProvider_Chat_UpstreamError(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-for-copilot-tests")
	copilotToken := "tid=error-test-token"
	expiresAt := time.Now().Unix() + 3600

	copilotAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
		w.Write([]byte(`{"error":{"message":"rate limit exceeded"}}`))
	}))
	defer copilotAPI.Close()

	tokenServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"token":      copilotToken,
			"expires_at": expiresAt,
			"endpoints":  map[string]string{"api": copilotAPI.URL},
		})
	}))
	defer tokenServer.Close()

	encToken := encryptTestToken(t, "ghp_error_test_token")

	copilotTokenCache.Range(func(key, value interface{}) bool {
		copilotTokenCache.Delete(key)
		return true
	})

	provider := &CopilotProvider{
		EncryptedGHToken: encToken,
		tokenEndpoint:    tokenServer.URL + "/copilot_internal/v2/token",
	}

	chatReq := ChatRequest{
		Model:    "gpt-4o",
		Messages: []json.RawMessage{json.RawMessage(`{"role":"user","content":"Hi"}`)},
		Stream:   false,
	}

	recorder := httptest.NewRecorder()
	err := provider.Chat(context.Background(), chatReq, recorder)
	if err == nil {
		t.Fatal("expected error on upstream 429, got nil")
	}
	if !strings.Contains(err.Error(), "429") {
		t.Errorf("expected error to contain '429', got: %s", err.Error())
	}
}

func TestCopilotProvider_TokenEndpointError(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-for-copilot-tests")
	tokenServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"message":"Bad credentials"}`))
	}))
	defer tokenServer.Close()

	encToken := encryptTestToken(t, "ghp_bad_creds_token")

	copilotTokenCache.Range(func(key, value interface{}) bool {
		copilotTokenCache.Delete(key)
		return true
	})

	provider := &CopilotProvider{
		EncryptedGHToken: encToken,
		tokenEndpoint:    tokenServer.URL + "/copilot_internal/v2/token",
	}

	_, err := provider.ListModels(context.Background())
	if err == nil {
		t.Fatal("expected error when token endpoint returns 401, got nil")
	}
	if !strings.Contains(err.Error(), "401") {
		t.Errorf("expected error to contain '401', got: %s", err.Error())
	}
}

func TestCopilotProvider_CopilotHeaders_OnTokenEndpoint(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-for-copilot-tests")
	copilotAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(copilotModelsPayload()))
	}))
	defer copilotAPI.Close()

	tokenServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify Copilot headers are sent on token endpoint too
		if got := r.Header.Get("Editor-Version"); got != "vscode/1.100.0" {
			t.Errorf("expected Editor-Version on token endpoint, got '%s'", got)
		}
		if got := r.Header.Get("Editor-Plugin-Version"); got != "copilot/1.300.0" {
			t.Errorf("expected Editor-Plugin-Version on token endpoint, got '%s'", got)
		}
		if got := r.Header.Get("User-Agent"); got != "GithubCopilot/1.300.0" {
			t.Errorf("expected User-Agent on token endpoint, got '%s'", got)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"token":      "tid=header-test",
			"expires_at": time.Now().Unix() + 3600,
			"endpoints":  map[string]string{"api": copilotAPI.URL},
		})
	}))
	defer tokenServer.Close()

	encToken := encryptTestToken(t, "ghp_header_check_token")

	copilotTokenCache.Range(func(key, value interface{}) bool {
		copilotTokenCache.Delete(key)
		return true
	})

	provider := &CopilotProvider{
		EncryptedGHToken: encToken,
		tokenEndpoint:    tokenServer.URL + "/copilot_internal/v2/token",
	}

	_, err := provider.ListModels(context.Background())
	if err != nil {
		t.Fatalf("ListModels returned error: %v", err)
	}
}
