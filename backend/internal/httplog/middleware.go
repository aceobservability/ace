package httplog

import (
	"net/http"
	"strings"
	"time"

	"go.opentelemetry.io/otel/trace"
	"go.uber.org/zap"
)

// responseWriter wraps http.ResponseWriter to capture the status code and
// bytes written for logging after the handler completes.
type responseWriter struct {
	http.ResponseWriter
	statusCode   int
	bytesWritten int
	wroteHeader  bool
}

func (rw *responseWriter) WriteHeader(code int) {
	if rw.wroteHeader {
		rw.ResponseWriter.WriteHeader(code) // delegate so stdlib warning is still emitted
		return
	}
	rw.wroteHeader = true
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

func (rw *responseWriter) Write(b []byte) (int, error) {
	n, err := rw.ResponseWriter.Write(b)
	rw.bytesWritten += n
	return n, err
}

// Flush delegates to the underlying ResponseWriter if it implements http.Flusher.
// Required for SSE streaming handlers.
func (rw *responseWriter) Flush() {
	if f, ok := rw.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// Unwrap returns the underlying ResponseWriter for http.ResponseController compatibility.
func (rw *responseWriter) Unwrap() http.ResponseWriter {
	return rw.ResponseWriter
}

// NewMiddleware returns HTTP middleware that logs every request after the handler
// completes. It skips health checks and OPTIONS preflight requests.
func NewMiddleware(logger *zap.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip health checks and CORS preflight
			if (r.Method == http.MethodGet && r.URL.Path == "/api/health") || r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}

			start := time.Now()
			rw := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}

			next.ServeHTTP(rw, r)

			duration := time.Since(start)

			fields := []zap.Field{
				zap.String("method", r.Method),
				zap.String("path", r.URL.Path),
				zap.Int("status", rw.statusCode),
				zap.Duration("duration", duration),
				zap.Int("bytes", rw.bytesWritten),
				zap.String("ip", sanitize(clientIP(r))),
				zap.String("user_agent", sanitize(r.Header.Get("User-Agent"))),
			}

			// Include OTEL trace ID if a span exists in context
			if span := trace.SpanFromContext(r.Context()); span.SpanContext().HasTraceID() {
				fields = append(fields, zap.String("trace_id", span.SpanContext().TraceID().String()))
			}

			if rw.statusCode >= 500 {
				logger.Error("http request", fields...)
			} else {
				logger.Info("http request", fields...)
			}
		})
	}
}

// sanitize strips control characters (newlines, tabs, etc.) from a string
// to prevent log injection via user-controlled HTTP headers.
func sanitize(s string) string {
	return strings.Map(func(r rune) rune {
		if r < 0x20 { // control characters including \n, \r, \t
			return -1 // drop
		}
		return r
	}, s)
}

// clientIP extracts the client IP from the request, preferring
// X-Forwarded-For over RemoteAddr. NOTE: X-Forwarded-For is trusted
// unconditionally; this is only accurate when the load balancer strips
// or overwrites client-supplied XFF headers before forwarding.
func clientIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		return strings.TrimSpace(strings.Split(fwd, ",")[0])
	}
	return r.RemoteAddr
}
