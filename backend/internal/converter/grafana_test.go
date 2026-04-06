package converter

import (
	"strings"
	"testing"
)

func TestMapGrafanaPanelType(t *testing.T) {
	tests := []struct {
		input       string
		wantType    string
		wantWarning bool
	}{
		{"graph", "line_chart", false},
		{"timeseries", "line_chart", false},
		{"gauge", "gauge", false},
		{"stat", "stat", false},
		{"piechart", "pie", false},
		{"pie chart", "pie", false},
		{"logs", "logs", false},
		{"table", "table", false},
		{"bargauge", "bar_gauge", false},
		{"barchart", "bar_chart", false},
		{"heatmap", "heatmap", false},
		{"histogram", "histogram", false},
		{"Graph", "line_chart", false},
		{"TIMESERIES", "line_chart", false},
		{"Gauge", "gauge", false},
		{"PieChart", "pie", false},
		{"BarGauge", "bar_gauge", false},
		{" graph ", "line_chart", false},
		{" table ", "table", false},
		{"unknown_panel", "line_chart", true},
		{"nodeGraph", "line_chart", true},
		{"", "line_chart", true},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			gotType, gotWarning := mapGrafanaPanelType(tt.input)
			if gotType != tt.wantType {
				t.Errorf("mapGrafanaPanelType(%q) type = %q, want %q", tt.input, gotType, tt.wantType)
			}
			hasWarning := gotWarning != ""
			if hasWarning != tt.wantWarning {
				t.Errorf("mapGrafanaPanelType(%q) warning = %q, wantWarning = %v", tt.input, gotWarning, tt.wantWarning)
			}
		})
	}
}

func TestConvertGrafanaDashboard_EnvelopeFormat(t *testing.T) {
	payload := []byte(`{
  "dashboard": {
    "title": "Grafana CPU",
    "description": "CPU monitoring",
    "refresh": "10s",
    "time": {"from": "now-6h", "to": "now"},
    "templating": {
      "list": [
        {"name": "service", "type": "query", "label": "Service", "query": "label_values(up, service)", "multi": true, "includeAll": true}
      ]
    },
    "panels": [
      {"title": "CPU Usage", "type": "timeseries", "gridPos": {"x": 0, "y": 0, "w": 12, "h": 8}, "targets": [{"refId": "A", "expr": "sum(rate(container_cpu_usage_seconds_total[5m]))"}]},
      {"title": "Requests", "type": "gauge", "gridPos": {"x": 0, "y": 8, "w": 6, "h": 4}, "targets": [{"refId": "B", "expr": "sum(up)"}]}
    ]
  }
}`)

	doc, warnings, err := ConvertGrafanaDashboard(payload)
	if err != nil {
		t.Fatalf("expected conversion to succeed: %v", err)
	}

	if doc.Title != "Grafana CPU" {
		t.Fatalf("expected title 'Grafana CPU', got %q", doc.Title)
	}
	if len(doc.Panels) != 2 {
		t.Fatalf("expected 2 panels, got %d", len(doc.Panels))
	}
	if doc.Panels[0].Type != "line_chart" {
		t.Fatalf("expected timeseries -> line_chart, got %q", doc.Panels[0].Type)
	}
	if doc.Panels[1].Type != "gauge" {
		t.Fatalf("expected gauge -> gauge, got %q", doc.Panels[1].Type)
	}
	if len(warnings) != 0 {
		t.Fatalf("expected no warnings, got %d: %v", len(warnings), warnings)
	}
	if doc.Panels[0].Position.W != 12 || doc.Panels[0].Position.H != 8 {
		t.Fatalf("expected position w=12 h=8, got %+v", doc.Panels[0].Position)
	}
	if doc.Panels[0].Query == nil || doc.Panels[0].Query.Expr == "" {
		t.Fatal("expected panel to have a query with expr")
	}
}

func TestConvertGrafanaDashboard_RawFormat(t *testing.T) {
	payload := []byte(`{"title": "Raw Dashboard", "panels": [{"title": "Panel 1", "type": "stat", "gridPos": {"x": 0, "y": 0, "w": 6, "h": 4}, "targets": [{"refId": "A", "expr": "up"}]}]}`)

	doc, _, err := ConvertGrafanaDashboard(payload)
	if err != nil {
		t.Fatalf("expected raw format to succeed: %v", err)
	}
	if doc.Title != "Raw Dashboard" {
		t.Fatalf("expected title 'Raw Dashboard', got %q", doc.Title)
	}
	if doc.Panels[0].Type != "stat" {
		t.Fatalf("expected stat panel type, got %q", doc.Panels[0].Type)
	}
}

func TestConvertGrafanaDashboard_AllPanelTypes(t *testing.T) {
	panels := []struct {
		grafanaType string
		aceType     string
	}{
		{"graph", "line_chart"}, {"timeseries", "line_chart"}, {"gauge", "gauge"},
		{"stat", "stat"}, {"piechart", "pie"}, {"logs", "logs"}, {"table", "table"},
		{"bargauge", "bar_gauge"}, {"barchart", "bar_chart"}, {"heatmap", "heatmap"}, {"histogram", "histogram"},
	}

	for _, p := range panels {
		t.Run(p.grafanaType, func(t *testing.T) {
			payload := []byte(`{"title": "Test", "panels": [{"title": "P", "type": "` + p.grafanaType + `", "gridPos": {"x": 0, "y": 0, "w": 12, "h": 8}, "targets": [{"refId": "A", "expr": "up"}]}]}`)
			doc, warnings, err := ConvertGrafanaDashboard(payload)
			if err != nil {
				t.Fatalf("conversion failed for %s: %v", p.grafanaType, err)
			}
			if doc.Panels[0].Type != p.aceType {
				t.Errorf("%s -> got %q, want %q", p.grafanaType, doc.Panels[0].Type, p.aceType)
			}
			if len(warnings) != 0 {
				t.Errorf("%s: unexpected warnings: %v", p.grafanaType, warnings)
			}
		})
	}
}

