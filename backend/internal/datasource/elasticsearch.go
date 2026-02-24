package datasource

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/janhoon/dash/backend/internal/models"
)

const (
	elasticsearchSignalLogs    = "logs"
	elasticsearchSignalMetrics = "metrics"

	elasticsearchDefaultIndex = "*"
	elasticsearchDefaultLimit = 500
	elasticsearchMaxLimit     = 5000
)

var elasticsearchDefaultTimestampFields = []string{"@timestamp", "timestamp", "time", "ts", "event_time", "event.time"}
var elasticsearchDefaultMessageFields = []string{"message", "msg", "log", "line", "event.original"}
var elasticsearchDefaultLevelFields = []string{"level", "log.level", "severity", "severity_text"}

type ElasticsearchClient struct {
	datasource models.DataSource
	httpClient *http.Client
	cfg        elasticsearchConfig
}

type elasticsearchConfig struct {
	Index        string
	TimestampKey string
	MessageKey   string
	LevelKey     string
}

func NewElasticsearchClient(ds models.DataSource) (*ElasticsearchClient, error) {
	if strings.TrimSpace(ds.URL) == "" {
		return nil, fmt.Errorf("datasource url is required")
	}

	if _, err := url.Parse(ds.URL); err != nil {
		return nil, fmt.Errorf("invalid datasource url: %w", err)
	}

	cfg := parseElasticsearchConfig(ds.AuthConfig)
	if cfg.Index == "" {
		cfg.Index = elasticsearchDefaultIndex
	}
	if cfg.TimestampKey == "" {
		cfg.TimestampKey = "@timestamp"
	}
	if cfg.MessageKey == "" {
		cfg.MessageKey = "message"
	}
	if cfg.LevelKey == "" {
		cfg.LevelKey = "level"
	}

	return &ElasticsearchClient{
		datasource: ds,
		httpClient: &http.Client{Timeout: 30 * time.Second},
		cfg:        cfg,
	}, nil
}

func (c *ElasticsearchClient) Query(ctx context.Context, query string, start, end time.Time, step time.Duration, limit int) (*QueryResult, error) {
	return c.QueryWithSignal(ctx, query, elasticsearchSignalMetrics, start, end, step, limit)
}

func (c *ElasticsearchClient) QueryWithSignal(ctx context.Context, query, signal string, start, end time.Time, step time.Duration, limit int) (*QueryResult, error) {
	normalizedSignal := normalizeElasticsearchSignal(signal)
	if normalizedSignal == "" {
		return nil, fmt.Errorf("invalid elasticsearch signal %q, must be one of: logs, metrics", signal)
	}

	switch normalizedSignal {
	case elasticsearchSignalLogs:
		return c.queryLogs(ctx, query, start, end, limit)
	case elasticsearchSignalMetrics:
		return c.queryMetrics(ctx, query, start, end, step)
	default:
		return nil, fmt.Errorf("invalid elasticsearch signal %q, must be one of: logs, metrics", signal)
	}
}

func (c *ElasticsearchClient) queryLogs(ctx context.Context, query string, start, end time.Time, limit int) (*QueryResult, error) {
	index, body, err := parseElasticsearchSearchRequest(interpolateElasticsearchTemplate(query, start, end, 0))
	if err != nil {
		return nil, err
	}

	if strings.TrimSpace(index) == "" {
		index = c.cfg.Index
	}
	if strings.TrimSpace(index) == "" {
		index = elasticsearchDefaultIndex
	}

	if _, hasQuery := body["query"]; !hasQuery {
		body["query"] = map[string]interface{}{"match_all": map[string]interface{}{}}
	}
	ensureElasticsearchTimeFilter(body, c.cfg.TimestampKey, start, end)

	if _, hasSize := body["size"]; !hasSize {
		body["size"] = clampElasticsearchLimit(limit)
	}
	if _, hasSort := body["sort"]; !hasSort {
		body["sort"] = []interface{}{
			map[string]interface{}{
				c.cfg.TimestampKey: map[string]interface{}{
					"order":         "desc",
					"unmapped_type": "date",
				},
			},
		}
	}

	response, err := c.search(ctx, index, body)
	if err != nil {
		return nil, err
	}

	entries := parseElasticsearchLogs(response, c.cfg)
	if limit > 0 && len(entries) > limit {
		entries = entries[:limit]
	}

	return &QueryResult{
		Status:     "success",
		ResultType: elasticsearchSignalLogs,
		Data: &QueryData{
			ResultType: "streams",
			Logs:       entries,
		},
	}, nil
}

