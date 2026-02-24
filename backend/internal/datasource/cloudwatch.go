package datasource

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/cloudwatch"
	cloudwatchtypes "github.com/aws/aws-sdk-go-v2/service/cloudwatch/types"
	"github.com/aws/aws-sdk-go-v2/service/cloudwatchlogs"
	cloudwatchlogstypes "github.com/aws/aws-sdk-go-v2/service/cloudwatchlogs/types"
	"github.com/janhoon/dash/backend/internal/models"
)

const (
	defaultCloudWatchNamespace = "AWS/EC2"
	cloudWatchPollInterval     = 500 * time.Millisecond
)

type CloudWatchClient struct {
	datasource models.DataSource
	cfg        cloudWatchConfig
}

type cloudWatchConfig struct {
	Region          string
	AccessKeyID     string
	SecretAccessKey string
	SessionToken    string
	MetricNamespace string
	LogGroups       []string
}

type cloudWatchMetricQuery struct {
	Namespace  string            `json:"namespace"`
	MetricName string            `json:"metric_name"`
	Dimensions map[string]string `json:"dimensions"`
	Stat       string            `json:"stat"`
	Period     int32             `json:"period"`
	Unit       string            `json:"unit"`
	Label      string            `json:"label"`
	Expression string            `json:"expression"`
}

type cloudWatchLogsQuery struct {
	QueryString   string   `json:"query"`
	LogGroup      string   `json:"log_group"`
	LogGroupNames []string `json:"log_group_names"`
	Limit         int32    `json:"limit"`
}

type timedMetricValue struct {
	timestamp time.Time
	value     float64
}

func NewCloudWatchClient(ds models.DataSource) (*CloudWatchClient, error) {
	cfg, err := parseCloudWatchConfig(ds.AuthConfig)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(cfg.Region) == "" {
		return nil, fmt.Errorf("cloudwatch region is required (set auth_config.region)")
	}

	return &CloudWatchClient{datasource: ds, cfg: cfg}, nil
}

func (c *CloudWatchClient) Query(ctx context.Context, query string, start, end time.Time, step time.Duration, limit int) (*QueryResult, error) {
	return c.QueryWithSignal(ctx, query, "metrics", start, end, step, limit)
}

func (c *CloudWatchClient) QueryWithSignal(ctx context.Context, query, signal string, start, end time.Time, step time.Duration, limit int) (*QueryResult, error) {
	normalizedSignal := strings.ToLower(strings.TrimSpace(signal))
	if normalizedSignal == "" {
		normalizedSignal = "metrics"
	}

	switch normalizedSignal {
	case "metrics":
		return c.queryMetrics(ctx, query, start, end, step)
	case "logs":
		return c.queryLogs(ctx, query, start, end, limit)
	default:
		return nil, fmt.Errorf("cloudwatch only supports metrics or logs signals")
	}
}

func (c *CloudWatchClient) TestConnection(ctx context.Context) error {
	awsCfg, err := c.awsConfig(ctx)
	if err != nil {
		return err
	}

	metricsClient := cloudwatch.NewFromConfig(awsCfg)
	logsClient := cloudwatchlogs.NewFromConfig(awsCfg)

	shouldCheckMetrics := c.cfg.MetricNamespace != "" || len(c.cfg.LogGroups) == 0
	if shouldCheckMetrics {
		namespace := c.cfg.MetricNamespace
		if namespace == "" {
			namespace = defaultCloudWatchNamespace
		}
		if _, err := metricsClient.ListMetrics(ctx, &cloudwatch.ListMetricsInput{
			Namespace: aws.String(namespace),
		}); err != nil {
			return fmt.Errorf("cloudwatch metrics connection test failed: %w", err)
		}
	}

	for _, groupName := range c.cfg.LogGroups {
		result, err := logsClient.DescribeLogGroups(ctx, &cloudwatchlogs.DescribeLogGroupsInput{
			LogGroupNamePrefix: aws.String(groupName),
			Limit:              aws.Int32(1),
		})
		if err != nil {
			return fmt.Errorf("cloudwatch logs connection test failed: %w", err)
		}

		if len(result.LogGroups) == 0 || aws.ToString(result.LogGroups[0].LogGroupName) != groupName {
			return fmt.Errorf("configured log group %q not found", groupName)
		}
	}

	return nil
}

