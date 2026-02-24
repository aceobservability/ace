package datasource

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/janhoon/dash/backend/internal/models"
)

// TracingClient is the interface for trace-specific datasource operations.
type TracingClient interface {
	GetTrace(ctx context.Context, traceID string) (*Trace, error)
	SearchTraces(ctx context.Context, req TraceSearchRequest) ([]TraceSummary, error)
	Services(ctx context.Context) ([]string, error)
}

// TraceSearchRequest represents a trace search request body.
type TraceSearchRequest struct {
	Query       string            `json:"query,omitempty"`
	Service     string            `json:"service,omitempty"`
	Operation   string            `json:"operation,omitempty"`
	Tags        map[string]string `json:"tags,omitempty"`
	MinDuration string            `json:"minDuration,omitempty"`
	MaxDuration string            `json:"maxDuration,omitempty"`
	Start       int64             `json:"start,omitempty"` // unix seconds
	End         int64             `json:"end,omitempty"`   // unix seconds
	Limit       int               `json:"limit,omitempty"`
}

// Trace is the unified trace model returned by tracing endpoints.
type Trace struct {
	TraceID           string      `json:"traceId"`
	Spans             []TraceSpan `json:"spans"`
	Services          []string    `json:"services"`
	StartTimeUnixNano int64       `json:"startTimeUnixNano"`
	DurationNano      int64       `json:"durationNano"`
}

// TraceSpan is a normalized span model.
type TraceSpan struct {
	SpanID            string            `json:"spanId"`
	ParentSpanID      string            `json:"parentSpanId,omitempty"`
	OperationName     string            `json:"operationName"`
	ServiceName       string            `json:"serviceName"`
	StartTimeUnixNano int64             `json:"startTimeUnixNano"`
	DurationNano      int64             `json:"durationNano"`
	Tags              map[string]string `json:"tags,omitempty"`
	Logs              []TraceLog        `json:"logs,omitempty"`
	Status            string            `json:"status,omitempty"`
}

// TraceLog is a normalized span log/event.
type TraceLog struct {
	TimestampUnixNano int64             `json:"timestampUnixNano"`
	Fields            map[string]string `json:"fields,omitempty"`
}

// TraceSummary is a compact trace model for search results.
type TraceSummary struct {
	TraceID           string `json:"traceId"`
	RootServiceName   string `json:"rootServiceName,omitempty"`
	RootOperationName string `json:"rootOperationName,omitempty"`
	StartTimeUnixNano int64  `json:"startTimeUnixNano"`
	DurationNano      int64  `json:"durationNano"`
	SpanCount         int    `json:"spanCount"`
	ServiceCount      int    `json:"serviceCount"`
	ErrorSpanCount    int    `json:"errorSpanCount"`
}

// TraceServiceGraph is an aggregated service dependency graph for a trace.
type TraceServiceGraph struct {
	Nodes           []TraceServiceNode `json:"nodes"`
	Edges           []TraceServiceEdge `json:"edges"`
	TotalRequests   int                `json:"totalRequests"`
	TotalErrorCount int                `json:"totalErrorCount"`
}

// TraceServiceNode represents one service in a dependency graph.
type TraceServiceNode struct {
	ServiceName     string  `json:"serviceName"`
	RequestCount    int     `json:"requestCount"`
	ErrorCount      int     `json:"errorCount"`
	ErrorRate       float64 `json:"errorRate"`
	AverageDuration int64   `json:"averageDurationNano"`
}

// TraceServiceEdge represents one service-to-service dependency.
type TraceServiceEdge struct {
	Source          string  `json:"source"`
	Target          string  `json:"target"`
	RequestCount    int     `json:"requestCount"`
	ErrorCount      int     `json:"errorCount"`
	ErrorRate       float64 `json:"errorRate"`
	AverageDuration int64   `json:"averageDurationNano"`
}

