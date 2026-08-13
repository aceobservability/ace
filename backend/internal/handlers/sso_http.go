package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
)

func ssoStateCookie(name, value string, maxAge int) *http.Cookie {
	return &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	}
}

func ssoHashRedirect(w http.ResponseWriter, r *http.Request, accessToken, refreshToken string) {
	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:5173"
	}
	redirectURL := fmt.Sprintf("%s/auth/callback#access_token=%s&token_type=Bearer", frontendURL, url.QueryEscape(accessToken))
	if refreshToken != "" {
		redirectURL += "&refresh_token=" + url.QueryEscape(refreshToken)
	}
	http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
}

func writeSSOFinishError(w http.ResponseWriter, err error) {
	msg := err.Error()
	switch msg {
	case "email not verified", "no email found in user info", "no email found in ID token":
		http.Error(w, `{"error":"`+msg+`"}`, http.StatusBadRequest)
	case "organization not found":
		http.Error(w, `{"error":"organization not found"}`, http.StatusNotFound)
	case "failed to verify ID token":
		http.Error(w, `{"error":"failed to verify ID token"}`, http.StatusUnauthorized)
	default:
		if strings.Contains(msg, "not configured") || strings.Contains(msg, "not enabled") {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
			return
		}
		http.Error(w, `{"error":"`+msg+`"}`, http.StatusInternalServerError)
	}
}
