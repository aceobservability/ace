package handlers

import "net/http"

type OrgHandler struct{}

func NewOrgHandler() *OrgHandler { return &OrgHandler{} }

func (h *OrgHandler) CreateItem(w http.ResponseWriter, r *http.Request) {}