func (c *ElasticsearchClient) queryMetrics(ctx context.Context, query string, start, end time.Time, step time.Duration) (*QueryResult, error) {
	index, body, err := parseElasticsearchSearchRequest(interpolateElasticsearchTemplate(query, start, end, step))
	if err != nil {
		return nil, err
	}

	if strings.TrimSpace(index) == "" {
		index = c.cfg.Index
	}
	if strings.TrimSpace(index) == "" {
		index = elasticsearchDefaultIndex
	}

	if _, hasQuery := body["query"]; !hasQuery {
		body["query"] = map[string]interface{}{"match_all": map[string]interface{}{}}
	}
	ensureElasticsearchTimeFilter(body, c.cfg.TimestampKey, start, end)

	if !hasElasticsearchAggregations(body) {
		body["aggs"] = map[string]interface{}{
			"timeseries": map[string]interface{}{
				"date_histogram": map[string]interface{}{
					"field":           c.cfg.TimestampKey,
					"fixed_interval":  elasticsearchFixedInterval(step),
					"min_doc_count":   0,
					"extended_bounds": map[string]interface{}{"min": start.UnixMilli(), "max": end.UnixMilli()},
				},
			},
		}
	}

	if _, hasSize := body["size"]; !hasSize {
		body["size"] = 0
	}

	response, err := c.search(ctx, index, body)
	if err != nil {
		return nil, err
	}

	metrics := parseElasticsearchMetrics(response, start, end)
	if len(metrics) == 0 {
		metrics = NormaliseToMetrics(extractElasticsearchSourceRows(response))
	}

	return &QueryResult{
		Status:     "success",
		ResultType: elasticsearchSignalMetrics,
		Data: &QueryData{
			ResultType: "matrix",
			Result:     metrics,
		},
	}, nil
}

func (c *ElasticsearchClient) search(ctx context.Context, index string, requestBody map[string]interface{}) (map[string]interface{}, error) {
	targetURL, err := c.searchURL(index)
	if err != nil {
		return nil, err
	}

	payload, err := json.Marshal(requestBody)
	if err != nil {
		return nil, fmt.Errorf("failed to encode elasticsearch query: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, targetURL, bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("failed to create elasticsearch request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	if err := applyDataSourceAuth(req, c.datasource); err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to query elasticsearch: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read elasticsearch response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
			return nil, fmt.Errorf("authentication failed with status %d", resp.StatusCode)
		}

		message := extractElasticsearchErrorMessage(body)
		if message == "" {
			message = strings.TrimSpace(string(body))
		}
		if message == "" {
			message = http.StatusText(resp.StatusCode)
		}

		return nil, fmt.Errorf("elasticsearch query failed with status %d: %s", resp.StatusCode, message)
	}

	decoded := map[string]interface{}{}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	if err := decoder.Decode(&decoded); err != nil {
		return nil, fmt.Errorf("failed to parse elasticsearch response: %w", err)
	}

	return decoded, nil
}

func (c *ElasticsearchClient) searchURL(index string) (string, error) {
	parsed, err := url.Parse(c.datasource.URL)
	if err != nil {
		return "", fmt.Errorf("invalid datasource url: %w", err)
	}

	trimmedIndex := strings.Trim(strings.TrimSpace(index), "/")
	if trimmedIndex == "" {
		trimmedIndex = elasticsearchDefaultIndex
	}

	basePath := strings.TrimSuffix(parsed.Path, "/")
	if basePath == "" {
		parsed.Path = "/" + trimmedIndex + "/_search"
	} else {
		parsed.Path = basePath + "/" + trimmedIndex + "/_search"
	}

	return parsed.String(), nil
}

func parseElasticsearchConfig(authConfig json.RawMessage) elasticsearchConfig {
	if len(authConfig) == 0 {
		return elasticsearchConfig{}
	}

	raw := map[string]interface{}{}
	if err := json.Unmarshal(authConfig, &raw); err != nil {
		return elasticsearchConfig{}
	}

	return elasticsearchConfig{
		Index:        getMapString(raw, "index", "index_pattern", "indexPattern", "indices"),
		TimestampKey: getMapString(raw, "time_field", "timeField", "timestamp_field", "timestampField"),
		MessageKey:   getMapString(raw, "message_field", "messageField"),
		LevelKey:     getMapString(raw, "level_field", "levelField"),
	}
}

