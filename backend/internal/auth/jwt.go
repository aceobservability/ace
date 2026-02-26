package auth

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

var (
	ErrInvalidToken = errors.New("invalid token")
	ErrExpiredToken = errors.New("token has expired")
)

// TokenClaims represents the JWT claims
type TokenClaims struct {
	UserID uuid.UUID `json:"sub"`
	Email  string    `json:"email"`
	Name   string    `json:"name,omitempty"`
	jwt.RegisteredClaims
}

// JWTManager handles JWT token generation and verification
type JWTManager struct {
	privateKey *rsa.PrivateKey
	publicKey  *rsa.PublicKey
}

// NewJWTManager creates a new JWTManager from environment variables or generates new keys
func NewJWTManager() (*JWTManager, error) {
	privateKeyPEM := os.Getenv("JWT_PRIVATE_KEY")
	publicKeyPEM := os.Getenv("JWT_PUBLIC_KEY")

	if privateKeyPEM != "" && publicKeyPEM != "" {
		return NewJWTManagerFromPEM(privateKeyPEM, publicKeyPEM)
	}

	// Try loading cached keys from the data directory, generate and cache if missing.
	return loadOrGenerateJWTManager()
}

// NewJWTManagerFromPEM creates a JWTManager from PEM-encoded keys
func NewJWTManagerFromPEM(privateKeyPEM, publicKeyPEM string) (*JWTManager, error) {
	privateBlock, _ := pem.Decode([]byte(privateKeyPEM))
	if privateBlock == nil {
		return nil, errors.New("failed to parse private key PEM")
	}

	privateKey, err := x509.ParsePKCS1PrivateKey(privateBlock.Bytes)
	if err != nil {
		return nil, err
	}

	publicBlock, _ := pem.Decode([]byte(publicKeyPEM))
	if publicBlock == nil {
		return nil, errors.New("failed to parse public key PEM")
	}

	publicKeyInterface, err := x509.ParsePKIXPublicKey(publicBlock.Bytes)
	if err != nil {
		return nil, err
	}

	publicKey, ok := publicKeyInterface.(*rsa.PublicKey)
	if !ok {
		return nil, errors.New("public key is not RSA")
	}

	return &JWTManager{
		privateKey: privateKey,
		publicKey:  publicKey,
	}, nil
}

// GenerateJWTManager generates new RSA keys and creates a JWTManager
func GenerateJWTManager() (*JWTManager, error) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 4096)
	if err != nil {
		return nil, err
	}

	return &JWTManager{
		privateKey: privateKey,
		publicKey:  &privateKey.PublicKey,
	}, nil
}

// loadOrGenerateJWTManager loads cached RSA keys from disk or generates and
// caches a new pair. This keeps sessions stable across backend restarts during
// local development.
func loadOrGenerateJWTManager() (*JWTManager, error) {
	dir := os.Getenv("DATA_DIR")
	if dir == "" {
		dir = ".data"
	}
	privPath := filepath.Join(dir, "jwt.key")
	pubPath := filepath.Join(dir, "jwt.pub")

	privPEM, privErr := os.ReadFile(privPath)
	pubPEM, pubErr := os.ReadFile(pubPath)

	if privErr == nil && pubErr == nil {
		return NewJWTManagerFromPEM(string(privPEM), string(pubPEM))
	}

	mgr, err := GenerateJWTManager()
	if err != nil {
		return nil, err
	}

	if mkErr := os.MkdirAll(dir, 0o700); mkErr != nil {
		log.Printf("warning: could not create data dir %s: %v (JWT keys will not persist)", dir, mkErr)
		return mgr, nil
	}

	pubStr, err := mgr.GetPublicKeyPEM()
	if err != nil {
		log.Printf("warning: could not encode public key: %v (JWT keys will not persist)", err)
		return mgr, nil
	}

	if err := os.WriteFile(privPath, []byte(mgr.GetPrivateKeyPEM()), 0o600); err != nil {
		log.Printf("warning: could not write %s: %v (JWT keys will not persist)", privPath, err)
		return mgr, nil
	}
	if err := os.WriteFile(pubPath, []byte(pubStr), 0o644); err != nil {
		log.Printf("warning: could not write %s: %v (JWT keys will not persist)", pubPath, err)
		return mgr, nil
	}

	log.Printf("generated and cached JWT keys in %s", dir)
	return mgr, nil
}

// GenerateAccessToken creates a new JWT access token
func (m *JWTManager) GenerateAccessToken(userID uuid.UUID, email string, name string) (string, error) {
	now := time.Now()
	claims := TokenClaims{
		UserID: userID,
		Email:  email,
		Name:   name,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(15 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			Issuer:    "ace",
			Subject:   userID.String(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	return token.SignedString(m.privateKey)
}

// VerifyAccessToken verifies and parses a JWT token
func (m *JWTManager) VerifyAccessToken(tokenString string) (*TokenClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &TokenClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, ErrInvalidToken
		}
		return m.publicKey, nil
	})

	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrExpiredToken
		}
		return nil, ErrInvalidToken
	}

	claims, ok := token.Claims.(*TokenClaims)
	if !ok || !token.Valid {
		return nil, ErrInvalidToken
	}

	return claims, nil
}

// GetPublicKeyPEM returns the public key in PEM format
func (m *JWTManager) GetPublicKeyPEM() (string, error) {
	publicKeyBytes, err := x509.MarshalPKIXPublicKey(m.publicKey)
	if err != nil {
		return "", err
	}

	publicPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: publicKeyBytes,
	})

	return string(publicPEM), nil
}

// GetPrivateKeyPEM returns the private key in PEM format
func (m *JWTManager) GetPrivateKeyPEM() string {
	privateKeyBytes := x509.MarshalPKCS1PrivateKey(m.privateKey)
	privatePEM := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: privateKeyBytes,
	})
	return string(privatePEM)
}
