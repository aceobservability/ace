package datasource

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/aceobservability/ace/backend/internal/ssrf"
	"github.com/gorilla/websocket"
)

// LokiClient queries Loki using LogQL
type LokiClient struct {
	baseURL string
	client  *http.Client
}

func NewLokiClient(baseURL string) (*LokiClient, error) {
	return &LokiClient{
		baseURL: baseURL,
		client:  ssrf.DatasourceClient(30 * time.Second),
	}, nil
}

type lokiQueryResponse struct {
	Status string `json:"status"`
	Data   struct {
		ResultType string `json:"resultType"`
		Result     []struct {
			Stream map[string]string `json:"stream"`
			Values [][]string        `json:"values"` // [timestamp_ns, line]
		} `json:"result"`
	} `json:"data"`
	Error string `json:"error,omitempty"`
}

type lokiLabelsResponse struct {
	Status string   `json:"status"`
	Data   []string `json:"data"`
	Error  string   `json:"error,omitempty"`
}

type lokiTailResponse struct {
	Streams []struct {
		Stream map[string]string `json:"stream"`
		Values [][]string        `json:"values"`
	} `json:"streams"`
}

type lokiLabelValuesResponse struct {
	Status string   `json:"status"`
	Data   []string `json:"data"`
	Error  string   `json:"error,omitempty"`
}

func (c *LokiClient) Labels(ctx context.Context) ([]string, error) {
	reqURL := fmt.Sprintf("%s/loki/api/v1/labels", c.baseURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create labels request: %w", err)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to query Loki labels: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read labels response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("loki labels request failed with status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var labelsResp lokiLabelsResponse
	if err := json.Unmarshal(body, &labelsResp); err != nil {
		return nil, fmt.Errorf("failed to parse labels response: %w", err)
	}

	if labelsResp.Status != "success" {
		return nil, fmt.Errorf("loki labels request failed: %s", labelsResp.Error)
	}

	labels := make([]string, 0, len(labelsResp.Data))
	for _, label := range labelsResp.Data {
		trimmed := strings.TrimSpace(label)
		if trimmed == "" {
			continue
		}
		labels = append(labels, trimmed)
	}

	sort.Strings(labels)

	return labels, nil
}

func (c *LokiClient) LabelValues(ctx context.Context, labelName string) ([]string, error) {
	trimmedLabel := strings.TrimSpace(labelName)
	if trimmedLabel == "" {
		return nil, fmt.Errorf("label name is required")
	}

	reqURL := fmt.Sprintf("%s/loki/api/v1/label/%s/values", c.baseURL, url.PathEscape(trimmedLabel))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create label values request: %w", err)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to query Loki label values: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read label values response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("loki label values request failed with status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var valuesResp lokiLabelValuesResponse
	if err := json.Unmarshal(body, &valuesResp); err != nil {
		return nil, fmt.Errorf("failed to parse label values response: %w", err)
	}

	if valuesResp.Status != "success" {
		return nil, fmt.Errorf("loki label values request failed: %s", valuesResp.Error)
	}

	values := make([]string, 0, len(valuesResp.Data))
	for _, value := range valuesResp.Data {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		values = append(values, trimmed)
	}

	sort.Strings(values)

	return values, nil
}

func (c *LokiClient) Query(ctx context.Context, query string, start, end time.Time, step time.Duration, limit int) (*QueryResult, error) {
	params := url.Values{}
	params.Set("query", query)
	params.Set("start", strconv.FormatInt(start.UnixNano(), 10))
	params.Set("end", strconv.FormatInt(end.UnixNano(), 10))
	params.Set("direction", "backward")
	if limit > 0 {
		params.Set("limit", strconv.Itoa(limit))
	} else {
		params.Set("limit", "1000")
	}

	reqURL := fmt.Sprintf("%s/loki/api/v1/query_range?%s", c.baseURL, params.Encode())
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Cache-Control", "no-cache")

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to query Loki: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var lokiResp lokiQueryResponse
	if err := json.Unmarshal(body, &lokiResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	if lokiResp.Status != "success" {
		return &QueryResult{
			Status:     "error",
			Error:      lokiResp.Error,
			ResultType: "logs",
		}, nil
	}

	// Convert Loki streams to log entries
	logs := []LogEntry{}
	for _, stream := range lokiResp.Data.Result {
		for _, entry := range stream.Values {
			if len(entry) < 2 {
				continue
			}
			ts := entry[0]
			line := entry[1]

			// Parse nanosecond timestamp to RFC3339
			nsec, _ := strconv.ParseInt(ts, 10, 64)
			timestamp := time.Unix(0, nsec).UTC().Format(time.RFC3339Nano)

			// Try to detect log level from labels or line content
			level := detectLogLevel(stream.Stream, line)

			logs = append(logs, LogEntry{
				Timestamp: timestamp,
				Line:      line,
				Labels:    stream.Stream,
				Level:     level,
			})
		}
	}

	return &QueryResult{
		Status:     "success",
		ResultType: "logs",
		Data: &QueryData{
			ResultType: "streams",
			Logs:       logs,
		},
	}, nil
}

func (c *LokiClient) Stream(ctx context.Context, query string, start time.Time, limit int, onLog LogStreamCallback) error {
	if strings.TrimSpace(query) == "" {
		return fmt.Errorf("query is required")
	}
	if onLog == nil {
		return fmt.Errorf("stream callback is required")
	}

	params := url.Values{}
	params.Set("query", query)
	params.Set("delay_for", "1")
	if limit > 0 {
		params.Set("limit", strconv.Itoa(limit))
	} else {
		params.Set("limit", "200")
	}
	if !start.IsZero() {
		params.Set("start", strconv.FormatInt(start.UnixNano(), 10))
	}

	wsURL, err := toWebSocketURL(c.baseURL, "/loki/api/v1/tail", params)
	if err != nil {
		return err
	}

	dialer := *websocket.DefaultDialer
	dialer.NetDialContext = ssrf.DatasourceDialContext
	conn, _, err := dialer.DialContext(ctx, wsURL, nil)
	if err != nil {
		return fmt.Errorf("failed to connect to Loki tail endpoint: %w", err)
	}
	defer conn.Close()

	done := make(chan struct{})
	go func() {
		select {
		case <-ctx.Done():
			_ = conn.Close()
		case <-done:
		}
	}()
	defer close(done)

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				return nil
			}
			return fmt.Errorf("failed to read Loki tail response: %w", err)
		}

		var tailResp lokiTailResponse
		if err := json.Unmarshal(message, &tailResp); err != nil {
			continue
		}

		for _, stream := range tailResp.Streams {
			for _, entry := range stream.Values {
				if len(entry) < 2 {
					continue
				}

				nsec, err := strconv.ParseInt(entry[0], 10, 64)
				if err != nil {
					continue
				}

				logEntry := LogEntry{
					Timestamp: time.Unix(0, nsec).UTC().Format(time.RFC3339Nano),
					Line:      entry[1],
					Labels:    stream.Stream,
					Level:     detectLogLevel(stream.Stream, entry[1]),
				}

				if err := onLog(logEntry); err != nil {
					return err
				}
			}
		}
	}
}