func parseElasticsearchSearchRequest(query string) (string, map[string]interface{}, error) {
	trimmed := strings.TrimSpace(query)
	if trimmed == "" {
		return "", nil, fmt.Errorf("query is required")
	}

	if strings.HasPrefix(trimmed, "{") {
		parsed := map[string]interface{}{}
		decoder := json.NewDecoder(strings.NewReader(trimmed))
		decoder.UseNumber()
		if err := decoder.Decode(&parsed); err != nil {
			return "", nil, fmt.Errorf("invalid elasticsearch query JSON: %w", err)
		}

		index := getMapString(parsed, "index", "_index", "indices")
		if rawBody, hasBody := parsed["body"]; hasBody {
			bodyMap, ok := rawBody.(map[string]interface{})
			if !ok {
				return "", nil, fmt.Errorf("elasticsearch query field \"body\" must be an object")
			}

			return index, bodyMap, nil
		}

		body := map[string]interface{}{}
		for key, value := range parsed {
			switch key {
			case "index", "_index", "indices":
				continue
			default:
				body[key] = value
			}
		}

		return index, body, nil
	}

	return "", map[string]interface{}{
		"query": map[string]interface{}{
			"query_string": map[string]interface{}{
				"query": trimmed,
			},
		},
	}, nil
}

func parseElasticsearchLogs(response map[string]interface{}, cfg elasticsearchConfig) []LogEntry {
	hits := extractElasticsearchHits(response)
	if len(hits) == 0 {
		return []LogEntry{}
	}

	entries := make([]LogEntry, 0, len(hits))
	timestampCandidates := append([]string{cfg.TimestampKey}, elasticsearchDefaultTimestampFields...)
	messageCandidates := append([]string{cfg.MessageKey}, elasticsearchDefaultMessageFields...)
	levelCandidates := append([]string{cfg.LevelKey}, elasticsearchDefaultLevelFields...)

	for _, hit := range hits {
		document := flattenElasticsearchHit(hit)
		if len(document) == 0 {
			continue
		}

		timestampValue, hasTimestamp := pickElasticsearchField(document, timestampCandidates)
		messageValue, hasMessage := pickElasticsearchField(document, messageCandidates)

		timestamp := ""
		if hasTimestamp {
			timestamp = formatElasticsearchTimestamp(timestampValue)
		}
		if timestamp == "" {
			timestamp = parseElasticsearchHitTimestamp(hit)
		}

		line := ""
		if hasMessage {
			line = strings.TrimSpace(anyToString(messageValue))
		}
		if line == "" {
			if payload, err := json.Marshal(document); err == nil {
				line = string(payload)
			}
		}

		excludedColumns := append([]string{}, timestampCandidates...)
		excludedColumns = append(excludedColumns, messageCandidates...)
		excludedColumns = append(excludedColumns, levelCandidates...)

		labels := collectElasticsearchLabels(document, excludedColumns)
		if indexName := strings.TrimSpace(anyToString(hit["_index"])); indexName != "" {
			labels["index"] = indexName
		}
		if id := strings.TrimSpace(anyToString(hit["_id"])); id != "" {
			labels["_id"] = id
		}

		if levelValue, ok := pickElasticsearchField(document, levelCandidates); ok {
			if level := strings.TrimSpace(anyToString(levelValue)); level != "" {
				labels["level"] = level
			}
		}

		entries = append(entries, LogEntry{
			Timestamp: timestamp,
			Line:      line,
			Labels:    labels,
			Level:     detectLogLevel(labels, line),
		})
	}

	sort.SliceStable(entries, func(i, j int) bool {
		return entries[i].Timestamp > entries[j].Timestamp
	})

	return entries
}

