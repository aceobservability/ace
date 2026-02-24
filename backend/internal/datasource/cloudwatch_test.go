package datasource

import (
	"encoding/json"
	"testing"
	"time"
)

func TestParseCloudWatchConfig(t *testing.T) {
	raw := json.RawMessage(`{
		"region": "us-east-1",
		"access_key_id": "AKIA123",
		"secret_access_key": "secret",
		"session_token": "token",
		"metric_namespace": "AWS/ApplicationELB",
		"log_group": "/aws/lambda/my-fn",
		"log_group_names": ["/aws/ecs/service-a", "/aws/ecs/service-b"]
	}`)

	cfg, err := parseCloudWatchConfig(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.Region != "us-east-1" {
		t.Fatalf("expected region us-east-1, got %q", cfg.Region)
	}
	if cfg.AccessKeyID != "AKIA123" {
		t.Fatalf("expected access key id to round-trip")
	}
	if cfg.SecretAccessKey != "secret" {
		t.Fatalf("expected secret access key to round-trip")
	}
	if cfg.SessionToken != "token" {
		t.Fatalf("expected session token to round-trip")
	}
	if cfg.MetricNamespace != "AWS/ApplicationELB" {
		t.Fatalf("expected metric namespace to round-trip")
	}
	if len(cfg.LogGroups) != 3 {
		t.Fatalf("expected 3 log groups, got %d", len(cfg.LogGroups))
	}
}

func TestParseCloudWatchMetricQuery_JSON(t *testing.T) {
	query, err := parseCloudWatchMetricQuery(`{
		"namespace":"AWS/EC2",
		"metric_name":"CPUUtilization",
		"dimensions":{"InstanceId":"i-123"},
		"stat":"Average",
		"period":60
	}`, "", 15*time.Second)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if query.Namespace != "AWS/EC2" {
		t.Fatalf("expected namespace AWS/EC2, got %q", query.Namespace)
	}
	if query.MetricName != "CPUUtilization" {
		t.Fatalf("expected metric name CPUUtilization, got %q", query.MetricName)
	}
	if query.Period != 60 {
		t.Fatalf("expected period 60, got %d", query.Period)
	}
	if query.Dimensions["InstanceId"] != "i-123" {
		t.Fatalf("expected dimension InstanceId=i-123")
	}
}

func TestParseCloudWatchMetricQuery_PlainString(t *testing.T) {
	query, err := parseCloudWatchMetricQuery("AWS/Lambda:Duration", "", 30*time.Second)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if query.Namespace != "AWS/Lambda" {
		t.Fatalf("expected namespace AWS/Lambda, got %q", query.Namespace)
	}
	if query.MetricName != "Duration" {
		t.Fatalf("expected metric name Duration, got %q", query.MetricName)
	}
	if query.Period != 60 {
		t.Fatalf("expected period to be clamped to 60, got %d", query.Period)
	}
}

func TestParseCloudWatchLogsQuery_UsesDefaultLogGroup(t *testing.T) {
	query, err := parseCloudWatchLogsQuery("fields @timestamp, @message | limit 20", []string{"/aws/lambda/my-fn"}, 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if query.QueryString == "" {
		t.Fatalf("expected query string")
	}
	if len(query.LogGroupNames) != 1 || query.LogGroupNames[0] != "/aws/lambda/my-fn" {
		t.Fatalf("expected default log group to be used, got %#v", query.LogGroupNames)
	}
	if query.Limit != 1000 {
		t.Fatalf("expected default limit 1000, got %d", query.Limit)
	}
}

func TestParseCloudWatchLogsQuery_RequiresLogGroup(t *testing.T) {
	_, err := parseCloudWatchLogsQuery("fields @timestamp", nil, 100)
	if err == nil {
		t.Fatalf("expected error when log groups are missing")
	}
}
