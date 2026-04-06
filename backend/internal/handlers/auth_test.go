package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/aceobservability/ace/backend/internal/auth"
	"github.com/aceobservability/ace/backend/internal/db"
)

var testPool *pgxpool.Pool
var testJWTManager *auth.JWTManager
var testAuthHandler *AuthHandler

func TestMain(m *testing.M) {
	// Setup test database
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://dash:dash@localhost:5432/dash_test?sslmode=disable"
	}

	ctx := context.Background()
	pool, err := db.Connect(ctx, dbURL)
	if err != nil {
		// Skip tests if database is not available
		os.Exit(0)
	}
	testPool = pool

	// Run migrations
	if err := db.RunMigrations(ctx, testPool); err != nil {
		pool.Close()
		os.Exit(1)
	}

	// Setup JWT manager
	testJWTManager, err = auth.GenerateJWTManager()
	if err != nil {
		pool.Close()
		os.Exit(1)
	}

	testAuthHandler = NewAuthHandler(testPool, testJWTManager, nil)

	// Run tests
	code := m.Run()

	// Cleanup
	testPool.Exec(ctx, "DELETE FROM users WHERE email LIKE 'test%@example.com'")
	pool.Close()
	os.Exit(code)
}

func TestRegisterUser(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	// Cleanup before test
	testPool.Exec(context.Background(), "DELETE FROM users WHERE email = 'testregister@example.com'")

	body := `{"email":"testregister@example.com","password":"TestPassword123!","name":"Test User"}`
	req := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	testAuthHandler.Register(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("Expected status 201, got %d: %s", w.Code, w.Body.String())
	}

	var response AuthResponse
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if response.AccessToken == "" {
		t.Error("Expected access token in response")
	}
	if response.TokenType != "Bearer" {
		t.Errorf("Expected token type Bearer, got %s", response.TokenType)
	}
	if response.ExpiresIn != 900 {
		t.Errorf("Expected expires_in 900, got %d", response.ExpiresIn)
	}
}

func TestRegisterUserDuplicate(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	// Cleanup and create initial user
	testPool.Exec(context.Background(), "DELETE FROM users WHERE email = 'testdupe@example.com'")

	body := `{"email":"testdupe@example.com","password":"TestPassword123!","name":"Test User"}`
	req := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	testAuthHandler.Register(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("Failed to create first user: %d", w.Code)
	}

	// Try to register again
	req = httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()

	testAuthHandler.Register(w, req)

	if w.Code != http.StatusConflict {
		t.Errorf("Expected status 409 for duplicate email, got %d", w.Code)
	}
}

func TestRegisterUserInvalidEmail(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	body := `{"email":"not-an-email","password":"TestPassword123!","name":"Test User"}`
	req := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	testAuthHandler.Register(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400 for invalid email, got %d", w.Code)
	}
}

func TestRegisterUserWeakPassword(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	testCases := []struct {
		name     string
		password string
	}{
		{"too short", "Short1!"},
		{"no uppercase", "testpassword123!"},
		{"no lowercase", "TESTPASSWORD123!"},
		{"no digit", "TestPassword!"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			body := `{"email":"testweak@example.com","password":"` + tc.password + `","name":"Test User"}`
			req := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			testAuthHandler.Register(w, req)

			if w.Code != http.StatusBadRequest {
				t.Errorf("Expected status 400 for weak password '%s', got %d: %s", tc.password, w.Code, w.Body.String())
			}
		})
	}
}

func TestLoginCorrectPassword(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	// Cleanup and register user
	testPool.Exec(context.Background(), "DELETE FROM users WHERE email = 'testlogin@example.com'")

	regBody := `{"email":"testlogin@example.com","password":"TestPassword123!","name":"Test User"}`
	regReq := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(regBody))
	regReq.Header.Set("Content-Type", "application/json")
	regW := httptest.NewRecorder()
	testAuthHandler.Register(regW, regReq)

	if regW.Code != http.StatusCreated {
		t.Fatalf("Failed to register user: %d", regW.Code)
	}

	// Login
	loginBody := `{"email":"testlogin@example.com","password":"TestPassword123!"}`
	loginReq := httptest.NewRequest("POST", "/api/auth/login", bytes.NewBufferString(loginBody))
	loginReq.Header.Set("Content-Type", "application/json")
	loginW := httptest.NewRecorder()

	testAuthHandler.Login(loginW, loginReq)

	if loginW.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d: %s", loginW.Code, loginW.Body.String())
	}

	var response AuthResponse
	if err := json.NewDecoder(loginW.Body).Decode(&response); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if response.AccessToken == "" {
		t.Error("Expected access token in response")
	}
}

