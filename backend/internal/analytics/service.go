package analytics

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/mail"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/posthog/posthog-go"
)

const (
	defaultPostHogHost        = "https://us.i.posthog.com"
	defaultFeatureFlagTTL     = time.Minute
	defaultFeatureFlagTimeout = 3 * time.Second
	optOutHeader              = "X-Ace-Analytics-Opt-Out"
	optOutCookie              = "ace_analytics_opt_out"
)

type Config struct {
	APIKey         string
	Host           string
	Enabled        bool
	FeatureFlagTTL time.Duration
	RequestTimeout time.Duration
}

type Event struct {
	DistinctID string
	Name       string
	Properties map[string]any
	OptOut     bool
	Timestamp  time.Time
}

type FeatureFlagOptions struct {
	PersonProperties map[string]any
	Groups           map[string]string
	OptOut           bool
}

type Tracker interface {
	Track(ctx context.Context, event Event)
	FeatureEnabled(ctx context.Context, key, distinctID string, options FeatureFlagOptions) bool
	Close() error
}

type posthogClient interface {
	Enqueue(posthog.Message) error
	Close() error
}

type flagEvaluator interface {
	Evaluate(
		ctx context.Context,
		cfg Config,
		flagKey string,
		distinctID string,
		personProperties map[string]any,
		groups map[string]string,
	) (bool, error)
}

type Service struct {
	cfg       Config
	client    posthogClient
	evaluator flagEvaluator
	now       func() time.Time

	cacheMu sync.RWMutex
	cache   map[string]flagCacheEntry
}

type flagCacheEntry struct {
	value     bool
	expiresAt time.Time
}

type noopTracker struct{}

func (noopTracker) Track(context.Context, Event) {}

func (noopTracker) FeatureEnabled(context.Context, string, string, FeatureFlagOptions) bool {
	return false
}

func (noopTracker) Close() error { return nil }

var (
	globalMu      sync.RWMutex
	globalTracker Tracker = noopTracker{}
)

func SetGlobal(tracker Tracker) {
	globalMu.Lock()
	defer globalMu.Unlock()

	if tracker == nil {
		globalTracker = noopTracker{}
		return
	}

	globalTracker = tracker
}

func Global() Tracker {
	globalMu.RLock()
	defer globalMu.RUnlock()

	return globalTracker
}

func Track(ctx context.Context, event Event) {
	Global().Track(ctx, event)
}

func IsFeatureEnabled(ctx context.Context, key, distinctID string, options FeatureFlagOptions) bool {
	return Global().FeatureEnabled(ctx, key, distinctID, options)
}

func ConfigFromEnv() Config {
	apiKey := strings.TrimSpace(os.Getenv("POSTHOG_API_KEY"))
	host := strings.TrimSpace(os.Getenv("POSTHOG_HOST"))
	if host == "" {
		host = defaultPostHogHost
	}

	enabled := apiKey != ""
	if rawEnabled := strings.TrimSpace(os.Getenv("POSTHOG_ENABLED")); rawEnabled != "" {
		enabled = truthy(rawEnabled)
	}

	return Config{
		APIKey:         apiKey,
		Host:           host,
		Enabled:        enabled,
		FeatureFlagTTL: defaultFeatureFlagTTL,
		RequestTimeout: defaultFeatureFlagTimeout,
	}
}

func NewFromEnv() (*Service, error) {
	return New(ConfigFromEnv())
}

func New(cfg Config) (*Service, error) {
	if cfg.Host == "" {
		cfg.Host = defaultPostHogHost
	}
	if cfg.FeatureFlagTTL <= 0 {
		cfg.FeatureFlagTTL = defaultFeatureFlagTTL
	}
	if cfg.RequestTimeout <= 0 {
		cfg.RequestTimeout = defaultFeatureFlagTimeout
	}

	service := &Service{
		cfg:       cfg,
		evaluator: newDecideEvaluator(&http.Client{Timeout: cfg.RequestTimeout}),
		now:       time.Now,
		cache:     make(map[string]flagCacheEntry),
	}

	if !cfg.Enabled {
		return service, nil
	}
	if cfg.APIKey == "" {
		service.cfg.Enabled = false
		return service, errors.New("posthog enabled but POSTHOG_API_KEY is missing")
	}

	client, err := posthog.NewWithConfig(cfg.APIKey, posthog.Config{
		Endpoint: cfg.Host,
	})
	if err != nil {
		service.cfg.Enabled = false
		return service, fmt.Errorf("failed to initialize posthog client: %w", err)
	}

	service.client = client
	return service, nil
}

func (s *Service) Track(_ context.Context, event Event) {
	if !s.enabled() || event.OptOut {
		return
	}

	distinctID := strings.TrimSpace(event.DistinctID)
	if distinctID == "" {
		return
	}

	eventName := strings.TrimSpace(event.Name)
	if eventName == "" {
		return
	}

	props := posthog.NewProperties()
	for key, value := range sanitizeProperties(event.Properties) {
		props.Set(key, value)
	}

	message := posthog.Capture{
		DistinctId: distinctID,
		Event:      eventName,
		Properties: props,
	}
	if !event.Timestamp.IsZero() {
		message.Timestamp = event.Timestamp
	}

	if err := s.client.Enqueue(message); err != nil {
		// Graceful degradation: analytics failures must never impact API behavior.
		return
	}
}