// BuildTraceServiceGraph aggregates spans into service-level dependencies.
func BuildTraceServiceGraph(trace *Trace) *TraceServiceGraph {
	empty := &TraceServiceGraph{
		Nodes: []TraceServiceNode{},
		Edges: []TraceServiceEdge{},
	}
	if trace == nil || len(trace.Spans) == 0 {
		return empty
	}

	type serviceNodeAggregate struct {
		requestCount int
		errorCount   int
		durationSum  int64
	}

	type serviceEdgeAggregate struct {
		source       string
		target       string
		requestCount int
		errorCount   int
		durationSum  int64
	}

	nodeAggregates := make(map[string]*serviceNodeAggregate)
	edgeAggregates := make(map[string]*serviceEdgeAggregate)
	spanByID := make(map[string]TraceSpan, len(trace.Spans))

	for _, span := range trace.Spans {
		if span.SpanID == "" {
			continue
		}
		spanByID[span.SpanID] = span
	}

	totalRequests := 0
	totalErrors := 0

	for _, span := range trace.Spans {
		serviceName := normalizeTraceServiceName(span.ServiceName)
		spanFailed := strings.EqualFold(span.Status, "error") || hasErrorTag(span.Tags)
		if spanFailed {
			totalErrors++
		}

		node := nodeAggregates[serviceName]
		if node == nil {
			node = &serviceNodeAggregate{}
			nodeAggregates[serviceName] = node
		}

		node.requestCount++
		node.durationSum += max(span.DurationNano, 0)
		if spanFailed {
			node.errorCount++
		}
		totalRequests++

		parentSpanID := strings.TrimSpace(span.ParentSpanID)
		if parentSpanID == "" {
			continue
		}

		parentSpan, ok := spanByID[parentSpanID]
		if !ok {
			continue
		}

		parentServiceName := normalizeTraceServiceName(parentSpan.ServiceName)
		if parentServiceName == serviceName {
			continue
		}

		edgeKey := parentServiceName + "\x00" + serviceName
		edge := edgeAggregates[edgeKey]
		if edge == nil {
			edge = &serviceEdgeAggregate{
				source: parentServiceName,
				target: serviceName,
			}
			edgeAggregates[edgeKey] = edge
		}

		edge.requestCount++
		edge.durationSum += max(span.DurationNano, 0)
		if spanFailed {
			edge.errorCount++
		}
	}

	nodeNames := make([]string, 0, len(nodeAggregates))
	for serviceName := range nodeAggregates {
		nodeNames = append(nodeNames, serviceName)
	}
	sort.Strings(nodeNames)

	nodes := make([]TraceServiceNode, 0, len(nodeNames))
	for _, serviceName := range nodeNames {
		aggregate := nodeAggregates[serviceName]
		averageDuration := int64(0)
		errorRate := 0.0
		if aggregate.requestCount > 0 {
			averageDuration = aggregate.durationSum / int64(aggregate.requestCount)
			errorRate = float64(aggregate.errorCount) / float64(aggregate.requestCount)
		}

		nodes = append(nodes, TraceServiceNode{
			ServiceName:     serviceName,
			RequestCount:    aggregate.requestCount,
			ErrorCount:      aggregate.errorCount,
			ErrorRate:       errorRate,
			AverageDuration: averageDuration,
		})
	}

	edges := make([]TraceServiceEdge, 0, len(edgeAggregates))
	for _, aggregate := range edgeAggregates {
		averageDuration := int64(0)
		errorRate := 0.0
		if aggregate.requestCount > 0 {
			averageDuration = aggregate.durationSum / int64(aggregate.requestCount)
			errorRate = float64(aggregate.errorCount) / float64(aggregate.requestCount)
		}

		edges = append(edges, TraceServiceEdge{
			Source:          aggregate.source,
			Target:          aggregate.target,
			RequestCount:    aggregate.requestCount,
			ErrorCount:      aggregate.errorCount,
			ErrorRate:       errorRate,
			AverageDuration: averageDuration,
		})
	}

	sort.Slice(edges, func(i, j int) bool {
		if edges[i].Source == edges[j].Source {
			return edges[i].Target < edges[j].Target
		}
		return edges[i].Source < edges[j].Source
	})

	return &TraceServiceGraph{
		Nodes:           nodes,
		Edges:           edges,
		TotalRequests:   totalRequests,
		TotalErrorCount: totalErrors,
	}
}

func normalizeTraceServiceName(serviceName string) string {
	trimmed := strings.TrimSpace(serviceName)
	if trimmed == "" {
		return "unknown"
	}

	return trimmed
}

func NewTracingClient(ds models.DataSource) (TracingClient, error) {
	switch ds.Type {
	case models.DataSourceTempo:
		return NewTempoClient(ds)
	case models.DataSourceVictoriaTraces:
		return NewVictoriaTracesClient(ds)
	default:
		return nil, fmt.Errorf("unsupported tracing datasource type: %s", ds.Type)
	}
}

func doTracingRequest(ctx context.Context, httpClient *http.Client, ds models.DataSource, method, endpoint string, body io.Reader) ([]byte, error) {
	targetURL, err := resolveHealthEndpoint(ds.URL, endpoint)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, method, targetURL, body)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	if err := applyDataSourceAuth(req, ds); err != nil {
		return nil, err
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	payload, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return nil, fmt.Errorf("failed to read response body: %w", readErr)
	}

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return payload, nil
	}

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return nil, fmt.Errorf("authentication failed with status %d", resp.StatusCode)
	}

	message := strings.TrimSpace(string(payload))
	if message == "" {
		message = http.StatusText(resp.StatusCode)
	}

	return nil, fmt.Errorf("tracing api request failed with status %d: %s", resp.StatusCode, message)
}

func normalizeTraceSearchLimit(limit int) int {
	if limit <= 0 {
		return 20
	}

	if limit > 1000 {
		return 1000
	}

	return limit
}