func TestLoginWrongPassword(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	// Cleanup and register user
	testPool.Exec(context.Background(), "DELETE FROM users WHERE email = 'testloginwrong@example.com'")

	regBody := `{"email":"testloginwrong@example.com","password":"TestPassword123!","name":"Test User"}`
	regReq := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(regBody))
	regReq.Header.Set("Content-Type", "application/json")
	regW := httptest.NewRecorder()
	testAuthHandler.Register(regW, regReq)

	// Login with wrong password
	loginBody := `{"email":"testloginwrong@example.com","password":"WrongPassword123!"}`
	loginReq := httptest.NewRequest("POST", "/api/auth/login", bytes.NewBufferString(loginBody))
	loginReq.Header.Set("Content-Type", "application/json")
	loginW := httptest.NewRecorder()

	testAuthHandler.Login(loginW, loginReq)

	if loginW.Code != http.StatusUnauthorized {
		t.Errorf("Expected status 401 for wrong password, got %d", loginW.Code)
	}
}

func TestLoginNonexistentUser(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	loginBody := `{"email":"nonexistent@example.com","password":"TestPassword123!"}`
	loginReq := httptest.NewRequest("POST", "/api/auth/login", bytes.NewBufferString(loginBody))
	loginReq.Header.Set("Content-Type", "application/json")
	loginW := httptest.NewRecorder()

	testAuthHandler.Login(loginW, loginReq)

	if loginW.Code != http.StatusUnauthorized {
		t.Errorf("Expected status 401 for nonexistent user, got %d", loginW.Code)
	}
}

func TestMeWithValidToken(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	// Cleanup and register user
	testPool.Exec(context.Background(), "DELETE FROM users WHERE email = 'testme@example.com'")

	regBody := `{"email":"testme@example.com","password":"TestPassword123!","name":"Test Me User"}`
	regReq := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(regBody))
	regReq.Header.Set("Content-Type", "application/json")
	regW := httptest.NewRecorder()
	testAuthHandler.Register(regW, regReq)

	var regResponse AuthResponse
	json.NewDecoder(regW.Body).Decode(&regResponse)

	// Call /me endpoint
	meReq := httptest.NewRequest("GET", "/api/auth/me", nil)
	meReq.Header.Set("Authorization", "Bearer "+regResponse.AccessToken)
	meW := httptest.NewRecorder()

	// We need to wrap the handler with the auth middleware
	wrappedHandler := auth.RequireAuth(testJWTManager, testAuthHandler.Me)
	wrappedHandler(meW, meReq)

	if meW.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d: %s", meW.Code, meW.Body.String())
	}

	var userResponse UserResponse
	if err := json.NewDecoder(meW.Body).Decode(&userResponse); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if userResponse.Email != "testme@example.com" {
		t.Errorf("Expected email testme@example.com, got %s", userResponse.Email)
	}
	if userResponse.Name == nil || *userResponse.Name != "Test Me User" {
		t.Errorf("Expected name 'Test Me User', got %v", userResponse.Name)
	}
}

func TestMeWithExpiredToken(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	// Use an invalid/expired token
	meReq := httptest.NewRequest("GET", "/api/auth/me", nil)
	meReq.Header.Set("Authorization", "Bearer invalid.token.here")
	meW := httptest.NewRecorder()

	wrappedHandler := auth.RequireAuth(testJWTManager, testAuthHandler.Me)
	wrappedHandler(meW, meReq)

	if meW.Code != http.StatusUnauthorized {
		t.Errorf("Expected status 401 for invalid token, got %d", meW.Code)
	}
}