func (c *CloudWatchClient) queryMetrics(ctx context.Context, query string, start, end time.Time, step time.Duration) (*QueryResult, error) {
	metricQuery, err := parseCloudWatchMetricQuery(query, c.cfg.MetricNamespace, step)
	if err != nil {
		return nil, err
	}

	awsCfg, err := c.awsConfig(ctx)
	if err != nil {
		return nil, err
	}

	client := cloudwatch.NewFromConfig(awsCfg)
	queryInput := cloudwatchtypes.MetricDataQuery{
		Id:         aws.String("m1"),
		ReturnData: aws.Bool(true),
	}

	label := strings.TrimSpace(metricQuery.Label)
	if label != "" {
		queryInput.Label = aws.String(label)
	}

	if strings.TrimSpace(metricQuery.Expression) != "" {
		queryInput.Expression = aws.String(strings.TrimSpace(metricQuery.Expression))
	} else {
		dimensions := make([]cloudwatchtypes.Dimension, 0, len(metricQuery.Dimensions))
		dimensionKeys := make([]string, 0, len(metricQuery.Dimensions))
		for key := range metricQuery.Dimensions {
			dimensionKeys = append(dimensionKeys, key)
		}
		sort.Strings(dimensionKeys)
		for _, key := range dimensionKeys {
			dimensions = append(dimensions, cloudwatchtypes.Dimension{
				Name:  aws.String(key),
				Value: aws.String(metricQuery.Dimensions[key]),
			})
		}

		metricStat := &cloudwatchtypes.MetricStat{
			Metric: &cloudwatchtypes.Metric{
				Namespace:  aws.String(metricQuery.Namespace),
				MetricName: aws.String(metricQuery.MetricName),
				Dimensions: dimensions,
			},
			Period: aws.Int32(metricQuery.Period),
			Stat:   aws.String(metricQuery.Stat),
		}
		if strings.TrimSpace(metricQuery.Unit) != "" {
			metricStat.Unit = cloudwatchtypes.StandardUnit(strings.TrimSpace(metricQuery.Unit))
		}

		queryInput.MetricStat = metricStat
	}

	request := &cloudwatch.GetMetricDataInput{
		MetricDataQueries: []cloudwatchtypes.MetricDataQuery{queryInput},
		StartTime:         aws.Time(start),
		EndTime:           aws.Time(end),
		ScanBy:            cloudwatchtypes.ScanByTimestampAscending,
	}

	response, err := client.GetMetricData(ctx, request)
	if err != nil {
		return nil, fmt.Errorf("cloudwatch metrics query failed: %w", err)
	}

	labels := map[string]string{}
	if metricQuery.MetricName != "" {
		labels["__name__"] = metricQuery.MetricName
		labels["metric_name"] = metricQuery.MetricName
		labels["namespace"] = metricQuery.Namespace
		labels["stat"] = metricQuery.Stat
		for key, value := range metricQuery.Dimensions {
			labels[key] = value
		}
	} else {
		labels["__name__"] = labelOrFallback(aws.ToString(queryInput.Label), "expression")
	}

	dataPoints := make([]timedMetricValue, 0)
	for _, result := range response.MetricDataResults {
		for idx, timestamp := range result.Timestamps {
			if idx >= len(result.Values) {
				continue
			}
			dataPoints = append(dataPoints, timedMetricValue{
				timestamp: timestamp,
				value:     result.Values[idx],
			})
		}
	}
	sort.Slice(dataPoints, func(i, j int) bool {
		return dataPoints[i].timestamp.Before(dataPoints[j].timestamp)
	})

	values := make([][]interface{}, 0, len(dataPoints))
	for _, point := range dataPoints {
		values = append(values, []interface{}{
			float64(point.timestamp.Unix()),
			strconv.FormatFloat(point.value, 'f', -1, 64),
		})
	}

	return &QueryResult{
		Status:     "success",
		ResultType: "metrics",
		Data: &QueryData{
			ResultType: "matrix",
			Result: []MetricResult{
				{
					Metric: labels,
					Values: values,
				},
			},
		},
	}, nil
}