func normalizeTraceSearchResults(traces []TraceSummary, requestedLimit int) []TraceSummary {
	if len(traces) == 0 {
		return []TraceSummary{}
	}

	traceByID := make(map[string]TraceSummary, len(traces))
	for _, trace := range traces {
		traceID := strings.TrimSpace(trace.TraceID)
		if traceID == "" {
			continue
		}

		trace.TraceID = traceID
		existing, ok := traceByID[traceID]
		if !ok || shouldReplaceTraceSummary(existing, trace) {
			traceByID[traceID] = trace
		}
	}

	if len(traceByID) == 0 {
		return []TraceSummary{}
	}

	normalized := make([]TraceSummary, 0, len(traceByID))
	for _, trace := range traceByID {
		normalized = append(normalized, trace)
	}

	sort.Slice(normalized, func(i, j int) bool {
		if normalized[i].StartTimeUnixNano != normalized[j].StartTimeUnixNano {
			return normalized[i].StartTimeUnixNano > normalized[j].StartTimeUnixNano
		}
		if normalized[i].DurationNano != normalized[j].DurationNano {
			return normalized[i].DurationNano > normalized[j].DurationNano
		}
		if normalized[i].SpanCount != normalized[j].SpanCount {
			return normalized[i].SpanCount > normalized[j].SpanCount
		}

		return normalized[i].TraceID < normalized[j].TraceID
	})

	limit := normalizeTraceSearchLimit(requestedLimit)
	if len(normalized) > limit {
		return normalized[:limit]
	}

	return normalized
}

func shouldReplaceTraceSummary(existing, candidate TraceSummary) bool {
	if candidate.StartTimeUnixNano != existing.StartTimeUnixNano {
		return candidate.StartTimeUnixNano > existing.StartTimeUnixNano
	}

	if candidate.SpanCount != existing.SpanCount {
		return candidate.SpanCount > existing.SpanCount
	}

	if candidate.ServiceCount != existing.ServiceCount {
		return candidate.ServiceCount > existing.ServiceCount
	}

	if candidate.ErrorSpanCount != existing.ErrorSpanCount {
		return candidate.ErrorSpanCount > existing.ErrorSpanCount
	}

	if candidate.DurationNano != existing.DurationNano {
		return candidate.DurationNano > existing.DurationNano
	}

	if existing.RootServiceName == "" && candidate.RootServiceName != "" {
		return true
	}

	if existing.RootOperationName == "" && candidate.RootOperationName != "" {
		return true
	}

	return false
}

func buildTraceSearchParams(req TraceSearchRequest) url.Values {
	values := url.Values{}

	if q := strings.TrimSpace(req.Query); q != "" {
		values.Set("q", q)
		values.Set("query", q)
	}
	if service := strings.TrimSpace(req.Service); service != "" {
		values.Set("service", service)
	}
	if operation := strings.TrimSpace(req.Operation); operation != "" {
		values.Set("operation", operation)
	}
	if minDuration := strings.TrimSpace(req.MinDuration); minDuration != "" {
		values.Set("minDuration", minDuration)
	}
	if maxDuration := strings.TrimSpace(req.MaxDuration); maxDuration != "" {
		values.Set("maxDuration", maxDuration)
	}
	if req.Start > 0 {
		values.Set("start", strconv.FormatInt(req.Start, 10))
	}
	if req.End > 0 {
		values.Set("end", strconv.FormatInt(req.End, 10))
	}

	values.Set("limit", strconv.Itoa(normalizeTraceSearchLimit(req.Limit)))

	if len(req.Tags) > 0 {
		keys := make([]string, 0, len(req.Tags))
		for key := range req.Tags {
			keys = append(keys, key)
		}
		sort.Strings(keys)

		tags := make([]string, 0, len(keys))
		for _, key := range keys {
			tags = append(tags, key+"="+req.Tags[key])
		}

		values.Set("tags", strings.Join(tags, ","))
	}

	return values
}

type jaegerTag struct {
	Key   string      `json:"key"`
	Value interface{} `json:"value"`
}

type jaegerLog struct {
	Timestamp int64       `json:"timestamp"`
	Fields    []jaegerTag `json:"fields"`
}

type jaegerReference struct {
	RefType string `json:"refType"`
	SpanID  string `json:"spanID"`
}

type jaegerSpan struct {
	TraceID       string            `json:"traceID"`
	SpanID        string            `json:"spanID"`
	OperationName string            `json:"operationName"`
	References    []jaegerReference `json:"references"`
	StartTime     int64             `json:"startTime"`
	Duration      int64             `json:"duration"`
	Tags          []jaegerTag       `json:"tags"`
	Logs          []jaegerLog       `json:"logs"`
	ProcessID     string            `json:"processID"`
}

type jaegerProcess struct {
	ServiceName string `json:"serviceName"`
}

type jaegerTraceEnvelope struct {
	TraceID   string                   `json:"traceID"`
	Spans     []jaegerSpan             `json:"spans"`
	Processes map[string]jaegerProcess `json:"processes"`
}

type jaegerTraceResponse struct {
	Data []jaegerTraceEnvelope `json:"data"`
}