func parseElasticsearchMetrics(response map[string]interface{}, start, end time.Time) []MetricResult {
	aggregations, ok := response["aggregations"].(map[string]interface{})
	if !ok || len(aggregations) == 0 {
		return []MetricResult{}
	}

	seriesBySignature := map[string]*clickHouseMetricSeries{}
	defaultTimestamp := float64(end.Unix())
	if defaultTimestamp <= 0 {
		defaultTimestamp = float64(start.Unix())
	}

	for name, rawAgg := range aggregations {
		collectElasticsearchAggregationMetrics(name, rawAgg, map[string]string{}, defaultTimestamp, seriesBySignature)
	}

	if len(seriesBySignature) == 0 {
		return []MetricResult{}
	}

	signatures := make([]string, 0, len(seriesBySignature))
	for signature := range seriesBySignature {
		signatures = append(signatures, signature)
	}
	sort.Strings(signatures)

	results := make([]MetricResult, 0, len(signatures))
	for _, signature := range signatures {
		series := seriesBySignature[signature]
		sort.Slice(series.Values, func(i, j int) bool {
			return clickHouseValueTimestamp(series.Values[i]) < clickHouseValueTimestamp(series.Values[j])
		})
		results = append(results, MetricResult{
			Metric: series.Metric,
			Values: series.Values,
		})
	}

	return results
}

func collectElasticsearchAggregationMetrics(
	aggName string,
	raw interface{},
	labels map[string]string,
	defaultTimestamp float64,
	out map[string]*clickHouseMetricSeries,
) {
	node, ok := raw.(map[string]interface{})
	if !ok || len(node) == 0 {
		return
	}

	if value, hasValue := node["value"]; hasValue {
		if numericValue, ok := anyToFloat64(value); ok && !math.IsNaN(numericValue) {
			appendElasticsearchMetricPoint(out, metricLabelsWithName(labels, aggName), defaultTimestamp, numericValue)
		}
	}

	if percentiles, ok := node["values"].(map[string]interface{}); ok {
		keys := make([]string, 0, len(percentiles))
		for key := range percentiles {
			keys = append(keys, key)
		}
		sort.Strings(keys)

		for _, key := range keys {
			if value, ok := anyToFloat64(percentiles[key]); ok && !math.IsNaN(value) {
				percentileLabels := cloneMetricLabels(labels)
				percentileLabels["percentile"] = key
				appendElasticsearchMetricPoint(out, metricLabelsWithName(percentileLabels, aggName), defaultTimestamp, value)
			}
		}
	}

	if rawBuckets, hasBuckets := node["buckets"]; hasBuckets {
		buckets, ok := rawBuckets.([]interface{})
		if !ok {
			return
		}

		for _, rawBucket := range buckets {
			bucket, ok := rawBucket.(map[string]interface{})
			if !ok {
				continue
			}

			bucketTimestamp, bucketIsTime := parseElasticsearchBucketTimestamp(bucket)
			if bucketTimestamp <= 0 {
				bucketTimestamp = defaultTimestamp
			}

			bucketLabels := cloneMetricLabels(labels)
			if !bucketIsTime {
				bucketKey := strings.TrimSpace(anyToString(bucket["key_as_string"]))
				if bucketKey == "" {
					bucketKey = strings.TrimSpace(anyToString(bucket["key"]))
				}
				if bucketKey != "" {
					bucketLabels[aggName] = bucketKey
				}
			}

			if docCount, ok := anyToFloat64(bucket["doc_count"]); ok && !math.IsNaN(docCount) {
				appendElasticsearchMetricPoint(out, metricLabelsWithName(bucketLabels, buildElasticsearchMetricName(aggName, "count")), bucketTimestamp, docCount)
			}

			for key, value := range bucket {
				switch key {
				case "key", "key_as_string", "doc_count", "doc_count_error_upper_bound", "sum_other_doc_count":
					continue
				}

				if childMetric, ok := value.(map[string]interface{}); ok {
					if childValue, ok := anyToFloat64(childMetric["value"]); ok && !math.IsNaN(childValue) {
						appendElasticsearchMetricPoint(out, metricLabelsWithName(bucketLabels, buildElasticsearchMetricName(aggName, key)), bucketTimestamp, childValue)
					}

					if childPercentiles, ok := childMetric["values"].(map[string]interface{}); ok {
						for percentile, percentileValue := range childPercentiles {
							if numericPercentileValue, ok := anyToFloat64(percentileValue); ok && !math.IsNaN(numericPercentileValue) {
								childLabels := cloneMetricLabels(bucketLabels)
								childLabels["percentile"] = percentile
								appendElasticsearchMetricPoint(
									out,
									metricLabelsWithName(childLabels, buildElasticsearchMetricName(aggName, key)),
									bucketTimestamp,
									numericPercentileValue,
								)
							}
						}
					}
				}

				collectElasticsearchAggregationMetrics(buildElasticsearchMetricName(aggName, key), value, bucketLabels, bucketTimestamp, out)
			}
		}

		return
	}

	for key, value := range node {
		switch key {
		case "value", "values", "doc_count", "key", "key_as_string":
			continue
		default:
			collectElasticsearchAggregationMetrics(buildElasticsearchMetricName(aggName, key), value, labels, defaultTimestamp, out)
		}
	}
}

