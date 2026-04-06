package converter

import (
	"encoding/json"
	"testing"
)

func TestEncodeDecodeDashboardDocumentJSON(t *testing.T) {
	doc := DashboardDocument{
		Version: CurrentSchemaVersion,
		Title:   "Service Health",
		Panels: []PanelResource{
			{
				Title:    "CPU",
				Type:     "line_chart",
				Position: GridPosition{X: 0, Y: 0, W: 12, H: 8},
			},
		},
	}

	encoded, err := EncodeDashboardDocument(doc, "json")
	if err != nil {
		t.Fatalf("expected JSON encode to succeed: %v", err)
	}

	decoded, err := DecodeDashboardDocument(encoded, "json")
	if err != nil {
		t.Fatalf("expected JSON decode to succeed: %v", err)
	}

	if decoded.Title != doc.Title {
		t.Fatalf("expected title %q, got %q", doc.Title, decoded.Title)
	}
	if len(decoded.Panels) != 1 {
		t.Fatalf("expected 1 panel, got %d", len(decoded.Panels))
	}
}

func TestDecodeDashboardDocumentYAML(t *testing.T) {
	payload := []byte(`version: 2
title: API Overview
panels:
  - title: Requests
    type: line_chart
    position: {x: 0, y: 0, w: 8, h: 6}
`)

	decoded, err := DecodeDashboardDocument(payload, "yaml")
	if err != nil {
		t.Fatalf("expected YAML decode to succeed: %v", err)
	}

	if decoded.Title != "API Overview" {
		t.Fatalf("expected title %q, got %q", "API Overview", decoded.Title)
	}
	p := decoded.Panels[0]
	if p.Position.X != 0 || p.Position.Y != 0 || p.Position.W != 8 || p.Position.H != 6 {
		t.Fatalf("unexpected position: %+v", p.Position)
	}
}

func TestDecodeDashboardDocumentValidationError(t *testing.T) {
	payload := []byte(`{"version":2,"title":"","panels":[]}`)

	_, err := DecodeDashboardDocument(payload, "json")
	if err == nil {
		t.Fatal("expected decode to fail for missing title")
	}
}

func TestValidateDashboardDocumentV2(t *testing.T) {
	tests := []struct {
		name    string
		doc     DashboardDocument
		wantErr string
	}{
		{
			name:    "wrong version",
			doc:     DashboardDocument{Version: 1, Title: "T", Panels: []PanelResource{{Title: "P", Type: "stat", Position: GridPosition{W: 4, H: 4}}}},
			wantErr: "unsupported version 1",
		},
		{
			name:    "empty title",
			doc:     DashboardDocument{Version: 2, Title: "", Panels: []PanelResource{{Title: "P", Type: "stat", Position: GridPosition{W: 4, H: 4}}}},
			wantErr: "title is required",
		},
		{
			name:    "panel missing title",
			doc:     DashboardDocument{Version: 2, Title: "T", Panels: []PanelResource{{Title: "", Type: "stat", Position: GridPosition{W: 4, H: 4}}}},
			wantErr: "panels[0].title is required",
		},
		{
			name:    "panel missing type",
			doc:     DashboardDocument{Version: 2, Title: "T", Panels: []PanelResource{{Title: "P", Type: "", Position: GridPosition{W: 4, H: 4}}}},
			wantErr: "panels[0].type is required",
		},
		{
			name:    "invalid panel type",
			doc:     DashboardDocument{Version: 2, Title: "T", Panels: []PanelResource{{Title: "P", Type: "unknown", Position: GridPosition{W: 4, H: 4}}}},
			wantErr: "not a recognized panel type",
		},
		{
			name:    "position width zero",
			doc:     DashboardDocument{Version: 2, Title: "T", Panels: []PanelResource{{Title: "P", Type: "stat", Position: GridPosition{W: 0, H: 4}}}},
			wantErr: "width/height must be > 0",
		},
		{
			name:    "position x+w exceeds 12",
			doc:     DashboardDocument{Version: 2, Title: "T", Panels: []PanelResource{{Title: "P", Type: "stat", Position: GridPosition{X: 8, W: 6, H: 4}}}},
			wantErr: "x + w must be <= 12",
		},
		{
			name:    "negative x",
			doc:     DashboardDocument{Version: 2, Title: "T", Panels: []PanelResource{{Title: "P", Type: "stat", Position: GridPosition{X: -1, W: 4, H: 4}}}},
			wantErr: "x/y must be >= 0",
		},
		{
			name: "valid document",
			doc: DashboardDocument{
				Version: 2, Title: "T",
				Panels: []PanelResource{{Title: "P", Type: "stat", Position: GridPosition{X: 0, Y: 0, W: 4, H: 4}}},
			},
			wantErr: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateDashboardDocument(tt.doc)
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("expected no error, got: %v", err)
				}
				return
			}
			if err == nil {
				t.Fatalf("expected error containing %q", tt.wantErr)
			}
			if !containsSubstring(err.Error(), tt.wantErr) {
				t.Fatalf("expected error containing %q, got: %v", tt.wantErr, err)
			}
		})
	}
}

