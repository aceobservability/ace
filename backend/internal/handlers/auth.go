package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/mail"
	"time"
	"unicode"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/janhoon/dash/backend/internal/analytics"
	"github.com/janhoon/dash/backend/internal/auth"
	"github.com/redis/go-redis/v9"
)

type AuthHandler struct {
	pool                *pgxpool.Pool
	jwtManager          *auth.JWTManager
	refreshTokenManager *auth.RefreshTokenManager
}

func NewAuthHandler(pool *pgxpool.Pool, jwtManager *auth.JWTManager, rdb *redis.Client) *AuthHandler {
	var rtm *auth.RefreshTokenManager
	if rdb != nil {
		rtm = auth.NewRefreshTokenManager(rdb)
	}
	return &AuthHandler{
		pool:                pool,
		jwtManager:          jwtManager,
		refreshTokenManager: rtm,
	}
}

// RegisterRequest represents the registration request body
type RegisterRequest struct {
	Email    string  `json:"email"`
	Password string  `json:"password"`
	Name     *string `json:"name,omitempty"`
}

// LoginRequest represents the login request body
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// AuthResponse represents the authentication response
type AuthResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token,omitempty"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
}

// RefreshRequest represents the token refresh request body
type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// UserResponse represents the user profile response
type UserResponse struct {
	ID        uuid.UUID                `json:"id"`
	Email     string                   `json:"email"`
	Name      *string                  `json:"name,omitempty"`
	CreatedAt time.Time                `json:"created_at"`
	Orgs      []OrganizationMembership `json:"organizations"`
}

// OrganizationMembership represents org membership in user response
type OrganizationMembership struct {
	OrganizationID   uuid.UUID `json:"organization_id"`
	OrganizationName string    `json:"organization_name"`
	OrganizationSlug string    `json:"organization_slug"`
	Role             string    `json:"role"`
}