func (c *CloudWatchClient) queryLogs(ctx context.Context, query string, start, end time.Time, limit int) (*QueryResult, error) {
	logsQuery, err := parseCloudWatchLogsQuery(query, c.cfg.LogGroups, limit)
	if err != nil {
		return nil, err
	}

	awsCfg, err := c.awsConfig(ctx)
	if err != nil {
		return nil, err
	}

	client := cloudwatchlogs.NewFromConfig(awsCfg)
	startInput := &cloudwatchlogs.StartQueryInput{
		StartTime:   aws.Int64(start.Unix()),
		EndTime:     aws.Int64(end.Unix()),
		QueryString: aws.String(logsQuery.QueryString),
		Limit:       aws.Int32(logsQuery.Limit),
	}

	if len(logsQuery.LogGroupNames) == 1 {
		startInput.LogGroupName = aws.String(logsQuery.LogGroupNames[0])
	} else {
		startInput.LogGroupNames = logsQuery.LogGroupNames
	}

	startResult, err := client.StartQuery(ctx, startInput)
	if err != nil {
		return nil, fmt.Errorf("cloudwatch logs query failed: %w", err)
	}
	queryID := aws.ToString(startResult.QueryId)
	if queryID == "" {
		return nil, fmt.Errorf("cloudwatch logs query did not return a query id")
	}

	ticker := time.NewTicker(cloudWatchPollInterval)
	defer ticker.Stop()

	for {
		output, err := client.GetQueryResults(ctx, &cloudwatchlogs.GetQueryResultsInput{
			QueryId: aws.String(queryID),
		})
		if err != nil {
			return nil, fmt.Errorf("failed to fetch cloudwatch logs query results: %w", err)
		}

		switch output.Status {
		case cloudwatchlogstypes.QueryStatusComplete:
			return &QueryResult{
				Status:     "success",
				ResultType: "logs",
				Data: &QueryData{
					ResultType: "streams",
					Logs:       parseCloudWatchLogResults(output.Results),
				},
			}, nil
		case cloudwatchlogstypes.QueryStatusFailed:
			return nil, fmt.Errorf("cloudwatch logs query failed")
		case cloudwatchlogstypes.QueryStatusCancelled:
			return nil, fmt.Errorf("cloudwatch logs query was cancelled")
		case cloudwatchlogstypes.QueryStatusTimeout:
			return nil, fmt.Errorf("cloudwatch logs query timed out")
		case cloudwatchlogstypes.QueryStatusRunning, cloudwatchlogstypes.QueryStatusScheduled, cloudwatchlogstypes.QueryStatusUnknown:
			// Keep polling.
		}

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-ticker.C:
		}
	}
}

func (c *CloudWatchClient) awsConfig(ctx context.Context) (aws.Config, error) {
	loadOptions := []func(*awsconfig.LoadOptions) error{
		awsconfig.WithRegion(c.cfg.Region),
	}

	if strings.TrimSpace(c.cfg.AccessKeyID) != "" || strings.TrimSpace(c.cfg.SecretAccessKey) != "" {
		if strings.TrimSpace(c.cfg.AccessKeyID) == "" || strings.TrimSpace(c.cfg.SecretAccessKey) == "" {
			return aws.Config{}, fmt.Errorf("cloudwatch auth_config requires both access_key_id and secret_access_key")
		}
		loadOptions = append(loadOptions, awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			c.cfg.AccessKeyID,
			c.cfg.SecretAccessKey,
			c.cfg.SessionToken,
		)))
	}

	cfg, err := awsconfig.LoadDefaultConfig(ctx, loadOptions...)
	if err != nil {
		return aws.Config{}, fmt.Errorf("failed to load aws config: %w", err)
	}
	return cfg, nil
}

func parseCloudWatchConfig(authConfig json.RawMessage) (cloudWatchConfig, error) {
	if len(authConfig) == 0 {
		return cloudWatchConfig{}, nil
	}

	raw := map[string]any{}
	if err := json.Unmarshal(authConfig, &raw); err != nil {
		return cloudWatchConfig{}, fmt.Errorf("invalid cloudwatch auth_config: %w", err)
	}

	cfg := cloudWatchConfig{
		Region:          getMapString(raw, "region"),
		AccessKeyID:     getMapString(raw, "access_key_id", "accessKeyId"),
		SecretAccessKey: getMapString(raw, "secret_access_key", "secretAccessKey"),
		SessionToken:    getMapString(raw, "session_token", "sessionToken"),
		MetricNamespace: getMapString(raw, "metric_namespace", "metricNamespace"),
		LogGroups:       getMapStringSlice(raw, "log_group_names", "logGroupNames", "log_groups"),
	}

	if singleGroup := getMapString(raw, "log_group", "logGroup"); singleGroup != "" {
		cfg.LogGroups = append(cfg.LogGroups, singleGroup)
	}

	cfg.LogGroups = dedupeNonEmptyStrings(cfg.LogGroups)
	return cfg, nil
}

