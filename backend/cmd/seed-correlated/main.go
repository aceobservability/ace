package main

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	mrand "math/rand"
	"net/http"
	"time"
)

var (
	lokiURL  = flag.String("loki-url", "http://localhost:3100", "Loki push URL")
	tempoURL = flag.String("tempo-url", "http://localhost:3200", "Tempo OTLP HTTP URL")
	count    = flag.Int("count", 20, "Number of correlated trace+log pairs to generate")
)

var services = []string{"api-gateway", "user-service", "payment-service", "order-service", "notification-service"}
var endpoints = []string{"/api/users", "/api/orders", "/api/payments", "/api/health", "/api/products"}
var statusCodes = []int{200, 200, 200, 201, 400, 404, 500, 503}

func randomHex(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func generateTraceID() string { return randomHex(16) }
func generateSpanID() string  { return randomHex(8) }

func pushToTempo(tempoEndpoint, traceID, spanID, serviceName, endpoint string, durationMs int, statusCode int) error {
	now := time.Now()
	startNano := now.Add(-time.Duration(durationMs) * time.Millisecond).UnixNano()
	endNano := now.UnixNano()

	statusCodeVal := 1
	if statusCode >= 500 {
		statusCodeVal = 2
	}

	payload := map[string]interface{}{
		"resourceSpans": []map[string]interface{}{
			{
				"resource": map[string]interface{}{
					"attributes": []map[string]interface{}{
						{"key": "service.name", "value": map[string]string{"stringValue": serviceName}},
					},
				},
				"scopeSpans": []map[string]interface{}{
					{
						"spans": []map[string]interface{}{
							{
								"traceId":              traceID,
								"spanId":               spanID,
								"name":                 endpoint,
								"kind":                 2,
								"startTimeUnixNano":    fmt.Sprintf("%d", startNano),
								"endTimeUnixNano":      fmt.Sprintf("%d", endNano),
								"attributes": []map[string]interface{}{
									{"key": "http.method", "value": map[string]string{"stringValue": "GET"}},
									{"key": "http.url", "value": map[string]string{"stringValue": endpoint}},
									{"key": "http.status_code", "value": map[string]interface{}{"intValue": statusCode}},
								},
								"status": map[string]interface{}{
									"code": statusCodeVal,
								},
							},
						},
					},
				},
			},
		},
	}

	body, _ := json.Marshal(payload)
	resp, err := http.Post(tempoEndpoint+"/v1/traces", "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("tempo returned %d", resp.StatusCode)
	}
	return nil
}

func pushToLoki(lokiEndpoint, traceID, serviceName, endpoint string, statusCode int, durationMs int, level string) error {
	now := time.Now()

	logLine := fmt.Sprintf(`{"timestamp":"%s","level":"%s","service":"%s","trace_id":"%s","span_id":"%s","method":"GET","path":"%s","status":%d,"duration_ms":%d,"message":"%s"}`,
		now.Format(time.RFC3339Nano),
		level,
		serviceName,
		traceID,
		randomHex(8),
		endpoint,
		statusCode,
		durationMs,
		logMessage(level, endpoint, statusCode),
	)

	payload := map[string]interface{}{
		"streams": []map[string]interface{}{
			{
				"stream": map[string]string{
					"service":  serviceName,
					"level":    level,
					"trace_id": traceID,
				},
				"values": [][]string{
					{fmt.Sprintf("%d", now.UnixNano()), logLine},
				},
			},
		},
	}

	body, _ := json.Marshal(payload)
	resp, err := http.Post(lokiEndpoint+"/loki/api/v1/push", "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("loki returned %d", resp.StatusCode)
	}
	return nil
}

func logMessage(level, endpoint string, statusCode int) string {
	switch level {
	case "error":
		return fmt.Sprintf("Request to %s failed with status %d", endpoint, statusCode)
	case "warn":
		return fmt.Sprintf("Slow request to %s took longer than expected", endpoint)
	default:
		return fmt.Sprintf("Handled request to %s with status %d", endpoint, statusCode)
	}
}

func main() {
	flag.Parse()

	log.Printf("Generating %d correlated trace+log pairs...", *count)

	for i := 0; i < *count; i++ {
		traceID := generateTraceID()
		spanID := generateSpanID()
		svc := services[i%len(services)]
		ep := endpoints[i%len(endpoints)]
		status := statusCodes[mrand.Intn(len(statusCodes))]
		duration := 10 + mrand.Intn(990)
		level := "info"
		if status >= 500 {
			level = "error"
		} else if status >= 400 {
			level = "warn"
		}

		if err := pushToTempo(*tempoURL, traceID, spanID, svc, ep, duration, status); err != nil {
			log.Printf("Warning: failed to push trace %s: %v", traceID[:8], err)
		}

		if err := pushToLoki(*lokiURL, traceID, svc, ep, status, duration, level); err != nil {
			log.Printf("Warning: failed to push log for trace %s: %v", traceID[:8], err)
		}

		log.Printf("[%d/%d] trace_id=%s service=%s status=%d duration=%dms", i+1, *count, traceID[:16], svc, status, duration)

		time.Sleep(50 * time.Millisecond)
	}

	log.Printf("Done! Generated %d correlated trace+log pairs.", *count)
	log.Printf("In Ace: select your Loki datasource with trace_id_field=trace_id, link your Tempo datasource, then explore logs.")
}
