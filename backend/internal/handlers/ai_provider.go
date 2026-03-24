package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// AIProvider defines the interface for AI model providers (OpenAI-compatible, Copilot, etc.)
type AIProvider interface {
	ListModels(ctx context.Context) ([]AIModel, error)
	Chat(ctx context.Context, req ChatRequest, w http.ResponseWriter) error
}

// AIModel represents a model available from a provider.
type AIModel struct {
	ID       string                 `json:"id"`
	Name     string                 `json:"name"`
	Vendor   string                 `json:"vendor"`
	Category string                 `json:"category"`
	Meta     map[string]interface{} `json:"meta,omitempty"`
}

// ChatRequest represents an incoming chat completion request.
type ChatRequest struct {
	Model    string            `json:"model"`
	Messages []json.RawMessage `json:"messages"`
	Tools    []json.RawMessage `json:"tools,omitempty"`
	Stream   bool              `json:"stream"`
}

// OpenAICompatibleProvider implements AIProvider for any OpenAI-compatible API
// (OpenAI, Ollama, OpenRouter, vLLM, LiteLLM, etc.)
type OpenAICompatibleProvider struct {
	BaseURL     string
	APIKey      string // empty for local providers like Ollama
	DisplayName string
}

// NewOpenAICompatibleProvider creates a new OpenAI-compatible provider.
func NewOpenAICompatibleProvider(baseURL, apiKey, displayName string) *OpenAICompatibleProvider {
	return &OpenAICompatibleProvider{
		BaseURL:     strings.TrimRight(baseURL, "/"),
		APIKey:      apiKey,
		DisplayName: displayName,
	}
}

// openAIModelsResponse is the upstream response from GET /models.
type openAIModelsResponse struct {
	Data []struct {
		ID      string `json:"id"`
		OwnedBy string `json:"owned_by"`
	} `json:"data"`
}

// ListModels fetches the model list from the upstream /models endpoint.
func (p *OpenAICompatibleProvider) ListModels(ctx context.Context) ([]AIModel, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", p.BaseURL+"/models", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	if p.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+p.APIKey)
	}

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to reach provider: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("provider returned %d: %s", resp.StatusCode, string(body))
	}

	var raw openAIModelsResponse
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("failed to decode models response: %w", err)
	}

	models := make([]AIModel, 0, len(raw.Data))
	for _, m := range raw.Data {
		models = append(models, AIModel{
			ID:     m.ID,
			Name:   m.ID,
			Vendor: m.OwnedBy,
		})
	}

	return models, nil
}

// Chat proxies a chat completion request to the upstream /chat/completions endpoint.
// For streaming requests, SSE chunks are flushed to w as they arrive.
// For non-streaming requests, the JSON body is copied directly.
func (p *OpenAICompatibleProvider) Chat(ctx context.Context, chatReq ChatRequest, w http.ResponseWriter) error {
	// Build upstream request body
	body := map[string]interface{}{
		"model":    chatReq.Model,
		"messages": chatReq.Messages,
		"stream":   chatReq.Stream,
	}
	if len(chatReq.Tools) > 0 {
		body["tools"] = chatReq.Tools
	}

	bodyJSON, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", p.BaseURL+"/chat/completions", strings.NewReader(string(bodyJSON)))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if p.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+p.APIKey)
	}

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to reach provider: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("provider returned %d: %s", resp.StatusCode, string(respBody))
	}

	if !chatReq.Stream {
		w.Header().Set("Content-Type", "application/json")
		io.Copy(w, resp.Body)
		return nil
	}

	// Stream SSE chunks back to client
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	flusher, canFlush := w.(http.Flusher)
	buf := make([]byte, 4096)
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			w.Write(buf[:n])
			if canFlush {
				flusher.Flush()
			}
		}
		if readErr != nil {
			break
		}
	}

	return nil
}
