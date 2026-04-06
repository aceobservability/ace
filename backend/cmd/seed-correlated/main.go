package main

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math"
	mrand "math/rand"
	"net/http"
	"time"
)

var (
	otlpURL    = flag.String("otlp-url", "http://localhost:4318", "OTLP HTTP collector endpoint (receives traces, logs, and metrics)")
	count      = flag.Int("count", 100, "Number of request flows to simulate (batch mode only)")
	spread     = flag.Duration("spread", 30*time.Minute, "Spread generated data over this time window ending at now (batch mode only)")
	continuous = flag.Bool("continuous", false, "Run continuously, generating flows at --rate per second")
	rate       = flag.Float64("rate", 3, "Flows per second in continuous mode")
)

// ─── Service topology ────────────────────────────────────────────────────────

type serviceInfo struct {
	Name string
	Port int
}

var serviceList = []serviceInfo{
	{"api-gateway", 8080},
	{"user-service", 8081},
	{"order-service", 8082},
	{"payment-service", 8083},
	{"inventory-service", 8084},
	{"notification-service", 8085},
}

// ─── Request flow definitions ────────────────────────────────────────────────

type flowDef struct {
	Method      string
	Path        string
	Service     string // entry service (always api-gateway for external)
	Downstream  []spanDef
	SuccessRate float64 // 0.0 - 1.0
}

type spanDef struct {
	Service   string
	Operation string
	SpanKind  int // 1=internal, 2=server, 3=client
	IsDB      bool
	DBSystem  string // "postgresql", "redis", "mongodb"
	DBStmt    string
	MinMs     int
	MaxMs     int
	Children  []spanDef
}