func containsSubstring(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

func TestQueryBlobToResources(t *testing.T) {
	boolPtr := func(v bool) *bool { return &v }
	floatPtr := func(v float64) *float64 { return &v }
	intPtr := func(v int) *int { return &v }

	tests := []struct {
		name        string
		blob        string
		wantQuery   *QueryResource
		wantDisplay *DisplayResource
	}{
		{name: "empty blob", blob: `{}`, wantQuery: nil, wantDisplay: nil},
		{
			name: "metrics panel", blob: `{"expr":"rate(up[5m])","signal":"metrics","legend_format":"{{instance}}","datasource_id":"abc-123"}`,
			wantQuery: &QueryResource{Expr: "rate(up[5m])", Signal: "metrics", Legend: "{{instance}}"}, wantDisplay: nil,
		},
		{
			name: "promql alias", blob: `{"promql":"up","signal":"metrics"}`,
			wantQuery: &QueryResource{Expr: "up", Signal: "metrics"}, wantDisplay: nil,
		},
		{
			name: "gauge panel", blob: `{"expr":"mem_used","signal":"metrics","min":0,"max":100,"unit":"bytes","thresholds":[{"value":80,"color":"#f00"}]}`,
			wantQuery:   &QueryResource{Expr: "mem_used", Signal: "metrics"},
			wantDisplay: &DisplayResource{Min: floatPtr(0), Max: floatPtr(100), Unit: "bytes", Thresholds: []ThresholdResource{{Value: 80, Color: "#f00"}}},
		},
		{
			name: "stat panel", blob: `{"expr":"up","signal":"metrics","showSparkline":false,"showTrend":true,"unit":"","decimals":0}`,
			wantQuery:   &QueryResource{Expr: "up", Signal: "metrics"},
			wantDisplay: &DisplayResource{Sparkline: boolPtr(false), Trend: boolPtr(true), Decimals: intPtr(0)},
		},
		{
			name: "pie panel", blob: `{"expr":"sum(up)","signal":"metrics","displayAs":"donut","showLegend":true,"showLabels":false}`,
			wantQuery:   &QueryResource{Expr: "sum(up)", Signal: "metrics"},
			wantDisplay: &DisplayResource{Style: "donut", Legend: boolPtr(true), Labels: boolPtr(false)},
		},
		{
			name: "trace panel", blob: `{"expr":"{}","limit":50,"service":"api"}`,
			wantQuery: &QueryResource{Expr: "{}", Limit: intPtr(50), Service: "api"}, wantDisplay: nil,
		},
		{
			name: "unknown keys go to extra", blob: `{"expr":"up","ref_id":"A","custom_field":"value"}`,
			wantQuery: &QueryResource{Expr: "up", Extra: map[string]any{"ref_id": "A", "custom_field": "value"}}, wantDisplay: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			q, d := QueryBlobToResources(json.RawMessage(tt.blob))

			if tt.wantQuery == nil {
				if q != nil {
					t.Fatalf("expected nil query, got %+v", q)
				}
			} else {
				if q == nil {
					t.Fatal("expected non-nil query")
				}
				if q.Expr != tt.wantQuery.Expr {
					t.Errorf("expr: got %q, want %q", q.Expr, tt.wantQuery.Expr)
				}
				if q.Signal != tt.wantQuery.Signal {
					t.Errorf("signal: got %q, want %q", q.Signal, tt.wantQuery.Signal)
				}
				if q.Legend != tt.wantQuery.Legend {
					t.Errorf("legend: got %q, want %q", q.Legend, tt.wantQuery.Legend)
				}
				if q.Service != tt.wantQuery.Service {
					t.Errorf("service: got %q, want %q", q.Service, tt.wantQuery.Service)
				}
				if (q.Limit == nil) != (tt.wantQuery.Limit == nil) {
					t.Errorf("limit nil mismatch: got %v, want %v", q.Limit, tt.wantQuery.Limit)
				} else if q.Limit != nil && *q.Limit != *tt.wantQuery.Limit {
					t.Errorf("limit: got %d, want %d", *q.Limit, *tt.wantQuery.Limit)
				}
				if tt.wantQuery.Extra != nil {
					for k := range tt.wantQuery.Extra {
						if _, ok := q.Extra[k]; !ok {
							t.Errorf("missing extra key %q", k)
						}
					}
				}
			}

			if tt.wantDisplay == nil {
				if d != nil {
					t.Fatalf("expected nil display, got %+v", d)
				}
			} else {
				if d == nil {
					t.Fatal("expected non-nil display")
				}
				comparePtrFloat(t, "min", d.Min, tt.wantDisplay.Min)
				comparePtrFloat(t, "max", d.Max, tt.wantDisplay.Max)
				if d.Unit != tt.wantDisplay.Unit {
					t.Errorf("unit: got %q, want %q", d.Unit, tt.wantDisplay.Unit)
				}
				comparePtrBool(t, "sparkline", d.Sparkline, tt.wantDisplay.Sparkline)
				comparePtrBool(t, "trend", d.Trend, tt.wantDisplay.Trend)
				comparePtrBool(t, "legend", d.Legend, tt.wantDisplay.Legend)
				comparePtrBool(t, "labels", d.Labels, tt.wantDisplay.Labels)
				comparePtrInt(t, "decimals", d.Decimals, tt.wantDisplay.Decimals)
				if d.Style != tt.wantDisplay.Style {
					t.Errorf("style: got %q, want %q", d.Style, tt.wantDisplay.Style)
				}
				if len(d.Thresholds) != len(tt.wantDisplay.Thresholds) {
					t.Errorf("thresholds count: got %d, want %d", len(d.Thresholds), len(tt.wantDisplay.Thresholds))
				}
			}
		})
	}
}

