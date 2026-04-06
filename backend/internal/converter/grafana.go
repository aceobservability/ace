package converter

import (
	"encoding/json"
	"fmt"
	"strings"
)

type grafanaEnvelope struct {
	Dashboard *grafanaDashboard `json:"dashboard"`
}

type grafanaDashboard struct {
	Title       string         `json:"title"`
	Description string         `json:"description"`
	Panels      []grafanaPanel `json:"panels"`
	Templating  struct {
		List []grafanaVariable `json:"list"`
	} `json:"templating"`
	Time    *grafanaTimeRange `json:"time"`
	Refresh string            `json:"refresh"`
}

type grafanaPanel struct {
	Title   string               `json:"title"`
	Type    string               `json:"type"`
	GridPos map[string]int       `json:"gridPos"`
	Targets []grafanaPanelTarget `json:"targets"`
}

type grafanaPanelTarget struct {
	RefID string `json:"refId"`
	Expr  string `json:"expr"`
	Query string `json:"query"`
}

type grafanaVariable struct {
	Name       string `json:"name"`
	Type       string `json:"type"`
	Label      string `json:"label"`
	Query      string `json:"query"`
	Definition string `json:"definition"`
	Multi      bool   `json:"multi"`
	IncludeAll bool   `json:"includeAll"`
}

type grafanaTimeRange struct {
	From string `json:"from"`
	To   string `json:"to"`
}

// PanelDiagnostic provides per-panel conversion status for the fidelity report.
type PanelDiagnostic struct {
	Index          int    `json:"index"`
	Title          string `json:"title"`
	OriginalType   string `json:"original_type"`
	MappedType     string `json:"mapped_type"`
	Status         string `json:"status"` // "mapped", "unsupported", "partial"
	Warning        string `json:"warning,omitempty"`
	HasQuery       bool   `json:"has_query"`
	FieldOverrides int    `json:"field_overrides_dropped,omitempty"`
}

// ConversionReport contains structured diagnostics for the entire conversion.
type ConversionReport struct {
	TotalPanels       int               `json:"total_panels"`
	MappedPanels      int               `json:"mapped_panels"`
	UnsupportedPanels int               `json:"unsupported_panels"`
	PartialPanels     int               `json:"partial_panels"`
	VariablesFound    int               `json:"variables_found"`
	FidelityPercent   int               `json:"fidelity_percent"`
	PanelDiagnostics  []PanelDiagnostic `json:"panel_diagnostics"`
}

func ConvertGrafanaDashboard(data []byte) (DashboardDocument, []string, error) {
	var envelope grafanaEnvelope
	if err := json.Unmarshal(data, &envelope); err != nil {
		return DashboardDocument{}, nil, fmt.Errorf("invalid grafana JSON: %w", err)
	}

	dashboard := envelope.Dashboard
	if dashboard == nil {
		var raw grafanaDashboard
		if err := json.Unmarshal(data, &raw); err != nil {
			return DashboardDocument{}, nil, fmt.Errorf("invalid grafana dashboard: %w", err)
		}
		dashboard = &raw
	}

	if strings.TrimSpace(dashboard.Title) == "" {
		return DashboardDocument{}, nil, fmt.Errorf("grafana dashboard title is required")
	}

	warnings := make([]string, 0)
	panels := make([]PanelResource, 0, len(dashboard.Panels))
	for idx, panel := range dashboard.Panels {
		mappedType, warning := mapGrafanaPanelType(panel.Type)
		if warning != "" {
			warnings = append(warnings, fmt.Sprintf("panel[%d] %s", idx, warning))
		}

		if panel.GridPos == nil {
			panel.GridPos = map[string]int{"x": 0, "y": idx * 8, "w": 12, "h": 8}
		}

		query := map[string]string{}
		if len(panel.Targets) > 0 {
			target := panel.Targets[0]
			expr := strings.TrimSpace(target.Expr)
			if expr == "" {
				expr = strings.TrimSpace(target.Query)
			}
			if expr != "" {
				query["expr"] = expr
			}
			if target.RefID != "" {
				query["ref_id"] = target.RefID
			}
		}

		queryRaw := json.RawMessage("{}")
		if len(query) > 0 {
			encodedQuery, err := json.Marshal(query)
			if err != nil {
				return DashboardDocument{}, nil, fmt.Errorf("failed to encode panel query: %w", err)
			}
			queryRaw = encodedQuery
		}

		panelTitle := strings.TrimSpace(panel.Title)
		if panelTitle == "" {
			panelTitle = fmt.Sprintf("Panel %d", idx+1)
		}

		panels = append(panels, PanelResource{
			Title:   panelTitle,
			Type:    mappedType,
			GridPos: panel.GridPos,
			Query:   queryRaw,
		})
	}

	variables := make([]VariableResource, 0, len(dashboard.Templating.List))
	for _, variable := range dashboard.Templating.List {
		query := strings.TrimSpace(variable.Query)
		if query == "" {
			query = strings.TrimSpace(variable.Definition)
		}
		variables = append(variables, VariableResource{
			Name:       variable.Name,
			Type:       variable.Type,
			Label:      variable.Label,
			Query:      query,
			Multi:      variable.Multi,
			IncludeAll: variable.IncludeAll,
		})
	}

	var timeRange *TimeRangeResource
	if dashboard.Time != nil {
		timeRange = &TimeRangeResource{
			From: dashboard.Time.From,
			To:   dashboard.Time.To,
		}
	}

	doc := DashboardDocument{
		SchemaVersion: CurrentSchemaVersion,
		Dashboard: DashboardResource{
			Title:           dashboard.Title,
			Description:     optionalString(dashboard.Description),
			Panels:          panels,
			Variables:       variables,
			TimeRange:       timeRange,
			RefreshInterval: optionalString(dashboard.Refresh),
		},
	}

	if err := ValidateDashboardDocument(doc); err != nil {
		return DashboardDocument{}, nil, err
	}

	return doc, warnings, nil
}