func parseTrace(tracePayload []byte) (*Trace, error) {
	if trace, err := parseJaegerDataTrace(tracePayload); err == nil {
		return trace, nil
	}

	return parseTempoBatchesTrace(tracePayload)
}

func parseJaegerDataTrace(tracePayload []byte) (*Trace, error) {
	var decoded jaegerTraceResponse
	if err := json.Unmarshal(tracePayload, &decoded); err != nil {
		return nil, fmt.Errorf("failed to decode jaeger trace response: %w", err)
	}

	if len(decoded.Data) == 0 {
		return nil, fmt.Errorf("trace response has no data")
	}

	trace := decoded.Data[0]
	return jaegerEnvelopeToTrace(trace), nil
}

func jaegerEnvelopeToTrace(trace jaegerTraceEnvelope) *Trace {
	servicesSet := map[string]struct{}{}
	spans := make([]TraceSpan, 0, len(trace.Spans))
	traceID := trace.TraceID

	var startMin int64
	var endMax int64

	for idx, span := range trace.Spans {
		if traceID == "" {
			traceID = span.TraceID
		}

		serviceName := trace.Processes[span.ProcessID].ServiceName
		if serviceName != "" {
			servicesSet[serviceName] = struct{}{}
		}

		parentSpanID := ""
		for _, ref := range span.References {
			if strings.EqualFold(ref.RefType, "CHILD_OF") {
				parentSpanID = ref.SpanID
				break
			}
			if parentSpanID == "" {
				parentSpanID = ref.SpanID
			}
		}

		tags := map[string]string{}
		for _, tag := range span.Tags {
			tags[tag.Key] = fmt.Sprint(tag.Value)
		}

		logs := make([]TraceLog, 0, len(span.Logs))
		for _, log := range span.Logs {
			fields := map[string]string{}
			for _, field := range log.Fields {
				fields[field.Key] = fmt.Sprint(field.Value)
			}
			logs = append(logs, TraceLog{
				TimestampUnixNano: log.Timestamp * 1000,
				Fields:            fields,
			})
		}

		startUnixNano := span.StartTime * 1000
		durationNano := span.Duration * 1000
		endUnixNano := startUnixNano + durationNano

		if idx == 0 || startUnixNano < startMin {
			startMin = startUnixNano
		}
		if idx == 0 || endUnixNano > endMax {
			endMax = endUnixNano
		}

		traceSpan := TraceSpan{
			SpanID:            span.SpanID,
			ParentSpanID:      parentSpanID,
			OperationName:     span.OperationName,
			ServiceName:       serviceName,
			StartTimeUnixNano: startUnixNano,
			DurationNano:      durationNano,
			Tags:              tags,
			Logs:              logs,
		}
		if hasErrorTag(tags) {
			traceSpan.Status = "error"
		}

		spans = append(spans, traceSpan)
	}

	services := make([]string, 0, len(servicesSet))
	for service := range servicesSet {
		services = append(services, service)
	}
	sort.Strings(services)

	duration := int64(0)
	if endMax > startMin {
		duration = endMax - startMin
	}

	return &Trace{
		TraceID:           traceID,
		Spans:             spans,
		Services:          services,
		StartTimeUnixNano: startMin,
		DurationNano:      duration,
	}
}