func (s *Service) FeatureEnabled(
	ctx context.Context,
	key string,
	distinctID string,
	options FeatureFlagOptions,
) bool {
	if !s.enabled() || options.OptOut {
		return false
	}

	flagKey := strings.TrimSpace(key)
	if flagKey == "" {
		return false
	}

	cleanDistinctID := strings.TrimSpace(distinctID)
	if cleanDistinctID == "" {
		return false
	}

	cacheKey := buildCacheKey(flagKey, cleanDistinctID, options.Groups)
	if cached, ok := s.getCached(cacheKey); ok {
		return cached
	}

	value, err := s.evaluator.Evaluate(
		ctx,
		s.cfg,
		flagKey,
		cleanDistinctID,
		sanitizeProperties(options.PersonProperties),
		options.Groups,
	)
	if err != nil {
		return false
	}

	s.setCache(cacheKey, value)
	return value
}

func (s *Service) Close() error {
	if s.client == nil {
		return nil
	}

	return s.client.Close()
}

func (s *Service) enabled() bool {
	return s != nil && s.cfg.Enabled && s.client != nil
}

func (s *Service) getCached(key string) (bool, bool) {
	s.cacheMu.RLock()
	entry, ok := s.cache[key]
	s.cacheMu.RUnlock()
	if !ok {
		return false, false
	}

	if s.now().After(entry.expiresAt) {
		s.cacheMu.Lock()
		delete(s.cache, key)
		s.cacheMu.Unlock()
		return false, false
	}

	return entry.value, true
}

func (s *Service) setCache(key string, value bool) {
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()

	s.cache[key] = flagCacheEntry{
		value:     value,
		expiresAt: s.now().Add(s.cfg.FeatureFlagTTL),
	}
}

func RequestOptedOut(r *http.Request) bool {
	if r == nil {
		return false
	}

	if truthy(r.Header.Get(optOutHeader)) {
		return true
	}

	cookie, err := r.Cookie(optOutCookie)
	if err == nil && truthy(cookie.Value) {
		return true
	}

	return truthy(r.URL.Query().Get("analytics_opt_out"))
}

func sanitizeProperties(properties map[string]any) map[string]any {
	if len(properties) == 0 {
		return map[string]any{}
	}

	clean := make(map[string]any, len(properties))
	for key, value := range properties {
		clean[key] = sanitizeValue(key, value)
	}

	return clean
}

func sanitizeValue(key string, value any) any {
	if isSensitiveKey(key) {
		return "[REDACTED]"
	}

	switch typed := value.(type) {
	case map[string]any:
		nested := make(map[string]any, len(typed))
		for nestedKey, nestedValue := range typed {
			nested[nestedKey] = sanitizeValue(nestedKey, nestedValue)
		}
		return nested
	case []any:
		items := make([]any, 0, len(typed))
		for _, item := range typed {
			items = append(items, sanitizeValue(key, item))
		}
		return items
	case string:
		if shouldHashAsEmail(key, typed) {
			return hashValue(typed)
		}
		if strings.HasPrefix(strings.ToLower(strings.TrimSpace(typed)), "bearer ") {
			return "[REDACTED]"
		}
		return typed
	default:
		return value
	}
}

func shouldHashAsEmail(key, raw string) bool {
	if !strings.Contains(strings.ToLower(strings.TrimSpace(key)), "email") {
		return false
	}

	_, err := mail.ParseAddress(strings.TrimSpace(raw))
	return err == nil
}

func hashValue(value string) string {
	sum := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(value))))
	return hex.EncodeToString(sum[:])
}

func isSensitiveKey(key string) bool {
	lower := strings.ToLower(strings.TrimSpace(key))
	if lower == "" {
		return false
	}

	sensitiveParts := []string{
		"password",
		"secret",
		"token",
		"api_key",
		"apikey",
		"authorization",
		"credential",
		"private_key",
	}

	for _, part := range sensitiveParts {
		if strings.Contains(lower, part) {
			return true
		}
	}

	return false
}

func buildCacheKey(flagKey, distinctID string, groups map[string]string) string {
	if len(groups) == 0 {
		return flagKey + "|" + distinctID
	}

	keys := make([]string, 0, len(groups))
	for key := range groups {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, key+"="+groups[key])
	}

	return flagKey + "|" + distinctID + "|" + strings.Join(parts, ",")
}

func truthy(raw string) bool {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

type decideEvaluator struct {
	httpClient *http.Client
}

func newDecideEvaluator(httpClient *http.Client) flagEvaluator {
	return &decideEvaluator{httpClient: httpClient}
}

func (e *decideEvaluator) Evaluate(
	ctx context.Context,
	cfg Config,
	flagKey string,
	distinctID string,
	personProperties map[string]any,
	groups map[string]string,
) (bool, error) {
	body, err := json.Marshal(map[string]any{
		"api_key":           cfg.APIKey,
		"distinct_id":       distinctID,
		"person_properties": personProperties,
		"groups":            groups,
	})
	if err != nil {
		return false, err
	}

	endpoint := strings.TrimRight(cfg.Host, "/") + "/decide/?v=3"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return false, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := e.httpClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= http.StatusBadRequest {
		return false, fmt.Errorf("posthog decide request failed with status %d", resp.StatusCode)
	}

	var parsed struct {
		FeatureFlags map[string]any `json:"featureFlags"`
		LegacyFlags  map[string]any `json:"feature_flags"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return false, err
	}

	flags := parsed.FeatureFlags
	if flags == nil {
		flags = parsed.LegacyFlags
	}

	raw, ok := flags[flagKey]
	if !ok {
		return false, nil
	}

	switch value := raw.(type) {
	case bool:
		return value, nil
	case string:
		return strings.TrimSpace(value) != "", nil
	case float64:
		return value != 0, nil
	default:
		return false, nil
	}
}