func appendElasticsearchMetricPoint(seriesBySignature map[string]*clickHouseMetricSeries, metric map[string]string, timestamp, value float64) {
	if len(metric) == 0 {
		return
	}

	signature := clickHouseMetricSignature(metric)
	series, ok := seriesBySignature[signature]
	if !ok {
		series = &clickHouseMetricSeries{
			Metric: metric,
			Values: make([][]interface{}, 0, 32),
		}
		seriesBySignature[signature] = series
	}

	series.Values = append(series.Values, []interface{}{
		timestamp,
		strconv.FormatFloat(value, 'f', -1, 64),
	})
}

func extractElasticsearchSourceRows(response map[string]interface{}) []map[string]interface{} {
	hits := extractElasticsearchHits(response)
	if len(hits) == 0 {
		return []map[string]interface{}{}
	}

	rows := make([]map[string]interface{}, 0, len(hits))
	for _, hit := range hits {
		row := flattenElasticsearchHit(hit)
		if len(row) == 0 {
			continue
		}
		rows = append(rows, row)
	}

	return rows
}

func extractElasticsearchHits(response map[string]interface{}) []map[string]interface{} {
	hitsWrapper, ok := response["hits"].(map[string]interface{})
	if !ok {
		return nil
	}

	rawHits, ok := hitsWrapper["hits"].([]interface{})
	if !ok {
		return nil
	}

	hits := make([]map[string]interface{}, 0, len(rawHits))
	for _, raw := range rawHits {
		if hit, ok := raw.(map[string]interface{}); ok {
			hits = append(hits, hit)
		}
	}

	return hits
}

func flattenElasticsearchHit(hit map[string]interface{}) map[string]interface{} {
	document := map[string]interface{}{}
	if source, ok := hit["_source"].(map[string]interface{}); ok {
		for key, value := range source {
			document[key] = value
		}
	}

	if fields, ok := hit["fields"].(map[string]interface{}); ok {
		for key, value := range fields {
			if _, exists := document[key]; exists {
				continue
			}
			document[key] = firstElasticsearchFieldValue(value)
		}
	}

	return document
}

func firstElasticsearchFieldValue(value interface{}) interface{} {
	switch typed := value.(type) {
	case []interface{}:
		if len(typed) == 0 {
			return nil
		}
		return typed[0]
	default:
		return typed
	}
}

func pickElasticsearchField(document map[string]interface{}, candidates []string) (interface{}, bool) {
	if len(document) == 0 {
		return nil, false
	}

	normalizedFields := make(map[string]interface{}, len(document))
	for key, value := range document {
		normalized := normalizeElasticsearchFieldName(key)
		if normalized == "" {
			continue
		}
		if _, exists := normalizedFields[normalized]; !exists {
			normalizedFields[normalized] = value
		}
	}

	for _, candidate := range candidates {
		if value, ok := document[candidate]; ok {
			return value, true
		}

		normalizedCandidate := normalizeElasticsearchFieldName(candidate)
		if normalizedCandidate == "" {
			continue
		}
		if value, ok := normalizedFields[normalizedCandidate]; ok {
			return value, true
		}
	}

	return nil, false
}

func collectElasticsearchLabels(document map[string]interface{}, excluded []string) map[string]string {
	excludedFields := make(map[string]struct{}, len(excluded))
	for _, field := range excluded {
		normalized := normalizeElasticsearchFieldName(field)
		if normalized == "" {
			continue
		}
		excludedFields[normalized] = struct{}{}
	}

	keys := make([]string, 0, len(document))
	for key := range document {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	labels := map[string]string{}
	for _, key := range keys {
		normalized := normalizeElasticsearchFieldName(key)
		if _, skip := excludedFields[normalized]; skip {
			continue
		}

		value := strings.TrimSpace(anyToString(document[key]))
		if value == "" {
			continue
		}
		labels[key] = value
	}

	return labels
}

func parseElasticsearchHitTimestamp(hit map[string]interface{}) string {
	if rawSort, ok := hit["sort"].([]interface{}); ok && len(rawSort) > 0 {
		if timestamp, ok := parseClickHouseTimestampSeconds(rawSort[0]); ok {
			return clickHouseSecondsToRFC3339(timestamp)
		}
	}
	return ""
}

func formatElasticsearchTimestamp(value interface{}) string {
	if value == nil {
		return ""
	}

	switch typed := value.(type) {
	case string:
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			return ""
		}
		if parsed, ok := parseClickHouseTimeString(trimmed); ok {
			return parsed.UTC().Format(time.RFC3339Nano)
		}
		if seconds, err := strconv.ParseFloat(trimmed, 64); err == nil {
			return clickHouseSecondsToRFC3339(normalizeClickHouseEpochSeconds(seconds))
		}
		return trimmed
	case time.Time:
		return typed.UTC().Format(time.RFC3339Nano)
	}

	if seconds, ok := parseClickHouseTimestampSeconds(value); ok {
		return clickHouseSecondsToRFC3339(seconds)
	}

	return ""
}