func TestMeWithoutToken(t *testing.T) {
	meReq := httptest.NewRequest("GET", "/api/auth/me", nil)
	meW := httptest.NewRecorder()

	wrappedHandler := auth.RequireAuth(testJWTManager, testAuthHandler.Me)
	wrappedHandler(meW, meReq)

	if meW.Code != http.StatusUnauthorized {
		t.Errorf("Expected status 401 for missing token, got %d", meW.Code)
	}
}

func setupTestWithRedis(t *testing.T) (*AuthHandler, func()) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("Failed to start miniredis: %v", err)
	}

	rdb := redis.NewClient(&redis.Options{
		Addr: mr.Addr(),
	})

	handler := NewAuthHandler(testPool, testJWTManager, rdb)

	cleanup := func() {
		rdb.Close()
		mr.Close()
	}

	return handler, cleanup
}

func TestLoginReturnsRefreshToken(t *testing.T) {
	handler, cleanup := setupTestWithRedis(t)
	defer cleanup()

	// Cleanup and register user
	testPool.Exec(context.Background(), "DELETE FROM users WHERE email = 'testloginrefresh@example.com'")

	regBody := `{"email":"testloginrefresh@example.com","password":"TestPassword123!","name":"Test User"}`
	regReq := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(regBody))
	regReq.Header.Set("Content-Type", "application/json")
	regW := httptest.NewRecorder()
	handler.Register(regW, regReq)

	if regW.Code != http.StatusCreated {
		t.Fatalf("Failed to register user: %d", regW.Code)
	}

	// Login
	loginBody := `{"email":"testloginrefresh@example.com","password":"TestPassword123!"}`
	loginReq := httptest.NewRequest("POST", "/api/auth/login", bytes.NewBufferString(loginBody))
	loginReq.Header.Set("Content-Type", "application/json")
	loginW := httptest.NewRecorder()

	handler.Login(loginW, loginReq)

	if loginW.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d: %s", loginW.Code, loginW.Body.String())
	}

	var response AuthResponse
	if err := json.NewDecoder(loginW.Body).Decode(&response); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if response.AccessToken == "" {
		t.Error("Expected access token in response")
	}
	if response.RefreshToken == "" {
		t.Error("Expected refresh token in response")
	}
}

func TestRefreshTokenEndpoint(t *testing.T) {
	handler, cleanup := setupTestWithRedis(t)
	defer cleanup()

	// Cleanup and register user
	testPool.Exec(context.Background(), "DELETE FROM users WHERE email = 'testrefreshendpoint@example.com'")

	regBody := `{"email":"testrefreshendpoint@example.com","password":"TestPassword123!","name":"Test User"}`
	regReq := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(regBody))
	regReq.Header.Set("Content-Type", "application/json")
	regW := httptest.NewRecorder()
	handler.Register(regW, regReq)

	var regResponse AuthResponse
	json.NewDecoder(regW.Body).Decode(&regResponse)

	// Use refresh token to get new tokens
	refreshBody := `{"refresh_token":"` + regResponse.RefreshToken + `"}`
	refreshReq := httptest.NewRequest("POST", "/api/auth/refresh", bytes.NewBufferString(refreshBody))
	refreshReq.Header.Set("Content-Type", "application/json")
	refreshW := httptest.NewRecorder()

	handler.Refresh(refreshW, refreshReq)

	if refreshW.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d: %s", refreshW.Code, refreshW.Body.String())
	}

	var refreshResponse AuthResponse
	if err := json.NewDecoder(refreshW.Body).Decode(&refreshResponse); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if refreshResponse.AccessToken == "" {
		t.Error("Expected new access token")
	}
	if refreshResponse.RefreshToken == "" {
		t.Error("Expected new refresh token")
	}
	if refreshResponse.RefreshToken == regResponse.RefreshToken {
		t.Error("New refresh token should be different from old one")
	}
}