func parseTempoBatchesTrace(tracePayload []byte) (*Trace, error) {
	var decoded map[string]interface{}
	if err := json.Unmarshal(tracePayload, &decoded); err != nil {
		return nil, fmt.Errorf("failed to decode tempo trace response: %w", err)
	}

	rawBatches, ok := decoded["batches"].([]interface{})
	if !ok || len(rawBatches) == 0 {
		return nil, fmt.Errorf("trace response has no data")
	}

	servicesSet := map[string]struct{}{}
	spans := make([]TraceSpan, 0)
	traceID := ""

	var startMin int64
	var endMax int64
	spanIndex := 0

	for _, rawBatch := range rawBatches {
		batchMap, ok := rawBatch.(map[string]interface{})
		if !ok {
			continue
		}

		batchServiceName := extractServiceNameFromResource(batchMap["resource"])

		processServiceByID := map[string]string{}
		if rawProcesses, ok := batchMap["processes"].(map[string]interface{}); ok {
			for processID, rawProcess := range rawProcesses {
				if processMap, ok := rawProcess.(map[string]interface{}); ok {
					if serviceName := anyToString(processMap["serviceName"]); serviceName != "" {
						processServiceByID[processID] = serviceName
					}
				}
			}
		}

		appendSpan := func(rawSpan map[string]interface{}) {
			traceSpan, spanTraceID, ok := parseTempoSpan(rawSpan, processServiceByID, batchServiceName)
			if !ok {
				return
			}

			if traceID == "" {
				traceID = spanTraceID
			}

			if traceSpan.ServiceName != "" {
				servicesSet[traceSpan.ServiceName] = struct{}{}
			}

			if traceSpan.StartTimeUnixNano > 0 {
				if spanIndex == 0 || traceSpan.StartTimeUnixNano < startMin {
					startMin = traceSpan.StartTimeUnixNano
				}

				endUnixNano := traceSpan.StartTimeUnixNano + max(traceSpan.DurationNano, 1)
				if spanIndex == 0 || endUnixNano > endMax {
					endMax = endUnixNano
				}
			}

			spans = append(spans, traceSpan)
			spanIndex++
		}

		if rawSpans, ok := batchMap["spans"].([]interface{}); ok {
			for _, rawSpan := range rawSpans {
				spanMap, ok := rawSpan.(map[string]interface{})
				if !ok {
					continue
				}
				appendSpan(spanMap)
			}
		}

		rawScopeSpans, ok := firstNonNil(batchMap["scopeSpans"], batchMap["instrumentationLibrarySpans"]).([]interface{})
		if !ok {
			continue
		}

		for _, rawScopeSpansEntry := range rawScopeSpans {
			scopeMap, ok := rawScopeSpansEntry.(map[string]interface{})
			if !ok {
				continue
			}

			rawScopeSpansList, ok := scopeMap["spans"].([]interface{})
			if !ok {
				continue
			}

			for _, rawSpan := range rawScopeSpansList {
				spanMap, ok := rawSpan.(map[string]interface{})
				if !ok {
					continue
				}
				appendSpan(spanMap)
			}
		}
	}

	if len(spans) == 0 {
		return nil, fmt.Errorf("trace response has no spans")
	}

	services := make([]string, 0, len(servicesSet))
	for service := range servicesSet {
		services = append(services, service)
	}
	sort.Strings(services)

	duration := int64(0)
	if endMax > startMin {
		duration = endMax - startMin
	}

	return &Trace{
		TraceID:           traceID,
		Spans:             spans,
		Services:          services,
		StartTimeUnixNano: startMin,
		DurationNano:      duration,
	}, nil
}

func parseTempoSpan(rawSpan map[string]interface{}, processServiceByID map[string]string, defaultServiceName string) (TraceSpan, string, bool) {
	spanTraceID := anyToString(firstNonNil(rawSpan["traceID"], rawSpan["traceId"]))
	spanID := anyToString(firstNonNil(rawSpan["spanID"], rawSpan["spanId"]))
	if spanID == "" {
		return TraceSpan{}, "", false
	}

	operationName := anyToString(firstNonNil(rawSpan["operationName"], rawSpan["name"]))
	processID := anyToString(firstNonNil(rawSpan["processID"], rawSpan["processId"]))

	serviceName := processServiceByID[processID]
	if serviceName == "" {
		if rawProcess, ok := rawSpan["process"].(map[string]interface{}); ok {
			serviceName = anyToString(rawProcess["serviceName"])
		}
	}
	if serviceName == "" {
		if attributeService := parseOTLPAttributes(rawSpan["attributes"])["service.name"]; attributeService != "" {
			serviceName = attributeService
		}
	}
	if serviceName == "" {
		serviceName = defaultServiceName
	}

	startUnixNano, ok := anyToInt64(firstNonNil(rawSpan["startTimeUnixNano"], rawSpan["startTimeUnixNanos"]))
	if !ok {
		if startMicros, microsOK := anyToInt64(rawSpan["startTime"]); microsOK {
			startUnixNano = startMicros * 1000
		}
	}

	durationNano, ok := anyToInt64(firstNonNil(rawSpan["durationNano"], rawSpan["durationNanos"]))
	if !ok {
		if durationMicros, microsOK := anyToInt64(rawSpan["duration"]); microsOK {
			durationNano = durationMicros * 1000
		}
	}

	if endUnixNano, endOK := anyToInt64(firstNonNil(rawSpan["endTimeUnixNano"], rawSpan["endTimeUnixNanos"])); endOK && endUnixNano > startUnixNano {
		durationNano = endUnixNano - startUnixNano
	}

	parentSpanID := anyToString(firstNonNil(rawSpan["parentSpanID"], rawSpan["parentSpanId"]))
	if parentSpanID == "" {
		if rawReferences, ok := rawSpan["references"].([]interface{}); ok {
			for _, rawRef := range rawReferences {
				refMap, ok := rawRef.(map[string]interface{})
				if !ok {
					continue
				}

				candidate := anyToString(firstNonNil(refMap["spanID"], refMap["spanId"]))
				if candidate == "" {
					continue
				}

				if parentSpanID == "" {
					parentSpanID = candidate
				}

				if strings.EqualFold(anyToString(firstNonNil(refMap["refType"], refMap["referenceType"])), "CHILD_OF") {
					parentSpanID = candidate
					break
				}
			}
		}
	}

	tags := map[string]string{}
	if rawTags, ok := rawSpan["tags"].([]interface{}); ok {
		for _, rawTag := range rawTags {
			tagMap, ok := rawTag.(map[string]interface{})
			if !ok {
				continue
			}

			key := anyToString(tagMap["key"])
			if key == "" {
				continue
			}
			tags[key] = anyToString(tagMap["value"])
		}
	}

	for key, value := range parseOTLPAttributes(rawSpan["attributes"]) {
		tags[key] = value
	}

	logs := make([]TraceLog, 0)
	if rawLogs, ok := rawSpan["logs"].([]interface{}); ok {
		for _, rawLog := range rawLogs {
			logMap, ok := rawLog.(map[string]interface{})
			if !ok {
				continue
			}

			logTimestamp, _ := anyToInt64(firstNonNil(logMap["timestampUnixNano"], logMap["timestamp"]))
			if logTimestamp > 0 && logTimestamp < 1_000_000_000_000 {
				logTimestamp *= 1000
			}

			fields := map[string]string{}
			if rawFields, ok := logMap["fields"].([]interface{}); ok {
				for _, rawField := range rawFields {
					fieldMap, ok := rawField.(map[string]interface{})
					if !ok {
						continue
					}

					key := anyToString(fieldMap["key"])
					if key == "" {
						continue
					}
					fields[key] = anyToString(fieldMap["value"])
				}
			}

			logs = append(logs, TraceLog{TimestampUnixNano: logTimestamp, Fields: fields})
		}
	}

	if rawEvents, ok := rawSpan["events"].([]interface{}); ok {
		for _, rawEvent := range rawEvents {
			eventMap, ok := rawEvent.(map[string]interface{})
			if !ok {
				continue
			}

			eventTimestamp, _ := anyToInt64(firstNonNil(eventMap["timeUnixNano"], eventMap["timestampUnixNano"], eventMap["timestamp"]))
			if eventTimestamp > 0 && eventTimestamp < 1_000_000_000_000 {
				eventTimestamp *= 1000
			}

			fields := parseOTLPAttributes(eventMap["attributes"])
			if eventName := anyToString(eventMap["name"]); eventName != "" {
				fields["event.name"] = eventName
			}

			logs = append(logs, TraceLog{TimestampUnixNano: eventTimestamp, Fields: fields})
		}
	}

	traceSpan := TraceSpan{
		SpanID:            spanID,
		ParentSpanID:      parentSpanID,
		OperationName:     operationName,
		ServiceName:       serviceName,
		StartTimeUnixNano: startUnixNano,
		DurationNano:      max(durationNano, 0),
		Tags:              tags,
		Logs:              logs,
	}

	if hasErrorTag(tags) || statusIsError(rawSpan["status"]) {
		traceSpan.Status = "error"
	}

	return traceSpan, spanTraceID, true
}