func parseCloudWatchMetricQuery(query, defaultNamespace string, step time.Duration) (cloudWatchMetricQuery, error) {
	trimmed := strings.TrimSpace(query)
	if trimmed == "" {
		return cloudWatchMetricQuery{}, fmt.Errorf("query is required")
	}

	if strings.HasPrefix(trimmed, "{") {
		metricQuery := cloudWatchMetricQuery{}
		if err := json.Unmarshal([]byte(trimmed), &metricQuery); err != nil {
			return cloudWatchMetricQuery{}, fmt.Errorf("invalid cloudwatch metrics query JSON: %w", err)
		}
		normalizeCloudWatchMetricQuery(&metricQuery, defaultNamespace, step)
		if err := validateCloudWatchMetricQuery(metricQuery); err != nil {
			return cloudWatchMetricQuery{}, err
		}
		return metricQuery, nil
	}

	namespace := strings.TrimSpace(defaultNamespace)
	if namespace == "" {
		namespace = defaultCloudWatchNamespace
	}
	metricName := trimmed
	if strings.Contains(trimmed, ":") {
		parts := strings.SplitN(trimmed, ":", 2)
		ns := strings.TrimSpace(parts[0])
		name := strings.TrimSpace(parts[1])
		if ns != "" {
			namespace = ns
		}
		if name != "" {
			metricName = name
		}
	}

	metricQuery := cloudWatchMetricQuery{
		Namespace:  namespace,
		MetricName: metricName,
		Stat:       "Average",
		Period:     cloudWatchPeriodFromStep(step),
		Dimensions: map[string]string{},
	}
	if err := validateCloudWatchMetricQuery(metricQuery); err != nil {
		return cloudWatchMetricQuery{}, err
	}
	return metricQuery, nil
}

func parseCloudWatchLogsQuery(query string, defaultLogGroups []string, limit int) (cloudWatchLogsQuery, error) {
	trimmed := strings.TrimSpace(query)
	if trimmed == "" {
		return cloudWatchLogsQuery{}, fmt.Errorf("query is required")
	}

	logsQuery := cloudWatchLogsQuery{
		QueryString:   trimmed,
		LogGroupNames: append([]string(nil), defaultLogGroups...),
		Limit:         int32(clampCloudWatchLimit(limit, 1000)),
	}

	if strings.HasPrefix(trimmed, "{") {
		if err := json.Unmarshal([]byte(trimmed), &logsQuery); err != nil {
			return cloudWatchLogsQuery{}, fmt.Errorf("invalid cloudwatch logs query JSON: %w", err)
		}
	}

	logsQuery.QueryString = strings.TrimSpace(logsQuery.QueryString)
	if logsQuery.QueryString == "" {
		return cloudWatchLogsQuery{}, fmt.Errorf("cloudwatch logs query string is required")
	}

	if logsQuery.LogGroup != "" {
		logsQuery.LogGroupNames = append(logsQuery.LogGroupNames, logsQuery.LogGroup)
	}
	logsQuery.LogGroupNames = dedupeNonEmptyStrings(logsQuery.LogGroupNames)
	if len(logsQuery.LogGroupNames) == 0 {
		return cloudWatchLogsQuery{}, fmt.Errorf("cloudwatch logs queries require at least one log group (set auth_config.log_group)")
	}

	logsQuery.Limit = int32(clampCloudWatchLimit(int(logsQuery.Limit), 1000))
	return logsQuery, nil
}