func TestRefreshTokenRotation(t *testing.T) {
	handler, cleanup := setupTestWithRedis(t)
	defer cleanup()

	// Cleanup and register user
	testPool.Exec(context.Background(), "DELETE FROM users WHERE email = 'testrotation@example.com'")

	regBody := `{"email":"testrotation@example.com","password":"TestPassword123!","name":"Test User"}`
	regReq := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(regBody))
	regReq.Header.Set("Content-Type", "application/json")
	regW := httptest.NewRecorder()
	handler.Register(regW, regReq)

	var regResponse AuthResponse
	json.NewDecoder(regW.Body).Decode(&regResponse)

	oldRefreshToken := regResponse.RefreshToken

	// Use refresh token
	refreshBody := `{"refresh_token":"` + oldRefreshToken + `"}`
	refreshReq := httptest.NewRequest("POST", "/api/auth/refresh", bytes.NewBufferString(refreshBody))
	refreshReq.Header.Set("Content-Type", "application/json")
	refreshW := httptest.NewRecorder()
	handler.Refresh(refreshW, refreshReq)

	// Try to use the old refresh token again - should fail
	refreshReq2 := httptest.NewRequest("POST", "/api/auth/refresh", bytes.NewBufferString(refreshBody))
	refreshReq2.Header.Set("Content-Type", "application/json")
	refreshW2 := httptest.NewRecorder()

	handler.Refresh(refreshW2, refreshReq2)

	if refreshW2.Code != http.StatusUnauthorized {
		t.Errorf("Expected status 401 for rotated token, got %d", refreshW2.Code)
	}
}

func TestLogoutEndpoint(t *testing.T) {
	handler, cleanup := setupTestWithRedis(t)
	defer cleanup()

	// Cleanup and register user
	testPool.Exec(context.Background(), "DELETE FROM users WHERE email = 'testlogout@example.com'")

	regBody := `{"email":"testlogout@example.com","password":"TestPassword123!","name":"Test User"}`
	regReq := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(regBody))
	regReq.Header.Set("Content-Type", "application/json")
	regW := httptest.NewRecorder()
	handler.Register(regW, regReq)

	var regResponse AuthResponse
	json.NewDecoder(regW.Body).Decode(&regResponse)

	// Logout
	logoutBody := `{"refresh_token":"` + regResponse.RefreshToken + `"}`
	logoutReq := httptest.NewRequest("POST", "/api/auth/logout", bytes.NewBufferString(logoutBody))
	logoutReq.Header.Set("Content-Type", "application/json")
	logoutW := httptest.NewRecorder()

	handler.Logout(logoutW, logoutReq)

	if logoutW.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d: %s", logoutW.Code, logoutW.Body.String())
	}

	// Try to use the refresh token - should fail
	refreshBody := `{"refresh_token":"` + regResponse.RefreshToken + `"}`
	refreshReq := httptest.NewRequest("POST", "/api/auth/refresh", bytes.NewBufferString(refreshBody))
	refreshReq.Header.Set("Content-Type", "application/json")
	refreshW := httptest.NewRecorder()

	handler.Refresh(refreshW, refreshReq)

	if refreshW.Code != http.StatusUnauthorized {
		t.Errorf("Expected status 401 for logged out token, got %d", refreshW.Code)
	}
}

func TestLogoutAllEndpoint(t *testing.T) {
	handler, cleanup := setupTestWithRedis(t)
	defer cleanup()

	// Cleanup and register user
	testPool.Exec(context.Background(), "DELETE FROM users WHERE email = 'testlogoutall@example.com'")

	regBody := `{"email":"testlogoutall@example.com","password":"TestPassword123!","name":"Test User"}`
	regReq := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(regBody))
	regReq.Header.Set("Content-Type", "application/json")
	regW := httptest.NewRecorder()
	handler.Register(regW, regReq)

	var regResponse AuthResponse
	json.NewDecoder(regW.Body).Decode(&regResponse)

	// Login again to get a second refresh token
	loginBody := `{"email":"testlogoutall@example.com","password":"TestPassword123!"}`
	loginReq := httptest.NewRequest("POST", "/api/auth/login", bytes.NewBufferString(loginBody))
	loginReq.Header.Set("Content-Type", "application/json")
	loginW := httptest.NewRecorder()
	handler.Login(loginW, loginReq)

	var loginResponse AuthResponse
	json.NewDecoder(loginW.Body).Decode(&loginResponse)

	// Call logout-all (needs auth)
	logoutReq := httptest.NewRequest("POST", "/api/auth/logout-all", nil)
	logoutReq.Header.Set("Authorization", "Bearer "+regResponse.AccessToken)
	logoutW := httptest.NewRecorder()

	wrappedHandler := auth.RequireAuth(testJWTManager, handler.LogoutAll)
	wrappedHandler(logoutW, logoutReq)

	if logoutW.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d: %s", logoutW.Code, logoutW.Body.String())
	}

	// Try to use any of the refresh tokens - both should fail
	for i, token := range []string{regResponse.RefreshToken, loginResponse.RefreshToken} {
		refreshBody := `{"refresh_token":"` + token + `"}`
		refreshReq := httptest.NewRequest("POST", "/api/auth/refresh", bytes.NewBufferString(refreshBody))
		refreshReq.Header.Set("Content-Type", "application/json")
		refreshW := httptest.NewRecorder()

		handler.Refresh(refreshW, refreshReq)

		if refreshW.Code != http.StatusUnauthorized {
			t.Errorf("Token %d: Expected status 401 after logout-all, got %d", i, refreshW.Code)
		}
	}
}