func TestResourcesToQueryBlob(t *testing.T) {
	dsID := "ds-123"
	q := &QueryResource{Expr: "rate(up[5m])", Signal: "metrics", Legend: "{{instance}}"}
	f := false
	d := &DisplayResource{Sparkline: &f}

	raw := ResourcesToQueryBlob(q, d, &dsID)

	var blob map[string]any
	if err := json.Unmarshal(raw, &blob); err != nil {
		t.Fatalf("failed to unmarshal blob: %v", err)
	}

	if blob["legend_format"] != "{{instance}}" {
		t.Errorf("expected legend_format, got %v", blob["legend_format"])
	}
	if _, ok := blob["legend"]; ok {
		t.Error("should not have 'legend' key, should be 'legend_format'")
	}
	if blob["showSparkline"] != false {
		t.Errorf("expected showSparkline=false, got %v", blob["showSparkline"])
	}
	if blob["datasource_id"] != "ds-123" {
		t.Errorf("expected datasource_id, got %v", blob["datasource_id"])
	}
}

func TestExtractDatasourceID(t *testing.T) {
	raw := json.RawMessage(`{"expr":"up","datasource_id":"abc-123","signal":"metrics"}`)
	id := ExtractDatasourceID(raw)
	if id != "abc-123" {
		t.Fatalf("expected abc-123, got %q", id)
	}

	empty := ExtractDatasourceID(json.RawMessage(`{"expr":"up"}`))
	if empty != "" {
		t.Fatalf("expected empty, got %q", empty)
	}
}

func TestCanvasDataRoundTrip(t *testing.T) {
	blob := `{"canvasData":{"elements":[{"type":"rect","x":10,"y":20}],"appState":{"zoom":1.5}}}`
	q, _ := QueryBlobToResources(json.RawMessage(blob))
	if q == nil || q.RawData == "" {
		t.Fatal("expected canvasData to be captured in RawData")
	}

	raw := ResourcesToQueryBlob(q, nil, nil)
	var result map[string]any
	if err := json.Unmarshal(raw, &result); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}
	cd, ok := result["canvasData"].(map[string]any)
	if !ok {
		t.Fatal("expected canvasData to be restored")
	}
	elems, ok := cd["elements"].([]any)
	if !ok || len(elems) != 1 {
		t.Fatalf("expected 1 element in canvasData, got %v", cd["elements"])
	}
}

func TestGridPositionFlowYAML(t *testing.T) {
	doc := DashboardDocument{
		Version: 2,
		Title:   "Test",
		Panels: []PanelResource{
			{Title: "P", Type: "stat", Position: GridPosition{X: 0, Y: 0, W: 6, H: 4}},
		},
	}

	encoded, err := EncodeDashboardDocument(doc, "yaml")
	if err != nil {
		t.Fatalf("encode failed: %v", err)
	}

	yamlStr := string(encoded)
	if !containsSubstring(yamlStr, "x:") || !containsSubstring(yamlStr, "w:") {
		t.Errorf("expected flow-style position in YAML output:\n%s", yamlStr)
	}
}

func comparePtrBool(t *testing.T, name string, got, want *bool) {
	t.Helper()
	if (got == nil) != (want == nil) {
		t.Errorf("%s: got %v, want %v", name, got, want)
	} else if got != nil && *got != *want {
		t.Errorf("%s: got %v, want %v", name, *got, *want)
	}
}

func comparePtrFloat(t *testing.T, name string, got, want *float64) {
	t.Helper()
	if (got == nil) != (want == nil) {
		t.Errorf("%s: got %v, want %v", name, got, want)
	} else if got != nil && *got != *want {
		t.Errorf("%s: got %v, want %v", name, *got, *want)
	}
}

func comparePtrInt(t *testing.T, name string, got, want *int) {
	t.Helper()
	if (got == nil) != (want == nil) {
		t.Errorf("%s: got %v, want %v", name, got, want)
	} else if got != nil && *got != *want {
		t.Errorf("%s: got %v, want %v", name, *got, *want)
	}
}
