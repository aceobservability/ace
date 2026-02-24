package telemetry

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

const maxSQLStatementLength = 512

// PGXTracer emits OpenTelemetry spans for pgx queries.
type PGXTracer struct {
	tracer trace.Tracer
}

func NewPGXTracer() *PGXTracer {
	return &PGXTracer{tracer: otel.Tracer("ace.db")}
}

func (t *PGXTracer) TraceQueryStart(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryStartData) context.Context {
	statement := normalizeSQL(data.SQL)
	operation := sqlOperation(statement)

	attributes := []attribute.KeyValue{attribute.String("db.system", "postgresql")}
	if operation != "" {
		attributes = append(attributes, attribute.String("db.operation", operation))
	}
	if statement != "" {
		attributes = append(attributes, attribute.String("db.statement", truncate(statement, maxSQLStatementLength)))
	}

	spanName := "db.query"
	if operation != "" {
		spanName = "db.query " + strings.ToLower(operation)
	}

	ctx, _ = t.tracer.Start(ctx, spanName, trace.WithSpanKind(trace.SpanKindClient), trace.WithAttributes(attributes...))
	return ctx
}

func (t *PGXTracer) TraceQueryEnd(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryEndData) {
	span := trace.SpanFromContext(ctx)
	if data.Err != nil {
		span.RecordError(data.Err)
		span.SetStatus(codes.Error, data.Err.Error())
	}
	span.End()
}

func (t *PGXTracer) TraceBatchStart(ctx context.Context, _ *pgx.Conn, _ pgx.TraceBatchStartData) context.Context {
	ctx, _ = t.tracer.Start(ctx, "db.batch", trace.WithSpanKind(trace.SpanKindClient), trace.WithAttributes(
		attribute.String("db.system", "postgresql"),
	))
	return ctx
}

func (t *PGXTracer) TraceBatchQuery(ctx context.Context, _ *pgx.Conn, data pgx.TraceBatchQueryData) {
	statement := normalizeSQL(data.SQL)
	if statement == "" {
		return
	}

	span := trace.SpanFromContext(ctx)
	span.AddEvent("db.batch.query", trace.WithAttributes(
		attribute.String("db.statement", truncate(statement, maxSQLStatementLength)),
	))
	if data.Err != nil {
		span.RecordError(data.Err)
		span.SetStatus(codes.Error, data.Err.Error())
	}
}

func (t *PGXTracer) TraceBatchEnd(ctx context.Context, _ *pgx.Conn, data pgx.TraceBatchEndData) {
	span := trace.SpanFromContext(ctx)
	if data.Err != nil {
		span.RecordError(data.Err)
		span.SetStatus(codes.Error, data.Err.Error())
	}
	span.End()
}

func normalizeSQL(query string) string {
	parts := strings.Fields(query)
	return strings.TrimSpace(strings.Join(parts, " "))
}

func sqlOperation(statement string) string {
	if statement == "" {
		return ""
	}

	parts := strings.Fields(statement)
	if len(parts) == 0 {
		return ""
	}

	return strings.ToUpper(parts[0])
}

func truncate(value string, maxLength int) string {
	if maxLength <= 0 {
		return ""
	}

	if len(value) <= maxLength {
		return value
	}

	return value[:maxLength]
}
