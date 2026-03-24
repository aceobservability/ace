// Package crypto provides AES-GCM encryption/decryption helpers used by AI
// provider handlers to protect secrets at rest (tokens, API keys, etc.).
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"os"
)

// DeriveEncryptionKey derives a 32-byte AES key from JWT_SECRET (or the JWT
// private key PEM). It tries, in order:
//  1. The JWT_SECRET environment variable.
//  2. The JWT_PRIVATE_KEY environment variable.
//  3. The file at .data/jwt.key on disk.
func DeriveEncryptionKey() ([]byte, error) {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = os.Getenv("JWT_PRIVATE_KEY")
	}
	if secret == "" {
		data, err := os.ReadFile(".data/jwt.key")
		if err != nil {
			return nil, fmt.Errorf("no encryption key material available")
		}
		secret = string(data)
	}
	hash := sha256.Sum256([]byte(secret))
	return hash[:], nil
}

// EncryptToken encrypts plaintext using AES-256-GCM and returns a
// base64-encoded string containing the nonce prepended to the ciphertext.
// Each call produces a different output because a random nonce is generated.
func EncryptToken(plaintext string) (string, error) {
	key, err := DeriveEncryptionKey()
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, aesGCM.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}

	ciphertext := aesGCM.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// DecryptToken decrypts a base64-encoded ciphertext that was produced by
// EncryptToken and returns the original plaintext.
func DecryptToken(encoded string) (string, error) {
	key, err := DeriveEncryptionKey()
	if err != nil {
		return "", err
	}

	ciphertext, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonceSize := aesGCM.NonceSize()
	if len(ciphertext) < nonceSize {
		return "", fmt.Errorf("ciphertext too short")
	}

	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := aesGCM.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}

	return string(plaintext), nil
}
