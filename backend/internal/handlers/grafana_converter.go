package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/aceobservability/ace/backend/internal/converter"
)

type GrafanaConverterHandler struct{}

type GrafanaConvertResponse struct {
	Format   string                      `json:"format"`
	Content  string                      `json:"content"`
	Document converter.DashboardDocument `json:"document"`
	Warnings []string                    `json:"warnings"`
	Report   *converter.ConversionReport `json:"report,omitempty"`
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

	doc, report, err := converter.ConvertGrafanaDashboardWithReport(data)
	if err != nil {
		http.Error(w, `{"error":"invalid grafana dashboard JSON"}`, http.StatusBadRequest)
		return
	}

	// Build flat warnings from report diagnostics for backward compatibility
	warnings := make([]string, 0)
	for _, d := range report.PanelDiagnostics {
		if d.Warning != "" {
			warnings = append(warnings, fmt.Sprintf("panel[%d] %s", d.Index, d.Warning))
		}
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
		Report:   &report,
	})
}
