package telemetry

import (
	"context"
	"net/url"
	"os"
	"strings"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

const (
	defaultOTLPEndpoint = "localhost:4318"
	defaultServiceName  = "ace-backend"
	defaultEnvironment  = "development"
)

// Setup configures OpenTelemetry tracing from environment variables.
//
// Supported variables:
//   - OTEL_ENABLED (default: true)
//   - OTEL_EXPORTER_OTLP_ENDPOINT (default: localhost:4318)
//   - OTEL_SERVICE_NAME (default: ace-backend)
//   - OTEL_ENVIRONMENT (default: development)
func Setup(ctx context.Context) (func(context.Context) error, error) {
	if !enabledFromEnv() {
		return func(context.Context) error { return nil }, nil
	}

	exporter, err := otlptracehttp.New(
		ctx,
		otlptracehttp.WithEndpoint(normalizeEndpoint(envOrDefault("OTEL_EXPORTER_OTLP_ENDPOINT", defaultOTLPEndpoint))),
		otlptracehttp.WithInsecure(),
	)
	if err != nil {
		return nil, err
	}

	res, err := resource.New(
		ctx,
		resource.WithAttributes(
			attribute.String("service.name", envOrDefault("OTEL_SERVICE_NAME", defaultServiceName)),
			attribute.String("deployment.environment", envOrDefault("OTEL_ENVIRONMENT", defaultEnvironment)),
		),
	)
	if err != nil {
		return nil, err
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
	)

	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(
		propagation.NewCompositeTextMapPropagator(
			propagation.TraceContext{},
			propagation.Baggage{},
		),
	)

	return tp.Shutdown, nil
}

func enabledFromEnv() bool {
	raw := strings.ToLower(strings.TrimSpace(os.Getenv("OTEL_ENABLED")))

	switch raw {
	case "", "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return true
	}
}

func envOrDefault(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	return value
}

func normalizeEndpoint(endpoint string) string {
	trimmed := strings.TrimSpace(endpoint)
	if trimmed == "" {
		return defaultOTLPEndpoint
	}

	if strings.HasPrefix(trimmed, "http://") || strings.HasPrefix(trimmed, "https://") {
		parsed, err := url.Parse(trimmed)
		if err == nil && parsed.Host != "" {
			return parsed.Host
		}
	}

	return trimmed
}
