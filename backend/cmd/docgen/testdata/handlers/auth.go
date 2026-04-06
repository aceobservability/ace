package handlers

import "net/http"

type AuthHandler struct{}

func NewAuthHandler() *AuthHandler { return &AuthHandler{} }

// Login authenticates a user with email and password.
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {}

// Me returns the current user profile.
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {}