func normalizeElasticsearchSignal(signal string) string {
	normalized := strings.ToLower(strings.TrimSpace(signal))
	if normalized == "" {
		return elasticsearchSignalMetrics
	}

	switch normalized {
	case elasticsearchSignalLogs, elasticsearchSignalMetrics:
		return normalized
	default:
		return ""
	}
}

func clampElasticsearchLimit(limit int) int {
	if limit <= 0 {
		return elasticsearchDefaultLimit
	}
	if limit > elasticsearchMaxLimit {
		return elasticsearchMaxLimit
	}
	return limit
}

func hasElasticsearchAggregations(body map[string]interface{}) bool {
	if _, ok := body["aggs"]; ok {
		return true
	}
	if _, ok := body["aggregations"]; ok {
		return true
	}
	return false
}

func ensureElasticsearchTimeFilter(body map[string]interface{}, timestampField string, start, end time.Time) {
	trimmedField := strings.TrimSpace(timestampField)
	if trimmedField == "" {
		trimmedField = "@timestamp"
	}

	rangeFilter := map[string]interface{}{
		"range": map[string]interface{}{
			trimmedField: map[string]interface{}{
				"gte":    start.UnixMilli(),
				"lte":    end.UnixMilli(),
				"format": "epoch_millis",
			},
		},
	}

	rawQuery, hasQuery := body["query"]
	if !hasQuery {
		body["query"] = map[string]interface{}{
			"bool": map[string]interface{}{
				"filter": []interface{}{rangeFilter},
			},
		}
		return
	}

	queryMap, ok := rawQuery.(map[string]interface{})
	if !ok {
		body["query"] = map[string]interface{}{
			"bool": map[string]interface{}{
				"must":   []interface{}{rawQuery},
				"filter": []interface{}{rangeFilter},
			},
		}
		return
	}

	if boolQueryRaw, hasBool := queryMap["bool"]; hasBool {
		boolQuery, ok := boolQueryRaw.(map[string]interface{})
		if !ok {
			queryMap["bool"] = map[string]interface{}{
				"must":   []interface{}{boolQueryRaw},
				"filter": []interface{}{rangeFilter},
			}
			body["query"] = queryMap
			return
		}

		filters := toElasticsearchInterfaceSlice(boolQuery["filter"])
		if !containsElasticsearchRangeFilter(filters, trimmedField) {
			filters = append(filters, rangeFilter)
		}
		boolQuery["filter"] = filters
		queryMap["bool"] = boolQuery
		body["query"] = queryMap
		return
	}

	body["query"] = map[string]interface{}{
		"bool": map[string]interface{}{
			"must":   []interface{}{queryMap},
			"filter": []interface{}{rangeFilter},
		},
	}
}

func containsElasticsearchRangeFilter(filters []interface{}, field string) bool {
	normalizedField := normalizeElasticsearchFieldName(field)
	for _, rawFilter := range filters {
		filterMap, ok := rawFilter.(map[string]interface{})
		if !ok {
			continue
		}
		rangeRaw, ok := filterMap["range"].(map[string]interface{})
		if !ok {
			continue
		}
		for key := range rangeRaw {
			if normalizeElasticsearchFieldName(key) == normalizedField {
				return true
			}
		}
	}
	return false
}

func toElasticsearchInterfaceSlice(value interface{}) []interface{} {
	switch typed := value.(type) {
	case nil:
		return []interface{}{}
	case []interface{}:
		return append([]interface{}{}, typed...)
	default:
		return []interface{}{typed}
	}
}

