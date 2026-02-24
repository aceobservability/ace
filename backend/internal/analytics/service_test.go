package analytics

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/posthog/posthog-go"
)

type mockPostHogClient struct {
	messages   []posthog.Message
	enqueueErr error
	closed     bool
}

func (m *mockPostHogClient) Enqueue(message posthog.Message) error {
	if m.enqueueErr != nil {
		return m.enqueueErr
	}

	m.messages = append(m.messages, message)
	return nil
}

func (m *mockPostHogClient) Close() error {
	m.closed = true
	return nil
}

type mockFlagEvaluator struct {
	value bool
	err   error
	calls int
}

func (m *mockFlagEvaluator) Evaluate(
	_ context.Context,
	_ Config,
	_ string,
	_ string,
	_ map[string]any,
	_ map[string]string,
) (bool, error) {
	m.calls++
	if m.err != nil {
		return false, m.err
	}

	return m.value, nil
}

func TestTrackSanitizesProperties(t *testing.T) {
	client := &mockPostHogClient{}
	evaluator := &mockFlagEvaluator{}
	service := &Service{
		cfg:       Config{Enabled: true, FeatureFlagTTL: time.Minute},
		client:    client,
		evaluator: evaluator,
		now:       time.Now,
		cache:     make(map[string]flagCacheEntry),
	}

	service.Track(context.Background(), Event{
		DistinctID: "user-123",
		Name:       "auth_login",
		Properties: map[string]any{
			"email": "admin@example.com",
			"auth_config": map[string]any{
				"api_key": "super-secret",
			},
			"authorization": "Bearer abc",
			"plain":         "ok",
		},
	})

	if len(client.messages) != 1 {
		t.Fatalf("expected 1 event, got %d", len(client.messages))
	}

	capture, ok := client.messages[0].(posthog.Capture)
	if !ok {
		t.Fatalf("expected posthog.Capture message")
	}

	encoded, err := json.Marshal(capture.Properties)
	if err != nil {
		t.Fatalf("marshal properties: %v", err)
	}

	var props map[string]any
	if err := json.Unmarshal(encoded, &props); err != nil {
		t.Fatalf("unmarshal properties: %v", err)
	}

	if props["email"] != hashValue("admin@example.com") {
		t.Fatalf("expected hashed email, got %v", props["email"])
	}
	if props["authorization"] != "[REDACTED]" {
		t.Fatalf("expected redacted authorization, got %v", props["authorization"])
	}

	authConfig, ok := props["auth_config"].(map[string]any)
	if !ok {
		t.Fatalf("expected auth_config object")
	}
	if authConfig["api_key"] != "[REDACTED]" {
		t.Fatalf("expected redacted api_key, got %v", authConfig["api_key"])
	}
}

func TestTrackGracefulDegradationOnClientError(t *testing.T) {
	service := &Service{
		cfg: Config{Enabled: true, FeatureFlagTTL: time.Minute},
		client: &mockPostHogClient{
			enqueueErr: errors.New("boom"),
		},
		evaluator: &mockFlagEvaluator{},
		now:       time.Now,
		cache:     make(map[string]flagCacheEntry),
	}

	service.Track(context.Background(), Event{
		DistinctID: "user-123",
		Name:       "dashboard_viewed",
		Properties: map[string]any{"ok": true},
	})
}

func TestFeatureEnabledCachesValues(t *testing.T) {
	now := time.Now()
	evaluator := &mockFlagEvaluator{value: true}
	service := &Service{
		cfg:       Config{Enabled: true, FeatureFlagTTL: time.Minute},
		client:    &mockPostHogClient{},
		evaluator: evaluator,
		now: func() time.Time {
			return now
		},
		cache: make(map[string]flagCacheEntry),
	}

	first := service.FeatureEnabled(context.Background(), "new-dashboard-ui", "user-123", FeatureFlagOptions{})
	second := service.FeatureEnabled(context.Background(), "new-dashboard-ui", "user-123", FeatureFlagOptions{})

	if !first || !second {
		t.Fatalf("expected cached feature flag to be true")
	}
	if evaluator.calls != 1 {
		t.Fatalf("expected evaluator to be called once, got %d", evaluator.calls)
	}

	now = now.Add(2 * time.Minute)
	third := service.FeatureEnabled(context.Background(), "new-dashboard-ui", "user-123", FeatureFlagOptions{})
	if !third {
		t.Fatalf("expected evaluator after ttl to return true")
	}
	if evaluator.calls != 2 {
		t.Fatalf("expected evaluator to be called twice, got %d", evaluator.calls)
	}
}

func TestFeatureEnabledReturnsFalseWhenEvaluatorFails(t *testing.T) {
	service := &Service{
		cfg:       Config{Enabled: true, FeatureFlagTTL: time.Minute},
		client:    &mockPostHogClient{},
		evaluator: &mockFlagEvaluator{err: errors.New("request failed")},
		now:       time.Now,
		cache:     make(map[string]flagCacheEntry),
	}

	if service.FeatureEnabled(context.Background(), "rollout-a", "user-123", FeatureFlagOptions{}) {
		t.Fatalf("expected feature flag to be false when evaluator errors")
	}
}

func TestRequestOptedOut(t *testing.T) {
	t.Run("header", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "http://example.com", nil)
		req.Header.Set(optOutHeader, "true")
		if !RequestOptedOut(req) {
			t.Fatalf("expected opt out from header")
		}
	})

	t.Run("cookie", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "http://example.com", nil)
		req.AddCookie(&http.Cookie{Name: optOutCookie, Value: "1"})
		if !RequestOptedOut(req) {
			t.Fatalf("expected opt out from cookie")
		}
	})

	t.Run("query", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "http://example.com?analytics_opt_out=yes", nil)
		if !RequestOptedOut(req) {
			t.Fatalf("expected opt out from query")
		}
	})

	t.Run("default", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "http://example.com", nil)
		if RequestOptedOut(req) {
			t.Fatalf("expected no opt out by default")
		}
	})
}

func TestConfigFromEnv(t *testing.T) {
	t.Setenv("POSTHOG_API_KEY", "phc_test")
	t.Setenv("POSTHOG_HOST", "https://eu.i.posthog.com")
	t.Setenv("POSTHOG_ENABLED", "true")

	cfg := ConfigFromEnv()
	if cfg.APIKey != "phc_test" {
		t.Fatalf("unexpected api key: %s", cfg.APIKey)
	}
	if cfg.Host != "https://eu.i.posthog.com" {
		t.Fatalf("unexpected host: %s", cfg.Host)
	}
	if !cfg.Enabled {
		t.Fatalf("expected config to be enabled")
	}
}

func TestConfigFromEnvDisabledByDefaultWithoutKey(t *testing.T) {
	_ = os.Unsetenv("POSTHOG_API_KEY")
	t.Setenv("POSTHOG_HOST", "")
	t.Setenv("POSTHOG_ENABLED", "")

	cfg := ConfigFromEnv()
	if cfg.Enabled {
		t.Fatalf("expected config to be disabled without key")
	}
	if cfg.Host != defaultPostHogHost {
		t.Fatalf("expected default host, got %s", cfg.Host)
	}
}