func parseOTLPAttributes(rawAttributes interface{}) map[string]string {
	attributes := map[string]string{}

	rawList, ok := rawAttributes.([]interface{})
	if !ok {
		return attributes
	}

	for _, rawAttr := range rawList {
		attrMap, ok := rawAttr.(map[string]interface{})
		if !ok {
			continue
		}

		key := anyToString(attrMap["key"])
		if key == "" {
			continue
		}

		attributes[key] = parseOTLPAnyValue(attrMap["value"])
	}

	return attributes
}

func parseOTLPAnyValue(rawValue interface{}) string {
	if rawValue == nil {
		return ""
	}

	valueMap, ok := rawValue.(map[string]interface{})
	if !ok {
		return anyToString(rawValue)
	}

	if value := anyToString(valueMap["stringValue"]); value != "" {
		return value
	}
	if value := anyToString(valueMap["boolValue"]); value != "" {
		return value
	}
	if value := anyToString(valueMap["intValue"]); value != "" {
		return value
	}
	if value := anyToString(valueMap["doubleValue"]); value != "" {
		return value
	}
	if value := anyToString(valueMap["bytesValue"]); value != "" {
		return value
	}

	if rawArrayValue, ok := valueMap["arrayValue"].(map[string]interface{}); ok {
		if rawValues, ok := rawArrayValue["values"].([]interface{}); ok {
			parts := make([]string, 0, len(rawValues))
			for _, rawEntry := range rawValues {
				parts = append(parts, parseOTLPAnyValue(rawEntry))
			}
			return strings.Join(parts, ",")
		}
	}

	if rawKVListValue, ok := valueMap["kvlistValue"].(map[string]interface{}); ok {
		entries := parseOTLPAttributes(rawKVListValue["values"])
		if len(entries) == 0 {
			return ""
		}

		keys := make([]string, 0, len(entries))
		for key := range entries {
			keys = append(keys, key)
		}
		sort.Strings(keys)

		parts := make([]string, 0, len(keys))
		for _, key := range keys {
			parts = append(parts, key+"="+entries[key])
		}

		return strings.Join(parts, ",")
	}

	return ""
}

