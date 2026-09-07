module github.com/aceobservability/ace/backend

go 1.26.0

require (
	github.com/aceobservability/ace-datasource-alertmanager v0.0.0-20260906163148-8d3946559cb3
	github.com/aceobservability/ace-datasource-clickhouse v0.0.0-20260906163719-50ae73a9eb08
	github.com/aceobservability/ace-datasource-cloudwatch v0.0.0-20260906172818-0294316bc790
	github.com/aceobservability/ace-datasource-elasticsearch v0.0.0-20260906164000-5cbd818f642b
	github.com/aceobservability/ace-datasource-loki v0.0.0-20260906165404-06f9efcc1ccd
	github.com/aceobservability/ace-datasource-prometheus v0.0.0-20260906152221-4b460476c203
	github.com/aceobservability/ace-datasource-tempo v0.0.0-20260906164218-da3c9ddea61f
	github.com/aceobservability/ace-datasource-victorialogs v0.0.0-20260906163240-46d9e35fff09
	github.com/aceobservability/ace-datasource-victoriametrics v0.0.0-20260906162925-9dc8e06dd775
	github.com/aceobservability/ace-datasource-victoriatraces v0.0.0-20260906164712-a7913246854f
	github.com/aceobservability/ace-datasource-vmalert v0.0.0-20260906163020-2b639522df8e
	github.com/aceobservability/ace-llm-anthropic v0.0.0-20260906160347-542e9f4acdea
	github.com/aceobservability/ace-llm-copilot v0.0.0-20260906163911-724e3d6190ac
	github.com/aceobservability/ace-llm-openai-compat v0.0.0-20260906163134-4077ef660565
	github.com/alicebob/miniredis/v2 v2.38.0
	github.com/coreos/go-oidc/v3 v3.20.0
	github.com/golang-jwt/jwt/v5 v5.3.1
	github.com/google/uuid v1.6.0
	github.com/gorilla/websocket v1.5.3
	github.com/jackc/pgx/v5 v5.10.0
	github.com/modelcontextprotocol/go-sdk v1.7.0
	github.com/posthog/posthog-go v1.25.1
	github.com/redis/go-redis/v9 v9.22.0
	go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp v0.71.0
	go.opentelemetry.io/otel v1.46.0
	go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp v1.46.0
	go.opentelemetry.io/otel/sdk v1.46.0
	go.opentelemetry.io/otel/trace v1.46.0
	go.uber.org/zap v1.28.0
	go.yaml.in/yaml/v2 v2.4.4
	golang.org/x/crypto v0.56.0
	golang.org/x/oauth2 v0.36.0
)

require (
	cloud.google.com/go/compute/metadata v0.9.0 // indirect
	github.com/andybalholm/brotli v1.1.1 // indirect
	github.com/aws/aws-sdk-go-v2 v1.45.1 // indirect
	github.com/aws/aws-sdk-go-v2/aws/protocol/eventstream v1.7.20 // indirect
	github.com/aws/aws-sdk-go-v2/config v1.33.2 // indirect
	github.com/aws/aws-sdk-go-v2/credentials v1.20.2 // indirect
	github.com/aws/aws-sdk-go-v2/feature/ec2/imds v1.19.1 // indirect
	github.com/aws/aws-sdk-go-v2/internal/configsources v1.5.1 // indirect
	github.com/aws/aws-sdk-go-v2/internal/endpoints/v2 v2.8.1 // indirect
	github.com/aws/aws-sdk-go-v2/internal/v4a v1.5.1 // indirect
	github.com/aws/aws-sdk-go-v2/service/cloudwatch v1.69.1 // indirect
	github.com/aws/aws-sdk-go-v2/service/cloudwatchlogs v1.85.0 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/accept-encoding v1.13.19 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/presigned-url v1.14.1 // indirect
	github.com/aws/aws-sdk-go-v2/service/signin v1.8.0 // indirect
	github.com/aws/aws-sdk-go-v2/service/sso v1.36.0 // indirect
	github.com/aws/aws-sdk-go-v2/service/ssooidc v1.41.0 // indirect
	github.com/aws/aws-sdk-go-v2/service/sts v1.48.0 // indirect
	github.com/aws/smithy-go v1.28.1 // indirect
	github.com/cenkalti/backoff/v5 v5.0.3 // indirect
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/felixge/httpsnoop v1.1.0 // indirect
	github.com/go-jose/go-jose/v4 v4.1.4 // indirect
	github.com/go-logr/logr v1.4.4 // indirect
	github.com/go-logr/stdr v1.2.2 // indirect
	github.com/goccy/go-json v0.10.6 // indirect
	github.com/google/jsonschema-go v0.4.3 // indirect
	github.com/grpc-ecosystem/grpc-gateway/v2 v2.30.0 // indirect
	github.com/hashicorp/golang-lru/v2 v2.0.7 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	github.com/json-iterator/go v1.1.12 // indirect
	github.com/klauspost/compress v1.19.1 // indirect
	github.com/modern-go/concurrent v0.0.0-20180306012644-bacd9c7ef1dd // indirect
	github.com/modern-go/reflect2 v1.0.2 // indirect
	github.com/prometheus/client_golang v1.24.1 // indirect
	github.com/prometheus/client_model v0.6.2 // indirect
	github.com/prometheus/common v0.70.1 // indirect
	github.com/segmentio/asm v1.1.3 // indirect
	github.com/segmentio/encoding v0.5.4 // indirect
	github.com/yosida95/uritemplate/v3 v3.0.2 // indirect
	github.com/yuin/gopher-lua v1.1.1 // indirect
	go.opentelemetry.io/auto/sdk v1.2.1 // indirect
	go.opentelemetry.io/otel/exporters/otlp/otlptrace v1.46.0 // indirect
	go.opentelemetry.io/otel/metric v1.46.0 // indirect
	go.opentelemetry.io/proto/otlp v1.11.0 // indirect
	go.uber.org/atomic v1.11.0 // indirect
	go.uber.org/multierr v1.10.0 // indirect
	golang.org/x/net v0.58.0 // indirect
	golang.org/x/sync v0.22.0 // indirect
	golang.org/x/sys v0.47.0 // indirect
	golang.org/x/text v0.41.0 // indirect
	golang.org/x/time v0.15.0 // indirect
	google.golang.org/genproto/googleapis/api v0.0.0-20260819154853-08b0e4226688 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20260819154853-08b0e4226688 // indirect
	google.golang.org/grpc v1.83.1 // indirect
	google.golang.org/protobuf v1.36.12 // indirect
)