func mapGrafanaPanelType(panelType string) (string, string) {
	switch strings.ToLower(strings.TrimSpace(panelType)) {
	case "graph", "timeseries":
		return "line_chart", ""
	case "gauge":
		return "gauge", ""
	case "stat":
		return "stat", ""
	case "piechart", "pie chart":
		return "pie", ""
	case "logs":
		return "logs", ""
	case "table":
		return "table", ""
	case "bargauge":
		return "bar_gauge", ""
	case "barchart":
		return "bar_chart", ""
	case "heatmap":
		return "heatmap", ""
	case "histogram":
		return "histogram", ""
	default:
		return "line_chart", fmt.Sprintf("unsupported panel type %q mapped to line_chart", panelType)
	}
}

// ConvertGrafanaDashboardWithReport returns the converted document plus a structured fidelity report.
func ConvertGrafanaDashboardWithReport(data []byte) (DashboardDocument, ConversionReport, error) {
	var envelope grafanaEnvelope
	if err := json.Unmarshal(data, &envelope); err != nil {
		return DashboardDocument{}, ConversionReport{}, fmt.Errorf("invalid grafana JSON: %w", err)
	}

	dashboard := envelope.Dashboard
	if dashboard == nil {
		var raw grafanaDashboard
		if err := json.Unmarshal(data, &raw); err != nil {
			return DashboardDocument{}, ConversionReport{}, fmt.Errorf("invalid grafana dashboard: %w", err)
		}
		dashboard = &raw
	}

	if strings.TrimSpace(dashboard.Title) == "" {
		return DashboardDocument{}, ConversionReport{}, fmt.Errorf("grafana dashboard title is required")
	}

	// Count field overrides per panel from raw JSON
	overrideCounts := countFieldOverrides(data)

	report := ConversionReport{
		TotalPanels:      len(dashboard.Panels),
		PanelDiagnostics: make([]PanelDiagnostic, 0, len(dashboard.Panels)),
	}

	panels := make([]PanelResource, 0, len(dashboard.Panels))
	for idx, panel := range dashboard.Panels {
		mappedType, warning := mapGrafanaPanelType(panel.Type)

		diag := PanelDiagnostic{
			Index:        idx,
			Title:        strings.TrimSpace(panel.Title),
			OriginalType: panel.Type,
			MappedType:   mappedType,
			HasQuery:     len(panel.Targets) > 0 && (strings.TrimSpace(panel.Targets[0].Expr) != "" || strings.TrimSpace(panel.Targets[0].Query) != ""),
		}

		if idx < len(overrideCounts) {
			diag.FieldOverrides = overrideCounts[idx]
		}

		if warning != "" {
			diag.Status = "unsupported"
			diag.Warning = warning
			report.UnsupportedPanels++
		} else if !diag.HasQuery {
			diag.Status = "partial"
			diag.Warning = "no query expression found"
			report.PartialPanels++
		} else {
			diag.Status = "mapped"
			report.MappedPanels++
		}

		if diag.Title == "" {
			diag.Title = fmt.Sprintf("Panel %d", idx+1)
		}

		report.PanelDiagnostics = append(report.PanelDiagnostics, diag)

		if panel.GridPos == nil {
			panel.GridPos = map[string]int{"x": 0, "y": idx * 8, "w": 12, "h": 8}
		}

		query := map[string]string{}
		if len(panel.Targets) > 0 {
			target := panel.Targets[0]
			expr := strings.TrimSpace(target.Expr)
			if expr == "" {
				expr = strings.TrimSpace(target.Query)
			}
			if expr != "" {
				query["expr"] = expr
			}
			if target.RefID != "" {
				query["ref_id"] = target.RefID
			}
		}

		queryRaw := json.RawMessage("{}")
		if len(query) > 0 {
			encodedQuery, err := json.Marshal(query)
			if err != nil {
				return DashboardDocument{}, ConversionReport{}, fmt.Errorf("failed to encode panel query: %w", err)
			}
			queryRaw = encodedQuery
		}

		panelTitle := strings.TrimSpace(panel.Title)
		if panelTitle == "" {
			panelTitle = fmt.Sprintf("Panel %d", idx+1)
		}

		panels = append(panels, PanelResource{
			Title:   panelTitle,
			Type:    mappedType,
			GridPos: panel.GridPos,
			Query:   queryRaw,
		})
	}

	variables := make([]VariableResource, 0, len(dashboard.Templating.List))
	for _, variable := range dashboard.Templating.List {
		query := strings.TrimSpace(variable.Query)
		if query == "" {
			query = strings.TrimSpace(variable.Definition)
		}
		variables = append(variables, VariableResource{
			Name:       variable.Name,
			Type:       variable.Type,
			Label:      variable.Label,
			Query:      query,
			Multi:      variable.Multi,
			IncludeAll: variable.IncludeAll,
		})
	}
	report.VariablesFound = len(variables)

	var timeRange *TimeRangeResource
	if dashboard.Time != nil {
		timeRange = &TimeRangeResource{
			From: dashboard.Time.From,
			To:   dashboard.Time.To,
		}
	}

	doc := DashboardDocument{
		SchemaVersion: CurrentSchemaVersion,
		Dashboard: DashboardResource{
			Title:           dashboard.Title,
			Description:     optionalString(dashboard.Description),
			Panels:          panels,
			Variables:       variables,
			TimeRange:       timeRange,
			RefreshInterval: optionalString(dashboard.Refresh),
		},
	}

	if report.TotalPanels > 0 {
		report.FidelityPercent = (report.MappedPanels * 100) / report.TotalPanels
	}

	if err := ValidateDashboardDocument(doc); err != nil {
		return DashboardDocument{}, ConversionReport{}, err
	}

	return doc, report, nil
}

// countFieldOverrides attempts to count fieldConfig.overrides per panel from raw JSON.
func countFieldOverrides(data []byte) []int {
	type panelOverrides struct {
		FieldConfig *struct {
			Overrides []json.RawMessage `json:"overrides"`
		} `json:"fieldConfig"`
	}
	type dashWithPanels struct {
		Dashboard *struct {
			Panels []panelOverrides `json:"panels"`
		} `json:"dashboard"`
		Panels []panelOverrides `json:"panels"`
	}
	var d dashWithPanels
	if err := json.Unmarshal(data, &d); err != nil {
		return nil
	}
	panels := d.Panels
	if d.Dashboard != nil {
		panels = d.Dashboard.Panels
	}
	counts := make([]int, len(panels))
	for i, p := range panels {
		if p.FieldConfig != nil {
			counts[i] = len(p.FieldConfig.Overrides)
		}
	}
	return counts
}

func optionalString(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}