func statusIsError(rawStatus interface{}) bool {
	statusMap, ok := rawStatus.(map[string]interface{})
	if !ok {
		return false
	}

	if code, ok := anyToInt64(statusMap["code"]); ok {
		return code == 2
	}

	codeText := strings.ToUpper(anyToString(statusMap["code"]))
	return strings.Contains(codeText, "ERROR")
}

func extractServiceNameFromResource(rawResource interface{}) string {
	resourceMap, ok := rawResource.(map[string]interface{})
	if !ok {
		return ""
	}

	attributes := parseOTLPAttributes(resourceMap["attributes"])
	return attributes["service.name"]
}

func parseTraceSearchResponse(payload []byte) ([]TraceSummary, error) {
	if traces, err := parseTempoTraceSearch(payload); err == nil && len(traces) > 0 {
		return traces, nil
	}

	return parseJaegerTraceSearch(payload)
}

func parseTempoTraceSearch(payload []byte) ([]TraceSummary, error) {
	var decoded map[string]interface{}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, fmt.Errorf("failed to decode tempo trace search response: %w", err)
	}

	rawTraces, ok := decoded["traces"].([]interface{})
	if !ok || len(rawTraces) == 0 {
		return nil, fmt.Errorf("trace search response has no traces")
	}

	traces := make([]TraceSummary, 0, len(rawTraces))
	for _, raw := range rawTraces {
		traceMap, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}

		traceID := anyToString(firstNonNil(traceMap["traceID"], traceMap["traceId"]))
		if traceID == "" {
			continue
		}

		startTimeUnixNano, _ := anyToInt64(firstNonNil(traceMap["startTimeUnixNano"], traceMap["startTimeUnixNanos"]))
		durationNano, hasDurationNano := anyToInt64(firstNonNil(traceMap["durationNano"], traceMap["durationNanos"]))
		if !hasDurationNano {
			durationMs, _ := anyToFloat64(traceMap["durationMs"])
			durationNano = int64(durationMs * float64(time.Millisecond))
		}

		spanCount := parseTempoTraceSearchSpanCount(traceMap)
		serviceCount, errorSpanCount := parseTempoTraceSearchServiceStats(traceMap)

		traces = append(traces, TraceSummary{
			TraceID:           traceID,
			RootServiceName:   anyToString(traceMap["rootServiceName"]),
			RootOperationName: anyToString(firstNonNil(traceMap["rootTraceName"], traceMap["rootOperationName"])),
			StartTimeUnixNano: startTimeUnixNano,
			DurationNano:      durationNano,
			SpanCount:         spanCount,
			ServiceCount:      serviceCount,
			ErrorSpanCount:    errorSpanCount,
		})
	}

	if len(traces) == 0 {
		return nil, fmt.Errorf("trace search response has no traces")
	}

	return traces, nil
}

func parseTempoTraceSearchSpanCount(traceMap map[string]interface{}) int {
	if spanCount, ok := parseTempoSpanSetCount(traceMap["spanSet"]); ok {
		return spanCount
	}

	rawSpanSets, ok := traceMap["spanSets"].([]interface{})
	if !ok {
		return 0
	}

	maxSpanCount := 0
	for _, rawSpanSet := range rawSpanSets {
		spanCount, ok := parseTempoSpanSetCount(rawSpanSet)
		if ok && spanCount > maxSpanCount {
			maxSpanCount = spanCount
		}
	}

	return maxSpanCount
}

func parseTempoSpanSetCount(rawSpanSet interface{}) (int, bool) {
	if rawSpanSet == nil {
		return 0, false
	}

	if rawSpanList, ok := rawSpanSet.([]interface{}); ok {
		return len(rawSpanList), true
	}

	spanSetMap, ok := rawSpanSet.(map[string]interface{})
	if !ok {
		return 0, false
	}

	if matched, ok := anyToInt64(spanSetMap["matched"]); ok {
		return max(int(matched), 0), true
	}

	rawSpanList, ok := spanSetMap["spans"].([]interface{})
	if !ok {
		return 0, false
	}

	return len(rawSpanList), true
}

func parseTempoTraceSearchServiceStats(traceMap map[string]interface{}) (int, int) {
	rawServiceStats, ok := traceMap["serviceStats"].(map[string]interface{})
	if !ok || len(rawServiceStats) == 0 {
		return 0, 0
	}

	errorSpanCount := 0
	for _, rawStats := range rawServiceStats {
		statsMap, ok := rawStats.(map[string]interface{})
		if !ok {
			continue
		}

		if errors, ok := anyToInt64(firstNonNil(statsMap["errorCount"], statsMap["errorSpanCount"], statsMap["errors"])); ok {
			errorSpanCount += max(int(errors), 0)
		}
	}

	return len(rawServiceStats), errorSpanCount
}

