package auth

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"
)

// Context keys for user information
type contextKey string

const (
	UserIDKey    contextKey = "user_id"
	UserEmailKey contextKey = "user_email"
	UserNameKey  contextKey = "user_name"
	IPAddressKey contextKey = "ip_address"
)

// AuthMiddleware creates middleware that validates JWT tokens
func AuthMiddleware(jwtManager *JWTManager) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				http.Error(w, `{"error":"authorization header required"}`, http.StatusUnauthorized)
				return
			}

			// Extract Bearer token
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
				http.Error(w, `{"error":"invalid authorization header format"}`, http.StatusUnauthorized)
				return
			}

			tokenString := parts[1]

			// Verify token
			claims, err := jwtManager.VerifyAccessToken(tokenString)
			if err != nil {
				if err == ErrExpiredToken {
					http.Error(w, `{"error":"token has expired"}`, http.StatusUnauthorized)
					return
				}
				http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
				return
			}

			// Add user info to context
			ctx := context.WithValue(r.Context(), UserIDKey, claims.UserID)
			ctx = context.WithValue(ctx, UserEmailKey, claims.Email)
			ctx = context.WithValue(ctx, UserNameKey, claims.Name)

			ip := r.RemoteAddr
			if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
				ip = strings.Split(fwd, ",")[0]
			}
			ctx = context.WithValue(ctx, IPAddressKey, strings.TrimSpace(ip))

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetUserID extracts the user ID from context
func GetUserID(ctx context.Context) (uuid.UUID, bool) {
	userID, ok := ctx.Value(UserIDKey).(uuid.UUID)
	return userID, ok
}

// GetUserEmail extracts the user email from context
func GetUserEmail(ctx context.Context) (string, bool) {
	email, ok := ctx.Value(UserEmailKey).(string)
	return email, ok
}

// GetUserName extracts the user name from context
func GetUserName(ctx context.Context) (string, bool) {
	name, ok := ctx.Value(UserNameKey).(string)
	return name, ok
}

// GetIPAddress extracts the client IP address from context
func GetIPAddress(ctx context.Context) string {
	ip, _ := ctx.Value(IPAddressKey).(string)
	return ip
}

// RequireAuth wraps a handler function to require authentication
func RequireAuth(jwtManager *JWTManager, handler http.HandlerFunc) http.HandlerFunc {
	middleware := AuthMiddleware(jwtManager)
	return func(w http.ResponseWriter, r *http.Request) {
		middleware(handler).ServeHTTP(w, r)
	}
}