func elasticsearchFixedInterval(step time.Duration) string {
	if step <= 0 {
		return "30s"
	}

	seconds := int64(step / time.Second)
	if seconds <= 0 {
		seconds = 1
	}

	switch {
	case seconds%3600 == 0:
		return fmt.Sprintf("%dh", seconds/3600)
	case seconds%60 == 0:
		return fmt.Sprintf("%dm", seconds/60)
	default:
		return fmt.Sprintf("%ds", seconds)
	}
}

func parseElasticsearchBucketTimestamp(bucket map[string]interface{}) (float64, bool) {
	if rawKeyAsString, ok := bucket["key_as_string"]; ok {
		trimmed := strings.TrimSpace(anyToString(rawKeyAsString))
		if trimmed != "" {
			if parsed, ok := parseClickHouseTimeString(trimmed); ok {
				return float64(parsed.UnixNano()) / float64(time.Second), true
			}
		}
	}

	keyValue, hasKey := bucket["key"]
	if !hasKey {
		return 0, false
	}

	numeric, ok := anyToFloat64(keyValue)
	if !ok {
		return 0, false
	}

	seconds := normalizeClickHouseEpochSeconds(numeric)
	if math.Abs(numeric) >= 1e11 || math.Abs(seconds) >= 1e8 {
		return seconds, true
	}

	return seconds, false
}

func metricLabelsWithName(labels map[string]string, name string) map[string]string {
	metric := cloneMetricLabels(labels)
	trimmedName := strings.TrimSpace(name)
	if trimmedName == "" {
		trimmedName = "value"
	}
	metric["__name__"] = trimmedName
	return metric
}

func cloneMetricLabels(labels map[string]string) map[string]string {
	cloned := make(map[string]string, len(labels)+1)
	for key, value := range labels {
		cloned[key] = value
	}
	return cloned
}

func buildElasticsearchMetricName(parts ...string) string {
	cleaned := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		cleaned = append(cleaned, strings.ReplaceAll(trimmed, " ", "_"))
	}

	if len(cleaned) == 0 {
		return "value"
	}

	return strings.Join(cleaned, ".")
}

func normalizeElasticsearchFieldName(field string) string {
	trimmed := strings.ToLower(strings.TrimSpace(field))
	if trimmed == "" {
		return ""
	}

	builder := strings.Builder{}
	builder.Grow(len(trimmed))
	for _, char := range trimmed {
		if (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') {
			builder.WriteRune(char)
		}
	}

	return builder.String()
}

func extractElasticsearchErrorMessage(payload []byte) string {
	if len(payload) == 0 {
		return ""
	}

	decoded := map[string]interface{}{}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return ""
	}

	errorValue, ok := decoded["error"]
	if !ok {
		return ""
	}

	switch typed := errorValue.(type) {
	case string:
		return strings.TrimSpace(typed)
	case map[string]interface{}:
		if reason := strings.TrimSpace(anyToString(typed["reason"])); reason != "" {
			return reason
		}
		if rootCause, ok := typed["root_cause"].([]interface{}); ok && len(rootCause) > 0 {
			if firstCause, ok := rootCause[0].(map[string]interface{}); ok {
				if reason := strings.TrimSpace(anyToString(firstCause["reason"])); reason != "" {
					return reason
				}
			}
		}

		if payload, err := json.Marshal(typed); err == nil {
			return string(payload)
		}
	}

	return ""
}

func interpolateElasticsearchTemplate(query string, start, end time.Time, step time.Duration) string {
	if strings.TrimSpace(query) == "" {
		return query
	}

	stepSeconds := int64(step / time.Second)
	if stepSeconds <= 0 {
		stepSeconds = 1
	}

	replacer := strings.NewReplacer(
		"{start}", strconv.FormatInt(start.Unix(), 10),
		"{end}", strconv.FormatInt(end.Unix(), 10),
		"{step}", strconv.FormatInt(stepSeconds, 10),
		"{start_ms}", strconv.FormatInt(start.UnixMilli(), 10),
		"{end_ms}", strconv.FormatInt(end.UnixMilli(), 10),
		"{start_ns}", strconv.FormatInt(start.UnixNano(), 10),
		"{end_ns}", strconv.FormatInt(end.UnixNano(), 10),
		"{start_rfc3339}", start.UTC().Format(time.RFC3339Nano),
		"{end_rfc3339}", end.UTC().Format(time.RFC3339Nano),
	)

	return replacer.Replace(query)
}