func toWebSocketURL(baseURL, path string, params url.Values) (string, error) {
	parsedURL, err := url.Parse(baseURL)
	if err != nil {
		return "", fmt.Errorf("invalid Loki URL: %w", err)
	}

	switch parsedURL.Scheme {
	case "http":
		parsedURL.Scheme = "ws"
	case "https":
		parsedURL.Scheme = "wss"
	case "ws", "wss":
	default:
		return "", fmt.Errorf("unsupported Loki URL scheme: %s", parsedURL.Scheme)
	}

	parsedURL.Path = strings.TrimRight(parsedURL.Path, "/") + path
	parsedURL.RawQuery = params.Encode()

	return parsedURL.String(), nil
}

func detectLogLevel(labels map[string]string, line string) string {
	for _, key := range []string{"level", "lvl", "severity", "severity_text"} {
		if level, ok := labels[key]; ok {
			if normalized := normalizeLogLevel(level); normalized != "" {
				return normalized
			}
		}
	}

	if extracted := extractStructuredLogLevel(line); extracted != "" {
		return extracted
	}

	// Simple detection from line content
	lower := strings.ToLower(line)
	switch {
	case strings.Contains(lower, "error") || strings.Contains(lower, "err="):
		return "error"
	case strings.Contains(lower, "warn"):
		return "warning"
	case strings.Contains(lower, "info"):
		return "info"
	case strings.Contains(lower, "debug"):
		return "debug"
	default:
		return ""
	}
}

var structuredLevelPattern = regexp.MustCompile(`(?i)(?:^|[\s>\[(,])(?:level|lvl|severity|severity_text)=(?:"|')?(trace|debug|info|warn|warning|error|fatal|panic|critical)(?:\d+)?(?:"|')?(?:$|[\s,\])])`)

func extractStructuredLogLevel(line string) string {
	match := structuredLevelPattern.FindStringSubmatch(line)
	if len(match) < 2 {
		return ""
	}

	return normalizeLogLevel(match[1])
}

func normalizeLogLevel(level string) string {
	normalized := strings.ToLower(strings.TrimSpace(strings.Trim(level, `"'`)))
	if normalized == "" {
		return ""
	}

	switch {
	case strings.HasPrefix(normalized, "trace"):
		return "debug"
	case strings.HasPrefix(normalized, "debug") || normalized == "dbg":
		return "debug"
	case strings.HasPrefix(normalized, "info") || normalized == "information" || normalized == "inf":
		return "info"
	case strings.HasPrefix(normalized, "warn") || normalized == "wrn":
		return "warning"
	case strings.HasPrefix(normalized, "error") || normalized == "err":
		return "error"
	case strings.HasPrefix(normalized, "fatal") || strings.HasPrefix(normalized, "panic") || strings.HasPrefix(normalized, "critical") || normalized == "crit":
		return "error"
	case normalized == "unspecified" || normalized == "unknown" || normalized == "default":
		return ""
	default:
		return ""
	}
}
