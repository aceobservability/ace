package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"

	"github.com/aceobservability/ace/backend/internal/sso"
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

func writeSSOJSON(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func writeSSOStartError(w http.ResponseWriter, err error) {
	status := http.StatusBadRequest
	if errors.Is(err, sso.ErrGenerateState) {
		status = http.StatusInternalServerError
	}
	writeSSOJSON(w, status, err.Error())
}

func writeSSOFinishError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	switch {
	case errors.Is(err, sso.ErrEmailUnverified), errors.Is(err, sso.ErrNoEmail):
		status = http.StatusBadRequest
	case errors.Is(err, sso.ErrOrgNotFound):
		status = http.StatusNotFound
	case errors.Is(err, sso.ErrIDToken):
		status = http.StatusUnauthorized
	case errors.Is(err, sso.ErrNotConfigured), errors.Is(err, sso.ErrNotEnabled):
		status = http.StatusBadRequest
	case errors.Is(err, sso.ErrNoAccount):
		status = http.StatusForbidden
	}
	writeSSOJSON(w, status, err.Error())
}