// Register handles user registration
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Validate email
	if _, err := mail.ParseAddress(req.Email); err != nil {
		http.Error(w, `{"error":"invalid email address"}`, http.StatusBadRequest)
		return
	}

	// Validate password
	if err := validatePassword(req.Password); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	// Hash password
	passwordHash, err := auth.HashPassword(req.Password)
	if err != nil {
		http.Error(w, `{"error":"failed to process password"}`, http.StatusInternalServerError)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Check if user already exists
	var existingID uuid.UUID
	err = h.pool.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, req.Email).Scan(&existingID)
	if err == nil {
		http.Error(w, `{"error":"email already registered"}`, http.StatusConflict)
		return
	}
	if err != pgx.ErrNoRows {
		http.Error(w, `{"error":"failed to check existing user"}`, http.StatusInternalServerError)
		return
	}

	// Create user
	var userID uuid.UUID
	var userEmail string
	var userName *string
	err = h.pool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash, name)
		 VALUES ($1, $2, $3)
		 RETURNING id, email, name`,
		req.Email, passwordHash, req.Name,
	).Scan(&userID, &userEmail, &userName)

	if err != nil {
		http.Error(w, `{"error":"failed to create user"}`, http.StatusInternalServerError)
		return
	}

	// Generate JWT
	name := ""
	if userName != nil {
		name = *userName
	}
	accessToken, err := h.jwtManager.GenerateAccessToken(userID, userEmail, name)
	if err != nil {
		http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	response := AuthResponse{
		AccessToken: accessToken,
		TokenType:   "Bearer",
		ExpiresIn:   900, // 15 minutes in seconds
	}

	// Generate refresh token if manager is available
	if h.refreshTokenManager != nil {
		refreshToken, err := auth.GenerateRefreshToken()
		if err != nil {
			http.Error(w, `{"error":"failed to generate refresh token"}`, http.StatusInternalServerError)
			return
		}

		if err := h.refreshTokenManager.StoreRefreshToken(ctx, refreshToken, userID, userEmail, name); err != nil {
			http.Error(w, `{"error":"failed to store refresh token"}`, http.StatusInternalServerError)
			return
		}

		response.RefreshToken = refreshToken
	}

	analytics.Track(r.Context(), analytics.Event{
		DistinctID: userID.String(),
		Name:       "auth_signup",
		OptOut:     analytics.RequestOptedOut(r),
		Properties: map[string]any{
			"user_id":           userID.String(),
			"email":             userEmail,
			"auth_method":       "password",
			"has_refresh_token": response.RefreshToken != "",
		},
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

// Login handles user login
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Email == "" || req.Password == "" {
		http.Error(w, `{"error":"email and password are required"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Find user by email
	var userID uuid.UUID
	var userEmail string
	var passwordHash *string
	var userName *string

	err := h.pool.QueryRow(ctx,
		`SELECT id, email, password_hash, name FROM users WHERE email = $1`,
		req.Email,
	).Scan(&userID, &userEmail, &passwordHash, &userName)

	if err == pgx.ErrNoRows {
		http.Error(w, `{"error":"invalid credentials"}`, http.StatusUnauthorized)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"failed to find user"}`, http.StatusInternalServerError)
		return
	}

	// Check if user has password auth (might be SSO-only)
	if passwordHash == nil {
		http.Error(w, `{"error":"invalid credentials"}`, http.StatusUnauthorized)
		return
	}

	// Verify password
	valid, err := auth.VerifyPassword(req.Password, *passwordHash)
	if err != nil || !valid {
		http.Error(w, `{"error":"invalid credentials"}`, http.StatusUnauthorized)
		return
	}

	// Generate JWT
	name := ""
	if userName != nil {
		name = *userName
	}
	accessToken, err := h.jwtManager.GenerateAccessToken(userID, userEmail, name)
	if err != nil {
		http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	response := AuthResponse{
		AccessToken: accessToken,
		TokenType:   "Bearer",
		ExpiresIn:   900, // 15 minutes in seconds
	}

	// Generate refresh token if manager is available
	if h.refreshTokenManager != nil {
		refreshToken, err := auth.GenerateRefreshToken()
		if err != nil {
			http.Error(w, `{"error":"failed to generate refresh token"}`, http.StatusInternalServerError)
			return
		}

		if err := h.refreshTokenManager.StoreRefreshToken(ctx, refreshToken, userID, userEmail, name); err != nil {
			http.Error(w, `{"error":"failed to store refresh token"}`, http.StatusInternalServerError)
			return
		}

		response.RefreshToken = refreshToken
	}

	analytics.Track(r.Context(), analytics.Event{
		DistinctID: userID.String(),
		Name:       "auth_login",
		OptOut:     analytics.RequestOptedOut(r),
		Properties: map[string]any{
			"user_id":           userID.String(),
			"email":             userEmail,
			"auth_method":       "password",
			"has_refresh_token": response.RefreshToken != "",
		},
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Me returns the current user's profile
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Get user
	var user UserResponse
	err := h.pool.QueryRow(ctx,
		`SELECT id, email, name, created_at FROM users WHERE id = $1`,
		userID,
	).Scan(&user.ID, &user.Email, &user.Name, &user.CreatedAt)

	if err == pgx.ErrNoRows {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"failed to get user"}`, http.StatusInternalServerError)
		return
	}

	// Get organization memberships
	rows, err := h.pool.Query(ctx,
		`SELECT o.id, o.name, o.slug, om.role
		 FROM organization_memberships om
		 JOIN organizations o ON o.id = om.organization_id
		 WHERE om.user_id = $1
		 ORDER BY o.name`,
		userID,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to get organizations"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	user.Orgs = []OrganizationMembership{}
	for rows.Next() {
		var membership OrganizationMembership
		if err := rows.Scan(&membership.OrganizationID, &membership.OrganizationName,
			&membership.OrganizationSlug, &membership.Role); err != nil {
			http.Error(w, `{"error":"failed to scan organization"}`, http.StatusInternalServerError)
			return
		}
		user.Orgs = append(user.Orgs, membership)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

// GetJWTManager returns the JWT manager for use by other handlers
func (h *AuthHandler) GetJWTManager() *auth.JWTManager {
	return h.jwtManager
}

// Refresh handles token refresh using a refresh token
func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	if h.refreshTokenManager == nil {
		http.Error(w, `{"error":"refresh tokens not enabled"}`, http.StatusNotImplemented)
		return
	}

	var req RefreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.RefreshToken == "" {
		http.Error(w, `{"error":"refresh_token is required"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Rotate the refresh token (invalidates old, creates new)
	newRefreshToken, data, err := h.refreshTokenManager.RotateRefreshToken(ctx, req.RefreshToken)
	if err != nil {
		if err == auth.ErrInvalidRefreshToken {
			http.Error(w, `{"error":"invalid refresh token"}`, http.StatusUnauthorized)
			return
		}
		http.Error(w, `{"error":"failed to refresh token"}`, http.StatusInternalServerError)
		return
	}

	// Generate new access token
	accessToken, err := h.jwtManager.GenerateAccessToken(data.UserID, data.Email, data.Name)
	if err != nil {
		http.Error(w, `{"error":"failed to generate access token"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: newRefreshToken,
		TokenType:    "Bearer",
		ExpiresIn:    900, // 15 minutes
	})
}

// Logout revokes the current refresh token
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	if h.refreshTokenManager == nil {
		http.Error(w, `{"error":"refresh tokens not enabled"}`, http.StatusNotImplemented)
		return
	}

	var req RefreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.RefreshToken == "" {
		http.Error(w, `{"error":"refresh_token is required"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	distinctID := "anonymous"
	if tokenData, err := h.refreshTokenManager.GetRefreshToken(ctx, req.RefreshToken); err == nil {
		distinctID = tokenData.UserID.String()
	}

	if err := h.refreshTokenManager.RevokeRefreshToken(ctx, req.RefreshToken); err != nil {
		http.Error(w, `{"error":"failed to logout"}`, http.StatusInternalServerError)
		return
	}

	analytics.Track(r.Context(), analytics.Event{
		DistinctID: distinctID,
		Name:       "auth_logout",
		OptOut:     analytics.RequestOptedOut(r),
		Properties: map[string]any{
			"auth_method": "refresh_token",
		},
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "logged out successfully"})
}

// LogoutAll revokes all refresh tokens for the current user
func (h *AuthHandler) LogoutAll(w http.ResponseWriter, r *http.Request) {
	if h.refreshTokenManager == nil {
		http.Error(w, `{"error":"refresh tokens not enabled"}`, http.StatusNotImplemented)
		return
	}

	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if err := h.refreshTokenManager.RevokeAllUserTokens(ctx, userID); err != nil {
		http.Error(w, `{"error":"failed to logout from all devices"}`, http.StatusInternalServerError)
		return
	}

	analytics.Track(r.Context(), analytics.Event{
		DistinctID: userID.String(),
		Name:       "auth_logout_all",
		OptOut:     analytics.RequestOptedOut(r),
		Properties: map[string]any{
			"user_id": userID.String(),
		},
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "logged out from all devices"})
}

// validatePassword checks password requirements
func validatePassword(password string) error {
	if len(password) < 8 {
		return &passwordError{"password must be at least 8 characters"}
	}

	var hasUpper, hasLower, hasDigit bool
	for _, c := range password {
		switch {
		case unicode.IsUpper(c):
			hasUpper = true
		case unicode.IsLower(c):
			hasLower = true
		case unicode.IsDigit(c):
			hasDigit = true
		}
	}

	if !hasUpper {
		return &passwordError{"password must contain at least one uppercase letter"}
	}
	if !hasLower {
		return &passwordError{"password must contain at least one lowercase letter"}
	}
	if !hasDigit {
		return &passwordError{"password must contain at least one digit"}
	}

	return nil
}

type passwordError struct {
	message string
}

func (e *passwordError) Error() string {
	return e.message
}

// AuthMethodResponse represents a user's authentication method
type AuthMethodResponse struct {
	ID        uuid.UUID `json:"id"`
	Provider  string    `json:"provider"`
	CreatedAt time.Time `json:"created_at,omitempty"`
}

// GetAuthMethods lists all auth methods for the current user
func (h *AuthHandler) GetAuthMethods(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Get SSO auth methods
	methods := []AuthMethodResponse{}
	rows, err := h.pool.Query(ctx,
		`SELECT id, provider, created_at FROM user_auth_methods WHERE user_id = $1 ORDER BY created_at ASC`,
		userID,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to get auth methods"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var method AuthMethodResponse
		if err := rows.Scan(&method.ID, &method.Provider, &method.CreatedAt); err != nil {
			http.Error(w, `{"error":"failed to scan auth method"}`, http.StatusInternalServerError)
			return
		}
		methods = append(methods, method)
	}

	// Check if user has password auth
	var hasPassword bool
	err = h.pool.QueryRow(ctx,
		`SELECT password_hash IS NOT NULL FROM users WHERE id = $1`,
		userID,
	).Scan(&hasPassword)
	if err != nil && err != pgx.ErrNoRows {
		http.Error(w, `{"error":"failed to check password auth"}`, http.StatusInternalServerError)
		return
	}

	// Add password as a virtual auth method if user has one
	if hasPassword {
		methods = append([]AuthMethodResponse{{
			ID:       uuid.Nil,
			Provider: "password",
		}}, methods...)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(methods)
}

// UnlinkAuthMethod removes an auth method from the current user
func (h *AuthHandler) UnlinkAuthMethod(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	methodID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid method id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Count total auth methods
	var methodCount int
	err = h.pool.QueryRow(ctx,
		`SELECT
			(SELECT COUNT(*) FROM user_auth_methods WHERE user_id = $1) +
			(SELECT CASE WHEN password_hash IS NOT NULL THEN 1 ELSE 0 END FROM users WHERE id = $1)`,
		userID,
	).Scan(&methodCount)
	if err != nil {
		http.Error(w, `{"error":"failed to count auth methods"}`, http.StatusInternalServerError)
		return
	}

	if methodCount <= 1 {
		http.Error(w, `{"error":"cannot remove last auth method"}`, http.StatusBadRequest)
		return
	}

	// Handle password (uuid.Nil) or SSO method
	if methodID == uuid.Nil {
		result, err := h.pool.Exec(ctx,
			`UPDATE users SET password_hash = NULL, updated_at = NOW() WHERE id = $1 AND password_hash IS NOT NULL`,
			userID,
		)
		if err != nil {
			http.Error(w, `{"error":"failed to remove password"}`, http.StatusInternalServerError)
			return
		}
		if result.RowsAffected() == 0 {
			http.Error(w, `{"error":"password not found"}`, http.StatusNotFound)
			return
		}
	} else {
		result, err := h.pool.Exec(ctx,
			`DELETE FROM user_auth_methods WHERE id = $1 AND user_id = $2`,
			methodID, userID,
		)
		if err != nil {
			http.Error(w, `{"error":"failed to remove auth method"}`, http.StatusInternalServerError)
			return
		}
		if result.RowsAffected() == 0 {
			http.Error(w, `{"error":"auth method not found"}`, http.StatusNotFound)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "auth method removed"})
}