func TestConvertGrafanaDashboard_UnsupportedPanelTypeWarning(t *testing.T) {
	payload := []byte(`{"title": "Test", "panels": [{"title": "Custom Plugin", "type": "custom-plugin-panel", "gridPos": {"x": 0, "y": 0, "w": 12, "h": 8}, "targets": [{"refId": "A", "expr": "up"}]}]}`)

	doc, warnings, err := ConvertGrafanaDashboard(payload)
	if err != nil {
		t.Fatalf("conversion failed: %v", err)
	}
	if doc.Panels[0].Type != "line_chart" {
		t.Errorf("expected fallback to line_chart, got %q", doc.Panels[0].Type)
	}
	if len(warnings) != 1 {
		t.Fatalf("expected 1 warning, got %d", len(warnings))
	}
	if !strings.Contains(warnings[0], "custom-plugin-panel") {
		t.Errorf("warning should mention the unsupported type: %s", warnings[0])
	}
}

func TestConvertGrafanaDashboard_TitleRequired(t *testing.T) {
	_, _, err := ConvertGrafanaDashboard([]byte(`{"dashboard":{"title":"","panels":[]}}`))
	if err == nil {
		t.Fatal("expected error for missing title")
	}
}

func TestConvertGrafanaDashboard_MalformedJSON(t *testing.T) {
	_, _, err := ConvertGrafanaDashboard([]byte(`{not valid json`))
	if err == nil {
		t.Fatal("expected error for malformed JSON")
	}
}

func TestConvertGrafanaDashboard_MissingTitle(t *testing.T) {
	_, _, err := ConvertGrafanaDashboard([]byte(`{"panels": [{"title": "P", "type": "stat", "gridPos": {"x": 0, "y": 0, "w": 6, "h": 4}, "targets": [{"refId": "A", "expr": "up"}]}]}`))
	if err == nil {
		t.Fatal("expected error for missing title")
	}
}

func TestConvertGrafanaDashboard_MissingPanelTitle(t *testing.T) {
	payload := []byte(`{"title": "Test", "panels": [{"title": "", "type": "stat", "gridPos": {"x": 0, "y": 0, "w": 6, "h": 4}, "targets": [{"refId": "A", "expr": "up"}]}]}`)
	doc, _, err := ConvertGrafanaDashboard(payload)
	if err != nil {
		t.Fatalf("conversion should succeed with auto-generated title: %v", err)
	}
	if doc.Panels[0].Title != "Panel 1" {
		t.Errorf("expected auto-generated title 'Panel 1', got %q", doc.Panels[0].Title)
	}
}

func TestConvertGrafanaDashboard_MissingGridPos(t *testing.T) {
	payload := []byte(`{"title": "Test", "panels": [{"title": "P", "type": "stat", "targets": [{"refId": "A", "expr": "up"}]}]}`)
	doc, _, err := ConvertGrafanaDashboard(payload)
	if err != nil {
		t.Fatalf("should auto-generate position: %v", err)
	}
	pos := doc.Panels[0].Position
	if pos.W != 12 || pos.H != 8 {
		t.Errorf("expected default position w=12 h=8, got %+v", pos)
	}
}

func TestConvertGrafanaDashboardWithReport_VariablesCount(t *testing.T) {
	payload := []byte(`{"title": "Vars Test", "templating": {"list": [{"name": "job", "type": "query", "query": "label_values(up, job)"}, {"name": "env", "type": "custom", "definition": "prod,staging,dev", "multi": true, "includeAll": true}, {"name": "const", "type": "constant", "query": "fixed-value"}]}, "panels": [{"title": "P", "type": "stat", "gridPos": {"x": 0, "y": 0, "w": 6, "h": 4}, "targets": [{"refId": "A", "expr": "up"}]}]}`)

	doc, report, err := ConvertGrafanaDashboardWithReport(payload)
	if err != nil {
		t.Fatalf("conversion failed: %v", err)
	}
	if report.VariablesFound != 3 {
		t.Fatalf("expected 3 variables in report, got %d", report.VariablesFound)
	}
	if doc.Title != "Vars Test" {
		t.Fatalf("expected title 'Vars Test', got %q", doc.Title)
	}
}

func TestConvertGrafanaDashboard_QueryFallbackToQueryField(t *testing.T) {
	payload := []byte(`{"title": "Test", "panels": [{"title": "P", "type": "table", "gridPos": {"x": 0, "y": 0, "w": 12, "h": 8}, "targets": [{"refId": "A", "query": "sum(up)"}]}]}`)
	doc, _, err := ConvertGrafanaDashboard(payload)
	if err != nil {
		t.Fatalf("conversion failed: %v", err)
	}
	if doc.Panels[0].Query == nil || doc.Panels[0].Query.Expr != "sum(up)" {
		t.Errorf("expected query expr 'sum(up)', got %v", doc.Panels[0].Query)
	}
}