func parseCloudWatchLogResults(rows [][]cloudwatchlogstypes.ResultField) []LogEntry {
	entries := make([]LogEntry, 0, len(rows))
	for _, row := range rows {
		values := map[string]string{}
		for _, field := range row {
			name := strings.TrimSpace(aws.ToString(field.Field))
			if name == "" {
				continue
			}
			values[name] = aws.ToString(field.Value)
		}

		timestamp := normalizeCloudWatchTimestamp(values["@timestamp"])
		if timestamp == "" {
			timestamp = normalizeCloudWatchTimestamp(values["timestamp"])
		}
		if timestamp == "" {
			timestamp = time.Now().UTC().Format(time.RFC3339Nano)
		}

		line := strings.TrimSpace(values["@message"])
		if line == "" {
			line = strings.TrimSpace(values["message"])
		}
		if line == "" {
			line = "(empty log message)"
		}

		labels := map[string]string{}
		for key, value := range values {
			if key == "@message" || key == "message" || key == "@timestamp" || key == "timestamp" || key == "@ptr" {
				continue
			}
			trimmedValue := strings.TrimSpace(value)
			if trimmedValue != "" {
				labels[key] = trimmedValue
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
		return entries[i].Timestamp < entries[j].Timestamp
	})
	return entries
}

func validateCloudWatchMetricQuery(query cloudWatchMetricQuery) error {
	if strings.TrimSpace(query.Expression) == "" {
		if strings.TrimSpace(query.MetricName) == "" {
			return fmt.Errorf("cloudwatch metric_name is required")
		}
		if strings.TrimSpace(query.Namespace) == "" {
			return fmt.Errorf("cloudwatch namespace is required")
		}
	}

	if query.Period < 1 {
		return fmt.Errorf("cloudwatch period must be greater than 0")
	}
	if strings.TrimSpace(query.Stat) == "" {
		return fmt.Errorf("cloudwatch stat is required")
	}
	return nil
}

func normalizeCloudWatchMetricQuery(query *cloudWatchMetricQuery, defaultNamespace string, step time.Duration) {
	query.Namespace = strings.TrimSpace(query.Namespace)
	if query.Namespace == "" {
		query.Namespace = strings.TrimSpace(defaultNamespace)
	}
	if query.Namespace == "" {
		query.Namespace = defaultCloudWatchNamespace
	}

	query.MetricName = strings.TrimSpace(query.MetricName)
	query.Stat = strings.TrimSpace(query.Stat)
	if query.Stat == "" {
		query.Stat = "Average"
	}

	if query.Period <= 0 {
		query.Period = cloudWatchPeriodFromStep(step)
	}
	if query.Dimensions == nil {
		query.Dimensions = map[string]string{}
	}
}

func cloudWatchPeriodFromStep(step time.Duration) int32 {
	if step <= 0 {
		return 60
	}
	seconds := int32(step / time.Second)
	if seconds <= 0 {
		return 60
	}
	if seconds < 60 {
		return 60
	}
	return seconds
}

func clampCloudWatchLimit(limit, fallback int) int {
	if limit <= 0 {
		return fallback
	}
	if limit > 10000 {
		return 10000
	}
	return limit
}

func normalizeCloudWatchTimestamp(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}

	if parsed, err := time.Parse(time.RFC3339Nano, trimmed); err == nil {
		return parsed.UTC().Format(time.RFC3339Nano)
	}

	if unixSeconds, err := strconv.ParseFloat(trimmed, 64); err == nil {
		seconds := int64(unixSeconds)
		nanos := int64((unixSeconds - float64(seconds)) * float64(time.Second))
		return time.Unix(seconds, nanos).UTC().Format(time.RFC3339Nano)
	}

	if unixMillis, err := strconv.ParseInt(trimmed, 10, 64); err == nil {
		if unixMillis > 1_000_000_000_000 {
			return time.UnixMilli(unixMillis).UTC().Format(time.RFC3339Nano)
		}
		return time.Unix(unixMillis, 0).UTC().Format(time.RFC3339Nano)
	}

	return trimmed
}

func labelOrFallback(label, fallback string) string {
	trimmed := strings.TrimSpace(label)
	if trimmed == "" {
		return fallback
	}
	return trimmed
}

func getMapString(raw map[string]any, keys ...string) string {
	for _, key := range keys {
		value, ok := raw[key]
		if !ok {
			continue
		}
		switch typed := value.(type) {
		case string:
			trimmed := strings.TrimSpace(typed)
			if trimmed != "" {
				return trimmed
			}
		}
	}
	return ""
}

func getMapStringSlice(raw map[string]any, keys ...string) []string {
	for _, key := range keys {
		value, ok := raw[key]
		if !ok {
			continue
		}
		switch typed := value.(type) {
		case []any:
			values := make([]string, 0, len(typed))
			for _, item := range typed {
				if asString, ok := item.(string); ok {
					trimmed := strings.TrimSpace(asString)
					if trimmed != "" {
						values = append(values, trimmed)
					}
				}
			}
			if len(values) > 0 {
				return values
			}
		case []string:
			values := make([]string, 0, len(typed))
			for _, item := range typed {
				trimmed := strings.TrimSpace(item)
				if trimmed != "" {
					values = append(values, trimmed)
				}
			}
			if len(values) > 0 {
				return values
			}
		case string:
			if strings.TrimSpace(typed) == "" {
				continue
			}
			parts := strings.Split(typed, ",")
			values := make([]string, 0, len(parts))
			for _, part := range parts {
				trimmed := strings.TrimSpace(part)
				if trimmed != "" {
					values = append(values, trimmed)
				}
			}
			if len(values) > 0 {
				return values
			}
		}
	}
	return nil
}

func dedupeNonEmptyStrings(values []string) []string {
	if len(values) == 0 {
		return nil
	}

	seen := map[string]struct{}{}
	result := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, exists := seen[trimmed]; exists {
			continue
		}
		seen[trimmed] = struct{}{}
		result = append(result, trimmed)
	}
	if len(result) == 0 {
		return nil
	}
	return result
}