func TestRefreshInvalidToken(t *testing.T) {
	handler, cleanup := setupTestWithRedis(t)
	defer cleanup()

	refreshBody := `{"refresh_token":"invalid-token-here"}`
	refreshReq := httptest.NewRequest("POST", "/api/auth/refresh", bytes.NewBufferString(refreshBody))
	refreshReq.Header.Set("Content-Type", "application/json")
	refreshW := httptest.NewRecorder()

	handler.Refresh(refreshW, refreshReq)

	if refreshW.Code != http.StatusUnauthorized {
		t.Errorf("Expected status 401 for invalid token, got %d", refreshW.Code)
	}
}

func TestGetAuthMethods(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	ctx := context.Background()
	testPool.Exec(ctx, "DELETE FROM users WHERE email = 'testgetmethods@example.com'")

	regBody := `{"email":"testgetmethods@example.com","password":"TestPassword123!","name":"Test Methods"}`
	regReq := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(regBody))
	regReq.Header.Set("Content-Type", "application/json")
	regW := httptest.NewRecorder()
	testAuthHandler.Register(regW, regReq)

	var regResponse AuthResponse
	json.NewDecoder(regW.Body).Decode(&regResponse)

	getReq := httptest.NewRequest("GET", "/api/auth/me/methods", nil)
	getReq.Header.Set("Authorization", "Bearer "+regResponse.AccessToken)
	getW := httptest.NewRecorder()

	wrappedHandler := auth.RequireAuth(testJWTManager, testAuthHandler.GetAuthMethods)
	wrappedHandler(getW, getReq)

	if getW.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d: %s", getW.Code, getW.Body.String())
	}

	var methods []AuthMethodResponse
	json.NewDecoder(getW.Body).Decode(&methods)

	if len(methods) != 1 {
		t.Errorf("Expected 1 auth method, got %d", len(methods))
	}

	if methods[0].Provider != "password" {
		t.Errorf("Expected password provider, got %s", methods[0].Provider)
	}
}

func TestUnlinkLastAuthMethodFails(t *testing.T) {
	if testPool == nil {
		t.Skip("Database not available")
	}

	ctx := context.Background()
	testPool.Exec(ctx, "DELETE FROM users WHERE email = 'testunlink@example.com'")

	regBody := `{"email":"testunlink@example.com","password":"TestPassword123!","name":"Test Unlink User"}`
	regReq := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(regBody))
	regReq.Header.Set("Content-Type", "application/json")
	regW := httptest.NewRecorder()
	testAuthHandler.Register(regW, regReq)

	var regResponse AuthResponse
	json.NewDecoder(regW.Body).Decode(&regResponse)

	unlinkReq := httptest.NewRequest("DELETE", "/api/auth/me/methods/00000000-0000-0000-0000-000000000000", nil)
	unlinkReq.Header.Set("Authorization", "Bearer "+regResponse.AccessToken)
	unlinkReq.SetPathValue("id", "00000000-0000-0000-0000-000000000000")
	unlinkW := httptest.NewRecorder()

	wrappedHandler := auth.RequireAuth(testJWTManager, testAuthHandler.UnlinkAuthMethod)
	wrappedHandler(unlinkW, unlinkReq)

	if unlinkW.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400 for unlinking last method, got %d: %s", unlinkW.Code, unlinkW.Body.String())
	}
}