func parseJaegerTraceSearch(payload []byte) ([]TraceSummary, error) {
	var decoded jaegerTraceResponse
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, fmt.Errorf("failed to decode jaeger trace search response: %w", err)
	}

	if len(decoded.Data) == 0 {
		return nil, fmt.Errorf("trace search response has no data")
	}

	traces := make([]TraceSummary, 0, len(decoded.Data))
	for _, trace := range decoded.Data {
		summary := jaegerEnvelopeToSummary(trace)
		if summary.TraceID == "" {
			continue
		}
		traces = append(traces, summary)
	}

	if len(traces) == 0 {
		return nil, fmt.Errorf("trace search response has no traces")
	}

	return traces, nil
}

func jaegerEnvelopeToSummary(trace jaegerTraceEnvelope) TraceSummary {
	traceID := trace.TraceID
	serviceSet := map[string]struct{}{}

	var rootService string
	var rootOperation string
	var spanCount int
	var errorCount int
	var startMin int64
	var endMax int64

	for idx, span := range trace.Spans {
		if traceID == "" {
			traceID = span.TraceID
		}
		spanCount++

		serviceName := trace.Processes[span.ProcessID].ServiceName
		if serviceName != "" {
			serviceSet[serviceName] = struct{}{}
		}

		isRoot := true
		for _, ref := range span.References {
			if strings.EqualFold(ref.RefType, "CHILD_OF") {
				isRoot = false
				break
			}
		}
		if isRoot {
			if rootService == "" {
				rootService = serviceName
			}
			if rootOperation == "" {
				rootOperation = span.OperationName
			}
		}

		tags := map[string]string{}
		for _, tag := range span.Tags {
			tags[tag.Key] = fmt.Sprint(tag.Value)
		}
		if hasErrorTag(tags) {
			errorCount++
		}

		startUnixNano := span.StartTime * 1000
		durationNano := span.Duration * 1000
		endUnixNano := startUnixNano + durationNano

		if idx == 0 || startUnixNano < startMin {
			startMin = startUnixNano
		}
		if idx == 0 || endUnixNano > endMax {
			endMax = endUnixNano
		}
	}

	if rootService == "" {
		for service := range serviceSet {
			rootService = service
			break
		}
	}

	duration := int64(0)
	if endMax > startMin {
		duration = endMax - startMin
	}

	return TraceSummary{
		TraceID:           traceID,
		RootServiceName:   rootService,
		RootOperationName: rootOperation,
		StartTimeUnixNano: startMin,
		DurationNano:      duration,
		SpanCount:         spanCount,
		ServiceCount:      len(serviceSet),
		ErrorSpanCount:    errorCount,
	}
}

func parseStringSlicePayload(payload []byte) ([]string, error) {
	var wrapped map[string]json.RawMessage
	if err := json.Unmarshal(payload, &wrapped); err == nil {
		if rawData, ok := wrapped["data"]; ok {
			var data []string
			if err := json.Unmarshal(rawData, &data); err == nil {
				return data, nil
			}
		}
	}

	var raw []string
	if err := json.Unmarshal(payload, &raw); err == nil {
		return raw, nil
	}

	return nil, fmt.Errorf("response body is not a string list")
}

func hasErrorTag(tags map[string]string) bool {
	if len(tags) == 0 {
		return false
	}

	if value, ok := tags["error"]; ok {
		lower := strings.ToLower(value)
		return lower == "true" || lower == "1" || lower == "error"
	}

	if value, ok := tags["otel.status_code"]; ok {
		return strings.EqualFold(value, "error")
	}

	if value, ok := tags["status.code"]; ok {
		return strings.EqualFold(value, "error")
	}

	return false
}

func firstNonNil(values ...interface{}) interface{} {
	for _, value := range values {
		if value != nil {
			return value
		}
	}

	return nil
}

func anyToString(value interface{}) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return typed
	case json.Number:
		return typed.String()
	default:
		return fmt.Sprint(typed)
	}
}

func anyToInt64(value interface{}) (int64, bool) {
	switch typed := value.(type) {
	case nil:
		return 0, false
	case int64:
		return typed, true
	case int:
		return int64(typed), true
	case float64:
		return int64(typed), true
	case json.Number:
		if intVal, err := typed.Int64(); err == nil {
			return intVal, true
		}
		if floatVal, err := typed.Float64(); err == nil {
			return int64(floatVal), true
		}
	case string:
		if typed == "" {
			return 0, false
		}
		if intVal, err := strconv.ParseInt(typed, 10, 64); err == nil {
			return intVal, true
		}
		if floatVal, err := strconv.ParseFloat(typed, 64); err == nil {
			return int64(floatVal), true
		}
	}

	return 0, false
}

func anyToFloat64(value interface{}) (float64, bool) {
	switch typed := value.(type) {
	case nil:
		return 0, false
	case float64:
		return typed, true
	case int64:
		return float64(typed), true
	case int:
		return float64(typed), true
	case json.Number:
		floatVal, err := typed.Float64()
		if err != nil {
			return 0, false
		}
		return floatVal, true
	case string:
		if typed == "" {
			return 0, false
		}
		floatVal, err := strconv.ParseFloat(typed, 64)
		if err != nil {
			return 0, false
		}
		return floatVal, true
	}

	return 0, false
}
