package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/aceobservability/ace/backend/internal/converter"
)

type GrafanaConverterHandler struct{}

type GrafanaConvertResponse struct {
	Format   string                      `json:"format"`
	Content  string                      `json:"content"`
	Document converter.DashboardDocument `json:"document"`
	Warnings []string                    `json:"warnings"`
}

func NewGrafanaConverterHandler() *GrafanaConverterHandler {
	return &GrafanaConverterHandler{}
}

func (h *GrafanaConverterHandler) Convert(w http.ResponseWriter, r *http.Request) {
	format := converter.NormalizeFormat(r.URL.Query().Get("format"))
	if format == "" {
		format = "json"
	}

	data, err := readRawBody(r)
	if err != nil {
		http.Error(w, `{"error":"failed to read request body"}`, http.StatusBadRequest)
		return
	}

	doc, warnings, err := converter.ConvertGrafanaDashboard(data)
	if err != nil {
		http.Error(w, `{"error":"invalid grafana dashboard JSON"}`, http.StatusBadRequest)
		return
	}

	encoded, err := converter.EncodeDashboardDocument(doc, format)
	if err != nil {
		http.Error(w, `{"error":"failed to encode converted dashboard"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(GrafanaConvertResponse{
		Format:   format,
		Content:  string(encoded),
		Document: doc,
		Warnings: warnings,
	})
}