var flows = []flowDef{
	{
		Method: "GET", Path: "/api/v1/users/me", Service: "api-gateway", SuccessRate: 0.96,
		Downstream: []spanDef{
			{Service: "user-service", Operation: "GET /api/v1/users/:id", SpanKind: 2, MinMs: 5, MaxMs: 30, Children: []spanDef{
				{Service: "user-service", Operation: "redis GET user:session", SpanKind: 3, IsDB: true, DBSystem: "redis", DBStmt: "GET user:session:{id}", MinMs: 1, MaxMs: 5},
				{Service: "user-service", Operation: "pg SELECT users", SpanKind: 3, IsDB: true, DBSystem: "postgresql", DBStmt: "SELECT id, email, name, avatar_url FROM users WHERE id = $1", MinMs: 2, MaxMs: 15},
			}},
		},
	},
	{
		Method: "POST", Path: "/api/v1/auth/login", Service: "api-gateway", SuccessRate: 0.88,
		Downstream: []spanDef{
			{Service: "user-service", Operation: "POST /api/v1/auth/login", SpanKind: 2, MinMs: 15, MaxMs: 80, Children: []spanDef{
				{Service: "user-service", Operation: "pg SELECT users by email", SpanKind: 3, IsDB: true, DBSystem: "postgresql", DBStmt: "SELECT id, password_hash FROM users WHERE email = $1", MinMs: 2, MaxMs: 10},
				{Service: "user-service", Operation: "bcrypt compare", SpanKind: 1, MinMs: 40, MaxMs: 120},
				{Service: "user-service", Operation: "redis SET session", SpanKind: 3, IsDB: true, DBSystem: "redis", DBStmt: "SET session:{id} {token} EX 86400", MinMs: 1, MaxMs: 4},
			}},
		},
	},
	{
		Method: "GET", Path: "/api/v1/orders", Service: "api-gateway", SuccessRate: 0.97,
		Downstream: []spanDef{
			{Service: "order-service", Operation: "GET /api/v1/orders", SpanKind: 2, MinMs: 10, MaxMs: 60, Children: []spanDef{
				{Service: "order-service", Operation: "pg SELECT orders", SpanKind: 3, IsDB: true, DBSystem: "postgresql", DBStmt: "SELECT o.*, oi.* FROM orders o JOIN order_items oi ON o.id = oi.order_id WHERE o.user_id = $1 ORDER BY o.created_at DESC LIMIT 20", MinMs: 5, MaxMs: 40},
			}},
		},
	},
	{
		Method: "POST", Path: "/api/v1/orders", Service: "api-gateway", SuccessRate: 0.92,
		Downstream: []spanDef{
			{Service: "order-service", Operation: "POST /api/v1/orders", SpanKind: 2, MinMs: 20, MaxMs: 150, Children: []spanDef{
				{Service: "inventory-service", Operation: "POST /api/v1/inventory/reserve", SpanKind: 2, MinMs: 5, MaxMs: 25, Children: []spanDef{
					{Service: "inventory-service", Operation: "pg UPDATE stock", SpanKind: 3, IsDB: true, DBSystem: "postgresql", DBStmt: "UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1", MinMs: 3, MaxMs: 20},
				}},
				{Service: "order-service", Operation: "pg INSERT orders", SpanKind: 3, IsDB: true, DBSystem: "postgresql", DBStmt: "INSERT INTO orders (user_id, total, status) VALUES ($1, $2, 'pending') RETURNING id", MinMs: 3, MaxMs: 15},
				{Service: "payment-service", Operation: "POST /api/v1/payments/charge", SpanKind: 2, MinMs: 50, MaxMs: 300, Children: []spanDef{
					{Service: "payment-service", Operation: "HTTP POST stripe.com/v1/charges", SpanKind: 3, MinMs: 80, MaxMs: 500},
					{Service: "payment-service", Operation: "pg INSERT payments", SpanKind: 3, IsDB: true, DBSystem: "postgresql", DBStmt: "INSERT INTO payments (order_id, amount, stripe_id, status) VALUES ($1, $2, $3, 'completed')", MinMs: 2, MaxMs: 10},
				}},
				{Service: "notification-service", Operation: "POST /api/v1/notifications/send", SpanKind: 2, MinMs: 5, MaxMs: 20, Children: []spanDef{
					{Service: "notification-service", Operation: "redis PUBLISH notifications", SpanKind: 3, IsDB: true, DBSystem: "redis", DBStmt: "PUBLISH notifications {json}", MinMs: 1, MaxMs: 3},
				}},
			}},
		},
	},
	{
		Method: "GET", Path: "/api/v1/products", Service: "api-gateway", SuccessRate: 0.99,
		Downstream: []spanDef{
			{Service: "inventory-service", Operation: "GET /api/v1/products", SpanKind: 2, MinMs: 5, MaxMs: 35, Children: []spanDef{
				{Service: "inventory-service", Operation: "redis GET products:catalog", SpanKind: 3, IsDB: true, DBSystem: "redis", DBStmt: "GET products:catalog:page:{n}", MinMs: 1, MaxMs: 3},
				{Service: "inventory-service", Operation: "pg SELECT products", SpanKind: 3, IsDB: true, DBSystem: "postgresql", DBStmt: "SELECT id, name, price, stock, category FROM products WHERE active = true ORDER BY name LIMIT 50 OFFSET $1", MinMs: 3, MaxMs: 25},
			}},
		},
	},
	{
		Method: "GET", Path: "/api/v1/products/42", Service: "api-gateway", SuccessRate: 0.95,
		Downstream: []spanDef{
			{Service: "inventory-service", Operation: "GET /api/v1/products/:id", SpanKind: 2, MinMs: 3, MaxMs: 20, Children: []spanDef{
				{Service: "inventory-service", Operation: "redis GET product:42", SpanKind: 3, IsDB: true, DBSystem: "redis", DBStmt: "GET product:{id}", MinMs: 1, MaxMs: 3},
				{Service: "inventory-service", Operation: "pg SELECT product", SpanKind: 3, IsDB: true, DBSystem: "postgresql", DBStmt: "SELECT * FROM products WHERE id = $1", MinMs: 2, MaxMs: 12},
			}},
		},
	},
	{
		Method: "POST", Path: "/api/v1/payments/refund", Service: "api-gateway", SuccessRate: 0.90,
		Downstream: []spanDef{
			{Service: "payment-service", Operation: "POST /api/v1/payments/refund", SpanKind: 2, MinMs: 30, MaxMs: 200, Children: []spanDef{
				{Service: "payment-service", Operation: "pg SELECT payment", SpanKind: 3, IsDB: true, DBSystem: "postgresql", DBStmt: "SELECT * FROM payments WHERE id = $1 AND status = 'completed'", MinMs: 2, MaxMs: 8},
				{Service: "payment-service", Operation: "HTTP POST stripe.com/v1/refunds", SpanKind: 3, MinMs: 100, MaxMs: 600},
				{Service: "payment-service", Operation: "pg UPDATE payment status", SpanKind: 3, IsDB: true, DBSystem: "postgresql", DBStmt: "UPDATE payments SET status = 'refunded', refunded_at = NOW() WHERE id = $1", MinMs: 2, MaxMs: 10},
				{Service: "notification-service", Operation: "POST /api/v1/notifications/send", SpanKind: 2, MinMs: 5, MaxMs: 15, Children: []spanDef{
					{Service: "notification-service", Operation: "redis PUBLISH notifications", SpanKind: 3, IsDB: true, DBSystem: "redis", DBStmt: "PUBLISH notifications {json}", MinMs: 1, MaxMs: 3},
				}},
			}},
		},
	},
	{
		Method: "GET", Path: "/api/v1/health", Service: "api-gateway", SuccessRate: 0.999,
		Downstream: []spanDef{
			{Service: "api-gateway", Operation: "health check", SpanKind: 1, MinMs: 1, MaxMs: 5, Children: []spanDef{
				{Service: "api-gateway", Operation: "pg SELECT 1", SpanKind: 3, IsDB: true, DBSystem: "postgresql", DBStmt: "SELECT 1", MinMs: 1, MaxMs: 3},
				{Service: "api-gateway", Operation: "redis PING", SpanKind: 3, IsDB: true, DBSystem: "redis", DBStmt: "PING", MinMs: 1, MaxMs: 2},
			}},
		},
	},
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func randomHex(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func generateTraceID() string { return randomHex(16) }
func generateSpanID() string  { return randomHex(8) }

func randBetween(min, max int) int {
	if max <= min {
		return min
	}
	return min + mrand.Intn(max-min)
}

// ─── Span builder ────────────────────────────────────────────────────────────

type builtSpan struct {
	TraceID    string
	SpanID     string
	ParentID   string
	Service    string
	Operation  string
	SpanKind   int
	StartNano  int64
	EndNano    int64
	StatusCode int // OTLP: 0=unset, 1=ok, 2=error
	Attributes []attr
}

type attr struct {
	Key   string
	Value interface{} // string or int64
}

func buildSpans(def spanDef, traceID, parentSpanID string, startTime time.Time, isError bool) []builtSpan {
	spanID := generateSpanID()
	durationMs := randBetween(def.MinMs, def.MaxMs)
	if isError {
		durationMs = randBetween(def.MaxMs, def.MaxMs*3) // errors tend to be slower
	}

	start := startTime
	end := start.Add(time.Duration(durationMs) * time.Millisecond)

	attrs := []attr{}
	if def.IsDB {
		attrs = append(attrs, attr{"db.system", def.DBSystem})
		attrs = append(attrs, attr{"db.statement", def.DBStmt})
	}

	statusCode := 0
	if isError && len(def.Children) == 0 {
		// Leaf spans carry the error
		statusCode = 2
	}

	span := builtSpan{
		TraceID:    traceID,
		SpanID:     spanID,
		ParentID:   parentSpanID,
		Service:    def.Service,
		Operation:  def.Operation,
		SpanKind:   def.SpanKind,
		StartNano:  start.UnixNano(),
		EndNano:    end.UnixNano(),
		StatusCode: statusCode,
		Attributes: attrs,
	}

	result := []builtSpan{span}

	// Build children sequentially within parent's time range
	childStart := start.Add(time.Duration(mrand.Intn(2)+1) * time.Millisecond)
	for _, child := range def.Children {
		childSpans := buildSpans(child, traceID, spanID, childStart, isError)
		result = append(result, childSpans...)
		if len(childSpans) > 0 {
			// Next child starts after previous child ends
			lastEnd := time.Unix(0, childSpans[0].EndNano)
			childStart = lastEnd.Add(time.Duration(mrand.Intn(2)+1) * time.Millisecond)
		}
	}

	return result
}

// ─── OTLP trace push ─────────────────────────────────────────────────────────

func pushTraces(endpoint string, spans []builtSpan, flow flowDef, statusCode int) error {
	// Group spans by service
	byService := map[string][]builtSpan{}
	for _, s := range spans {
		byService[s.Service] = append(byService[s.Service], s)
	}

	resourceSpans := []map[string]interface{}{}
	for svc, svcSpans := range byService {
		otlpSpans := []map[string]interface{}{}
		for _, s := range svcSpans {
			attrs := []map[string]interface{}{}
			for _, a := range s.Attributes {
				switch v := a.Value.(type) {
				case string:
					attrs = append(attrs, map[string]interface{}{"key": a.Key, "value": map[string]interface{}{"stringValue": v}})
				case int64:
					attrs = append(attrs, map[string]interface{}{"key": a.Key, "value": map[string]interface{}{"intValue": fmt.Sprintf("%d", v)}})
				case int:
					attrs = append(attrs, map[string]interface{}{"key": a.Key, "value": map[string]interface{}{"intValue": fmt.Sprintf("%d", v)}})
				}
			}

			span := map[string]interface{}{
				"traceId":           s.TraceID,
				"spanId":            s.SpanID,
				"name":              s.Operation,
				"kind":              s.SpanKind,
				"startTimeUnixNano": fmt.Sprintf("%d", s.StartNano),
				"endTimeUnixNano":   fmt.Sprintf("%d", s.EndNano),
				"attributes":        attrs,
				"status":            map[string]interface{}{"code": s.StatusCode},
			}
			if s.ParentID != "" {
				span["parentSpanId"] = s.ParentID
			}
			otlpSpans = append(otlpSpans, span)
		}

		resourceSpans = append(resourceSpans, map[string]interface{}{
			"resource": map[string]interface{}{
				"attributes": []map[string]interface{}{
					{"key": "service.name", "value": map[string]interface{}{"stringValue": svc}},
					{"key": "service.version", "value": map[string]interface{}{"stringValue": "1.4.2"}},
					{"key": "deployment.environment", "value": map[string]interface{}{"stringValue": "production"}},
				},
			},
			"scopeSpans": []map[string]interface{}{
				{
					"scope": map[string]interface{}{"name": "ace-telemetrygen", "version": "1.0.0"},
					"spans": otlpSpans,
				},
			},
		})
	}

	payload := map[string]interface{}{"resourceSpans": resourceSpans}
	return postJSON(endpoint+"/v1/traces", payload)
}

// ─── OTLP log push ──────────────────────────────────────────────────────────

type logEntry struct {
	Timestamp  time.Time
	Service    string
	TraceID    string
	SpanID     string
	Level      string // INFO, WARN, ERROR
	Message    string
	Attributes map[string]interface{}
}

func generateLogs(spans []builtSpan, flow flowDef, statusCode int, isError bool) []logEntry {
	var logs []logEntry
	rootSpan := spans[0]
	ts := time.Unix(0, rootSpan.StartNano)
	totalDurationMs := (rootSpan.EndNano - rootSpan.StartNano) / 1e6

	// Access log from the gateway
	logs = append(logs, logEntry{
		Timestamp: ts,
		Service:   flow.Service,
		TraceID:   rootSpan.TraceID,
		SpanID:    rootSpan.SpanID,
		Level:     "INFO",
		Message:   fmt.Sprintf("%s %s %d %dms", flow.Method, flow.Path, statusCode, totalDurationMs),
		Attributes: map[string]interface{}{
			"http.method":      flow.Method,
			"http.path":        flow.Path,
			"http.status_code": statusCode,
			"duration_ms":      totalDurationMs,
			"client_ip":        randomIP(),
			"user_agent":       randomUserAgent(),
		},
	})

	// DB query logs for each DB span
	for _, s := range spans {
		if !hasAttr(s.Attributes, "db.system") {
			continue
		}
		spanTs := time.Unix(0, s.StartNano)
		durationMs := (s.EndNano - s.StartNano) / 1e6

		dbSystem := getStringAttr(s.Attributes, "db.system")
		dbStmt := getStringAttr(s.Attributes, "db.statement")

		level := "DEBUG"
		msg := fmt.Sprintf("[%s] %s (%dms)", dbSystem, truncate(dbStmt, 80), durationMs)
		if durationMs > 100 {
			level = "WARN"
			msg = fmt.Sprintf("Slow query [%s] %s (%dms)", dbSystem, truncate(dbStmt, 80), durationMs)
		}

		logs = append(logs, logEntry{
			Timestamp: spanTs.Add(time.Duration(durationMs) * time.Millisecond),
			Service:   s.Service,
			TraceID:   s.TraceID,
			SpanID:    s.SpanID,
			Level:     level,
			Message:   msg,
			Attributes: map[string]interface{}{
				"db.system":    dbSystem,
				"db.statement": dbStmt,
				"duration_ms":  durationMs,
			},
		})
	}

	// Error log if request failed
	if isError {
		errService := spans[0].Service
		// Find the deepest errored span
		for _, s := range spans {
			if s.StatusCode == 2 {
				errService = s.Service
			}
		}
		logs = append(logs, logEntry{
			Timestamp: ts.Add(time.Duration(totalDurationMs) * time.Millisecond),
			Service:   errService,
			TraceID:   rootSpan.TraceID,
			SpanID:    rootSpan.SpanID,
			Level:     "ERROR",
			Message:   errorMessage(flow.Method, flow.Path, statusCode),
			Attributes: map[string]interface{}{
				"http.method":      flow.Method,
				"http.path":        flow.Path,
				"http.status_code": statusCode,
				"error.type":       errorType(statusCode),
			},
		})
	}

	return logs
}

func pushLogs(endpoint string, logs []logEntry) error {
	// Group by service
	byService := map[string][]logEntry{}
	for _, l := range logs {
		byService[l.Service] = append(byService[l.Service], l)
	}

	resourceLogs := []map[string]interface{}{}
	for svc, entries := range byService {
		logRecords := []map[string]interface{}{}
		for _, l := range entries {
			severityNumber := severityNum(l.Level)
			attrs := []map[string]interface{}{}
			for k, v := range l.Attributes {
				switch val := v.(type) {
				case string:
					attrs = append(attrs, map[string]interface{}{"key": k, "value": map[string]interface{}{"stringValue": val}})
				case int, int64:
					attrs = append(attrs, map[string]interface{}{"key": k, "value": map[string]interface{}{"intValue": fmt.Sprintf("%v", val)}})
				case float64:
					attrs = append(attrs, map[string]interface{}{"key": k, "value": map[string]interface{}{"doubleValue": val}})
				}
			}

			logRecords = append(logRecords, map[string]interface{}{
				"timeUnixNano":         fmt.Sprintf("%d", l.Timestamp.UnixNano()),
				"observedTimeUnixNano": fmt.Sprintf("%d", l.Timestamp.UnixNano()),
				"severityNumber":       severityNumber,
				"severityText":         l.Level,
				"body":                 map[string]interface{}{"stringValue": l.Message},
				"attributes":           attrs,
				"traceId":              l.TraceID,
				"spanId":               l.SpanID,
			})
		}

		resourceLogs = append(resourceLogs, map[string]interface{}{
			"resource": map[string]interface{}{
				"attributes": []map[string]interface{}{
					{"key": "service.name", "value": map[string]interface{}{"stringValue": svc}},
					{"key": "service.version", "value": map[string]interface{}{"stringValue": "1.4.2"}},
					{"key": "deployment.environment", "value": map[string]interface{}{"stringValue": "production"}},
				},
			},
			"scopeLogs": []map[string]interface{}{
				{
					"scope":      map[string]interface{}{"name": "ace-telemetrygen", "version": "1.0.0"},
					"logRecords": logRecords,
				},
			},
		})
	}

	payload := map[string]interface{}{"resourceLogs": resourceLogs}
	return postJSON(endpoint+"/v1/logs", payload)
}

// ─── OTLP metrics push ──────────────────────────────────────────────────────

type metricAccumulator struct {
	// Per-service request counters: service -> method+path+status -> count
	requestCounts map[string]map[string]int
	// Per-service duration samples: service -> []duration_ms
	durations map[string][]float64
	// Per-service DB duration samples: service -> db_system -> []duration_ms
	dbDurations map[string]map[string][]float64
	// Per-service error counts: service -> count
	errorCounts map[string]int
	// Timestamp for this batch
	timestamp time.Time
}

func newMetricAccumulator(ts time.Time) *metricAccumulator {
	return &metricAccumulator{
		requestCounts: map[string]map[string]int{},
		durations:     map[string][]float64{},
		dbDurations:   map[string]map[string][]float64{},
		errorCounts:   map[string]int{},
		timestamp:     ts,
	}
}

func (m *metricAccumulator) record(flow flowDef, spans []builtSpan, statusCode int, isError bool) {
	rootDuration := float64(spans[0].EndNano-spans[0].StartNano) / 1e6

	// Request count
	key := fmt.Sprintf("%s|%s|%d", flow.Method, flow.Path, statusCode)
	if m.requestCounts[flow.Service] == nil {
		m.requestCounts[flow.Service] = map[string]int{}
	}
	m.requestCounts[flow.Service][key]++

	// Duration
	m.durations[flow.Service] = append(m.durations[flow.Service], rootDuration)

	// Error count
	if isError {
		m.errorCounts[flow.Service]++
	}

	// DB durations
	for _, s := range spans {
		if hasAttr(s.Attributes, "db.system") {
			dbSys := getStringAttr(s.Attributes, "db.system")
			dur := float64(s.EndNano-s.StartNano) / 1e6
			if m.dbDurations[s.Service] == nil {
				m.dbDurations[s.Service] = map[string][]float64{}
			}
			m.dbDurations[s.Service][dbSys] = append(m.dbDurations[s.Service][dbSys], dur)
		}
	}
}

func pushMetrics(endpoint string, acc *metricAccumulator) error {
	tsNano := fmt.Sprintf("%d", acc.timestamp.UnixNano())
	startNano := fmt.Sprintf("%d", acc.timestamp.Add(-1*time.Minute).UnixNano())

	resourceMetrics := []map[string]interface{}{}

	allServices := map[string]bool{}
	for _, si := range serviceList {
		allServices[si.Name] = true
	}

	for svc := range allServices {
		metrics := []map[string]interface{}{}

		// --- http_server_requests_total (sum) ---
		if counts, ok := acc.requestCounts[svc]; ok {
			dataPoints := []map[string]interface{}{}
			for key, cnt := range counts {
				// Parse method|path|status
				var method, path string
				var status int
				fmt.Sscanf(key, "%[^|]|%[^|]|%d", &method, &path, &status)
				dataPoints = append(dataPoints, map[string]interface{}{
					"startTimeUnixNano": startNano,
					"timeUnixNano":      tsNano,
					"asInt":             fmt.Sprintf("%d", cnt),
					"attributes": []map[string]interface{}{
						{"key": "http.request.method", "value": map[string]interface{}{"stringValue": method}},
						{"key": "url.path", "value": map[string]interface{}{"stringValue": path}},
						{"key": "http.response.status_code", "value": map[string]interface{}{"intValue": fmt.Sprintf("%d", status)}},
					},
				})
			}
			metrics = append(metrics, map[string]interface{}{
				"name":        "http.server.requests",
				"description": "Total number of HTTP requests",
				"unit":        "{request}",
				"sum": map[string]interface{}{
					"dataPoints":             dataPoints,
					"aggregationTemporality": 2, // CUMULATIVE
					"isMonotonic":            true,
				},
			})
		}

		// --- http_server_request_duration_seconds (histogram) ---
		if durs, ok := acc.durations[svc]; ok && len(durs) > 0 {
			bounds := []float64{5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000}
			bucketCounts := make([]interface{}, len(bounds)+1)
			for i := range bucketCounts {
				bucketCounts[i] = "0"
			}
			var sum float64
			for _, d := range durs {
				sum += d
				placed := false
				for i, b := range bounds {
					if d <= b {
						n := 0
						fmt.Sscanf(bucketCounts[i].(string), "%d", &n)
						bucketCounts[i] = fmt.Sprintf("%d", n+1)
						placed = true
						break
					}
				}
				if !placed {
					n := 0
					fmt.Sscanf(bucketCounts[len(bounds)].(string), "%d", &n)
					bucketCounts[len(bounds)] = fmt.Sprintf("%d", n+1)
				}
			}
			explicitBounds := make([]interface{}, len(bounds))
			for i, b := range bounds {
				explicitBounds[i] = b
			}
			metrics = append(metrics, map[string]interface{}{
				"name":        "http.server.request.duration",
				"description": "Duration of HTTP server requests",
				"unit":        "ms",
				"histogram": map[string]interface{}{
					"dataPoints": []map[string]interface{}{
						{
							"startTimeUnixNano": startNano,
							"timeUnixNano":      tsNano,
							"count":             fmt.Sprintf("%d", len(durs)),
							"sum":               sum,
							"bucketCounts":      bucketCounts,
							"explicitBounds":    explicitBounds,
						},
					},
					"aggregationTemporality": 2,
				},
			})

			// --- Response time percentiles as gauges (p50, p95, p99) ---
			sortedDurs := make([]float64, len(durs))
			copy(sortedDurs, durs)
			sortFloat64s(sortedDurs)
			for _, pct := range []struct {
				name  string
				index float64
			}{
				{"http.server.request.duration.p50", 0.50},
				{"http.server.request.duration.p95", 0.95},
				{"http.server.request.duration.p99", 0.99},
			} {
				idx := int(math.Ceil(pct.index*float64(len(sortedDurs)))) - 1
				if idx < 0 {
					idx = 0
				}
				metrics = append(metrics, map[string]interface{}{
					"name": pct.name,
					"unit": "ms",
					"gauge": map[string]interface{}{
						"dataPoints": []map[string]interface{}{
							{
								"timeUnixNano": tsNano,
								"asDouble":     sortedDurs[idx],
							},
						},
					},
				})
			}
		}

		// --- db.client.operation.duration (histogram) ---
		if dbDurs, ok := acc.dbDurations[svc]; ok {
			for dbSys, durs := range dbDurs {
				if len(durs) == 0 {
					continue
				}
				bounds := []float64{1, 2, 5, 10, 25, 50, 100, 250}
				bucketCounts := make([]interface{}, len(bounds)+1)
				for i := range bucketCounts {
					bucketCounts[i] = "0"
				}
				var sum float64
				for _, d := range durs {
					sum += d
					placed := false
					for i, b := range bounds {
						if d <= b {
							n := 0
							fmt.Sscanf(bucketCounts[i].(string), "%d", &n)
							bucketCounts[i] = fmt.Sprintf("%d", n+1)
							placed = true
							break
						}
					}
					if !placed {
						n := 0
						fmt.Sscanf(bucketCounts[len(bounds)].(string), "%d", &n)
						bucketCounts[len(bounds)] = fmt.Sprintf("%d", n+1)
					}
				}
				explicitBounds := make([]interface{}, len(bounds))
				for i, b := range bounds {
					explicitBounds[i] = b
				}
				metrics = append(metrics, map[string]interface{}{
					"name":        "db.client.operation.duration",
					"description": "Duration of database client operations",
					"unit":        "ms",
					"histogram": map[string]interface{}{
						"dataPoints": []map[string]interface{}{
							{
								"startTimeUnixNano": startNano,
								"timeUnixNano":      tsNano,
								"count":             fmt.Sprintf("%d", len(durs)),
								"sum":               sum,
								"bucketCounts":      bucketCounts,
								"explicitBounds":    explicitBounds,
								"attributes": []map[string]interface{}{
									{"key": "db.system", "value": map[string]interface{}{"stringValue": dbSys}},
								},
							},
						},
						"aggregationTemporality": 2,
					},
				})
			}
		}

		// --- System metrics (synthetic gauges) ---
		cpuBase := 0.15 + mrand.Float64()*0.25 // 15-40% base CPU
		memBase := 128 + mrand.Float64()*384   // 128-512 MB base memory
		// Add some variance per service
		svcHash := float64(len(svc)%5) * 0.05

		metrics = append(metrics,
			map[string]interface{}{
				"name":        "system.cpu.utilization",
				"description": "CPU utilization as a fraction",
				"unit":        "1",
				"gauge": map[string]interface{}{
					"dataPoints": []map[string]interface{}{
						{
							"timeUnixNano": tsNano,
							"asDouble":     math.Min(1.0, cpuBase+svcHash+mrand.Float64()*0.1),
						},
					},
				},
			},
			map[string]interface{}{
				"name":        "process.runtime.memory.bytes",
				"description": "Process memory usage in bytes",
				"unit":        "By",
				"gauge": map[string]interface{}{
					"dataPoints": []map[string]interface{}{
						{
							"timeUnixNano": tsNano,
							"asDouble":     (memBase + float64(len(svc)%3)*64 + mrand.Float64()*32) * 1024 * 1024,
						},
					},
				},
			},
			map[string]interface{}{
				"name":        "process.runtime.goroutines",
				"description": "Number of active goroutines",
				"unit":        "{goroutine}",
				"gauge": map[string]interface{}{
					"dataPoints": []map[string]interface{}{
						{
							"timeUnixNano": tsNano,
							"asInt":        fmt.Sprintf("%d", 20+mrand.Intn(180)),
						},
					},
				},
			},
			map[string]interface{}{
				"name":        "db.pool.active_connections",
				"description": "Number of active database connections",
				"unit":        "{connection}",
				"gauge": map[string]interface{}{
					"dataPoints": []map[string]interface{}{
						{
							"timeUnixNano": tsNano,
							"asInt":        fmt.Sprintf("%d", 2+mrand.Intn(18)),
							"attributes": []map[string]interface{}{
								{"key": "db.system", "value": map[string]interface{}{"stringValue": "postgresql"}},
							},
						},
					},
				},
			},
			map[string]interface{}{
				"name":        "db.pool.idle_connections",
				"description": "Number of idle database connections",
				"unit":        "{connection}",
				"gauge": map[string]interface{}{
					"dataPoints": []map[string]interface{}{
						{
							"timeUnixNano": tsNano,
							"asInt":        fmt.Sprintf("%d", 5+mrand.Intn(15)),
							"attributes": []map[string]interface{}{
								{"key": "db.system", "value": map[string]interface{}{"stringValue": "postgresql"}},
							},
						},
					},
				},
			},
			map[string]interface{}{
				"name":        "http.server.active_requests",
				"description": "Number of currently active HTTP requests",
				"unit":        "{request}",
				"gauge": map[string]interface{}{
					"dataPoints": []map[string]interface{}{
						{
							"timeUnixNano": tsNano,
							"asInt":        fmt.Sprintf("%d", mrand.Intn(50)),
						},
					},
				},
			},
		)

		// --- Error count ---
		if errCount, ok := acc.errorCounts[svc]; ok && errCount > 0 {
			metrics = append(metrics, map[string]interface{}{
				"name":        "http.server.errors",
				"description": "Total number of HTTP server errors (5xx)",
				"unit":        "{error}",
				"sum": map[string]interface{}{
					"dataPoints": []map[string]interface{}{
						{
							"startTimeUnixNano": startNano,
							"timeUnixNano":      tsNano,
							"asInt":             fmt.Sprintf("%d", errCount),
						},
					},
					"aggregationTemporality": 2,
					"isMonotonic":            true,
				},
			})
		}

		resourceMetrics = append(resourceMetrics, map[string]interface{}{
			"resource": map[string]interface{}{
				"attributes": []map[string]interface{}{
					{"key": "service.name", "value": map[string]interface{}{"stringValue": svc}},
					{"key": "service.version", "value": map[string]interface{}{"stringValue": "1.4.2"}},
					{"key": "deployment.environment", "value": map[string]interface{}{"stringValue": "production"}},
					{"key": "host.name", "value": map[string]interface{}{"stringValue": svc + "-pod-" + randomHex(3)}},
				},
			},
			"scopeMetrics": []map[string]interface{}{
				{
					"scope":   map[string]interface{}{"name": "ace-telemetrygen", "version": "1.0.0"},
					"metrics": metrics,
				},
			},
		})
	}

	payload := map[string]interface{}{"resourceMetrics": resourceMetrics}
	return postJSON(endpoint+"/v1/metrics", payload)
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────

func postJSON(url string, payload interface{}) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("%s returned %d", url, resp.StatusCode)
	}
	return nil
}

// ─── Utility functions ───────────────────────────────────────────────────────

func hasAttr(attrs []attr, key string) bool {
	for _, a := range attrs {
		if a.Key == key {
			return true
		}
	}
	return false
}

func getStringAttr(attrs []attr, key string) string {
	for _, a := range attrs {
		if a.Key == key {
			if s, ok := a.Value.(string); ok {
				return s
			}
		}
	}
	return ""
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

func sortFloat64s(a []float64) {
	// Simple insertion sort for small slices
	for i := 1; i < len(a); i++ {
		for j := i; j > 0 && a[j] < a[j-1]; j-- {
			a[j], a[j-1] = a[j-1], a[j]
		}
	}
}

func randomIP() string {
	return fmt.Sprintf("10.%d.%d.%d", mrand.Intn(255), mrand.Intn(255), mrand.Intn(255)+1)
}

var userAgents = []string{
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0",
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0",
	"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
	"curl/8.4.0",
	"PostmanRuntime/7.36.1",
	"Go-http-client/2.0",
}

func randomUserAgent() string {
	return userAgents[mrand.Intn(len(userAgents))]
}

func severityNum(level string) int {
	switch level {
	case "DEBUG":
		return 5
	case "INFO":
		return 9
	case "WARN":
		return 13
	case "ERROR":
		return 17
	default:
		return 9
	}
}

func errorMessage(method, path string, status int) string {
	switch status {
	case 400:
		return fmt.Sprintf("Bad request: %s %s — invalid request body", method, path)
	case 401:
		return fmt.Sprintf("Unauthorized: %s %s — missing or invalid auth token", method, path)
	case 403:
		return fmt.Sprintf("Forbidden: %s %s — insufficient permissions", method, path)
	case 404:
		return fmt.Sprintf("Not found: %s %s — resource does not exist", method, path)
	case 409:
		return fmt.Sprintf("Conflict: %s %s — resource already exists or version mismatch", method, path)
	case 422:
		return fmt.Sprintf("Unprocessable entity: %s %s — validation failed", method, path)
	case 429:
		return fmt.Sprintf("Rate limited: %s %s — too many requests, retry after 60s", method, path)
	case 500:
		return fmt.Sprintf("Internal server error: %s %s — unexpected nil pointer in handler", method, path)
	case 502:
		return fmt.Sprintf("Bad gateway: %s %s — upstream service unavailable", method, path)
	case 503:
		return fmt.Sprintf("Service unavailable: %s %s — circuit breaker open", method, path)
	case 504:
		return fmt.Sprintf("Gateway timeout: %s %s — upstream did not respond within 30s", method, path)
	default:
		return fmt.Sprintf("Request failed: %s %s — status %d", method, path, status)
	}
}

func errorType(status int) string {
	switch status {
	case 400:
		return "BadRequestError"
	case 401:
		return "UnauthorizedError"
	case 403:
		return "ForbiddenError"
	case 404:
		return "NotFoundError"
	case 409:
		return "ConflictError"
	case 422:
		return "ValidationError"
	case 429:
		return "RateLimitError"
	case 500:
		return "InternalServerError"
	case 502:
		return "BadGatewayError"
	case 503:
		return "ServiceUnavailableError"
	case 504:
		return "GatewayTimeoutError"
	default:
		return "HTTPError"
	}
}

var errorStatuses = []int{400, 401, 403, 404, 409, 422, 429, 500, 500, 502, 503, 504}

func pickErrorStatus() int {
	return errorStatuses[mrand.Intn(len(errorStatuses))]
}

// ─── Generate a single request flow ──────────────────────────────────────────

func generateFlow(otlpEndpoint string, requestTime time.Time) (spans []builtSpan, logEntries []logEntry, flow flowDef, statusCode int, isError bool) {
	flow = flows[mrand.Intn(len(flows))]
	isError = mrand.Float64() > flow.SuccessRate
	statusCode = 200
	if flow.Method == "POST" {
		statusCode = 201
	}
	if isError {
		statusCode = pickErrorStatus()
	}

	traceID := generateTraceID()
	rootSpanID := generateSpanID()

	totalDurationMs := randBetween(10, 50)
	for _, ds := range flow.Downstream {
		childSpans := buildSpans(ds, traceID, rootSpanID, requestTime.Add(2*time.Millisecond), isError)
		spans = append(spans, childSpans...)
		if len(childSpans) > 0 {
			childDuration := (childSpans[0].EndNano - childSpans[0].StartNano) / 1e6
			totalDurationMs += int(childDuration)
		}
	}

	rootStatusCode := 0
	if isError {
		rootStatusCode = 2
	}
	rootSpan := builtSpan{
		TraceID:    traceID,
		SpanID:     rootSpanID,
		Service:    flow.Service,
		Operation:  fmt.Sprintf("%s %s", flow.Method, flow.Path),
		SpanKind:   2,
		StartNano:  requestTime.UnixNano(),
		EndNano:    requestTime.Add(time.Duration(totalDurationMs) * time.Millisecond).UnixNano(),
		StatusCode: rootStatusCode,
		Attributes: []attr{
			{"http.request.method", flow.Method},
			{"url.path", flow.Path},
			{"http.response.status_code", statusCode},
			{"server.port", int64(8080)},
			{"network.protocol.version", "1.1"},
			{"client.address", randomIP()},
			{"user_agent.original", randomUserAgent()},
		},
	}
	spans = append([]builtSpan{rootSpan}, spans...)
	logEntries = generateLogs(spans, flow, statusCode, isError)
	return
}

// ─── Main ────────────────────────────────────────────────────────────────────

func main() {
	flag.Parse()

	if *continuous {
		runContinuous()
	} else {
		runBatch()
	}
}

func runContinuous() {
	log.Printf("Running continuously at %.1f flows/sec", *rate)
	log.Printf("OTLP endpoint: %s", *otlpURL)

	interval := time.Duration(float64(time.Second) / *rate)
	metricsInterval := 15 * time.Second // push aggregated metrics every 15s
	metricsTicker := time.NewTicker(metricsInterval)
	defer metricsTicker.Stop()

	acc := newMetricAccumulator(time.Now())
	totalFlows := 0
	errCount := 0

	for {
		select {
		case <-metricsTicker.C:
			// Push accumulated metrics and reset
			if err := pushMetrics(*otlpURL, acc); err != nil {
				errCount++
				if errCount <= 5 {
					log.Printf("Warning: metrics push failed: %v", err)
				}
			}
			acc = newMetricAccumulator(time.Now())

		default:
			now := time.Now()
			spans, logs, flow, statusCode, isError := generateFlow(*otlpURL, now)

			if err := pushTraces(*otlpURL, spans, flow, statusCode); err != nil {
				errCount++
				if errCount <= 5 {
					log.Printf("Warning: trace push failed: %v", err)
				}
			}

			if err := pushLogs(*otlpURL, logs); err != nil {
				errCount++
				if errCount <= 5 {
					log.Printf("Warning: log push failed: %v", err)
				}
			}

			acc.record(flow, spans, statusCode, isError)
			totalFlows++

			if totalFlows%100 == 0 {
				log.Printf("Generated %d flows (errors: %d)", totalFlows, errCount)
			}

			time.Sleep(interval)
		}
	}
}

func runBatch() {
	log.Printf("Generating %d request flows spread over %s...", *count, *spread)
	log.Printf("OTLP endpoint: %s", *otlpURL)

	now := time.Now()
	interval := *spread / time.Duration(*count)

	batchMinutes := int(spread.Minutes())
	if batchMinutes < 1 {
		batchMinutes = 1
	}
	flowsPerBatch := *count / batchMinutes
	if flowsPerBatch < 1 {
		flowsPerBatch = 1
	}

	totalTraces := 0
	totalLogs := 0
	totalMetricBatches := 0
	traceErrors := 0
	logErrors := 0
	metricErrors := 0

	for batch := 0; batch < batchMinutes && totalTraces < *count; batch++ {
		batchStart := now.Add(-*spread).Add(time.Duration(batch) * time.Minute)
		acc := newMetricAccumulator(batchStart.Add(30 * time.Second))

		batchCount := flowsPerBatch
		if totalTraces+batchCount > *count {
			batchCount = *count - totalTraces
		}

		for i := 0; i < batchCount; i++ {
			requestTime := batchStart.Add(time.Duration(i) * interval)
			spans, logs, flow, statusCode, isError := generateFlow(*otlpURL, requestTime)

			if err := pushTraces(*otlpURL, spans, flow, statusCode); err != nil {
				traceErrors++
				if traceErrors <= 3 {
					log.Printf("Warning: trace push failed: %v", err)
				}
			}
			totalTraces++

			if err := pushLogs(*otlpURL, logs); err != nil {
				logErrors++
				if logErrors <= 3 {
					log.Printf("Warning: log push failed: %v", err)
				}
			}
			totalLogs += len(logs)

			acc.record(flow, spans, statusCode, isError)
		}

		if err := pushMetrics(*otlpURL, acc); err != nil {
			metricErrors++
			if metricErrors <= 3 {
				log.Printf("Warning: metrics push failed: %v", err)
			}
		}
		totalMetricBatches++

		if (batch+1)%5 == 0 || batch == batchMinutes-1 {
			log.Printf("Progress: %d/%d flows, %d metric batches", totalTraces, *count, totalMetricBatches)
		}
	}

	log.Println("─────────────────────────────────────────")
	log.Printf("Traces generated:  %d (errors pushing: %d)", totalTraces, traceErrors)
	log.Printf("Log entries:       %d (errors pushing: %d)", totalLogs, logErrors)
	log.Printf("Metric batches:    %d (errors pushing: %d)", totalMetricBatches, metricErrors)
	log.Println("─────────────────────────────────────────")
}
