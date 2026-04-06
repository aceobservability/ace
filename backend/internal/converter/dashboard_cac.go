package converter

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"go.yaml.in/yaml/v2"
)

const CurrentSchemaVersion = 2

// Valid panel types recognized by the frontend renderer.
var validPanelTypes = map[string]bool{
	"line_chart":    true,
	"bar_chart":     true,
	"gauge":         true,
	"stat":          true,
	"table":         true,
	"pie":           true,
	"logs":          true,
	"trace_list":    true,
	"trace_heatmap": true,
	"bar_gauge":     true,
	"heatmap":       true,
	"histogram":     true,
	"canvas":        true,
}

// ---------- Document types ----------

// DashboardDocument is the root of the v2 YAML/JSON export format.
type DashboardDocument struct {
	Version     int             `json:"version" yaml:"version"`
	Title       string          `json:"title" yaml:"title"`
	Description string          `json:"description,omitempty" yaml:"description,omitempty"`
	Panels      []PanelResource `json:"panels" yaml:"panels"`
}

type PanelResource struct {
	Title      string           `json:"title" yaml:"title"`
	Type       string           `json:"type" yaml:"type"`
	Position   GridPosition     `json:"position" yaml:"position,flow"`
	Datasource *DatasourceRef   `json:"datasource,omitempty" yaml:"datasource,omitempty"`
	Query      *QueryResource   `json:"query,omitempty" yaml:"query,omitempty"`
	Display    *DisplayResource `json:"display,omitempty" yaml:"display,omitempty"`
}

type GridPosition struct {
	X int `json:"x" yaml:"x"`
	Y int `json:"y" yaml:"y"`
	W int `json:"w" yaml:"w"`
	H int `json:"h" yaml:"h"`
}

// DatasourceRef identifies a datasource by human-readable name + type for portability.
type DatasourceRef struct {
	Name string `json:"name,omitempty" yaml:"name,omitempty"`
	Type string `json:"type" yaml:"type"`
}

// QueryResource holds structured data-fetching parameters.
type QueryResource struct {
	Expr    string         `json:"expr" yaml:"expr"`
	Signal  string         `json:"signal,omitempty" yaml:"signal,omitempty"`
	Legend  string         `json:"legend,omitempty" yaml:"legend,omitempty"`
	Limit   *int           `json:"limit,omitempty" yaml:"limit,omitempty"`
	Service string         `json:"service,omitempty" yaml:"service,omitempty"`
	RawData string         `json:"raw_data,omitempty" yaml:"raw_data,omitempty"`
	Extra   map[string]any `json:"extra,omitempty" yaml:"extra,omitempty"`
}

// DisplayResource holds optional visualization parameters.
//
// Pointer types are used for fields where false/0 are meaningful values
// (e.g., sparkline: false, min: 0). With omitempty, nil pointers are omitted
// but pointers to zero values (&false, &0.0) are preserved.
type DisplayResource struct {
	Min        *float64            `json:"min,omitempty" yaml:"min,omitempty"`
	Max        *float64            `json:"max,omitempty" yaml:"max,omitempty"`
	Unit       string              `json:"unit,omitempty" yaml:"unit,omitempty"`
	Decimals   *int                `json:"decimals,omitempty" yaml:"decimals,omitempty"`
	Thresholds []ThresholdResource `json:"thresholds,omitempty" yaml:"thresholds,omitempty"`
	Sparkline  *bool               `json:"sparkline,omitempty" yaml:"sparkline,omitempty"`
	Trend      *bool               `json:"trend,omitempty" yaml:"trend,omitempty"`
	Style      string              `json:"style,omitempty" yaml:"style,omitempty"`
	Legend     *bool               `json:"legend,omitempty" yaml:"legend,omitempty"`
	Labels     *bool               `json:"labels,omitempty" yaml:"labels,omitempty"`
}

type ThresholdResource struct {
	Value float64 `json:"value" yaml:"value"`
	Color string  `json:"color" yaml:"color"`
}

// ---------- Format helpers ----------

func NormalizeFormat(format string) string {
	normalized := strings.TrimSpace(strings.ToLower(format))
	switch normalized {
	case "", "json":
		return "json"
	case "yaml", "yml":
		return "yaml"
	default:
		return ""
	}
}

// ---------- Encode / Decode ----------

func DecodeDashboardDocument(data []byte, format string) (DashboardDocument, error) {
	normalized := NormalizeFormat(format)
	if normalized == "" {
		return DashboardDocument{}, errors.New("unsupported format")
	}

	var doc DashboardDocument
	var err error
	if normalized == "yaml" {
		err = yaml.Unmarshal(data, &doc)
	} else {
		err = json.Unmarshal(data, &doc)
	}
	if err != nil {
		return DashboardDocument{}, err
	}

	if doc.Version == 0 {
		doc.Version = CurrentSchemaVersion
	}

	if err := ValidateDashboardDocument(doc); err != nil {
		return DashboardDocument{}, err
	}

	return doc, nil
}

func EncodeDashboardDocument(doc DashboardDocument, format string) ([]byte, error) {
	normalized := NormalizeFormat(format)
	if normalized == "" {
		return nil, errors.New("unsupported format")
	}

	if err := ValidateDashboardDocument(doc); err != nil {
		return nil, err
	}

	if normalized == "yaml" {
		return yaml.Marshal(doc)
	}

	return json.MarshalIndent(doc, "", "  ")
}

// ---------- Validation ----------

func ValidateDashboardDocument(doc DashboardDocument) error {
	if doc.Version != CurrentSchemaVersion {
		return fmt.Errorf("unsupported version %d", doc.Version)
	}

	if strings.TrimSpace(doc.Title) == "" {
		return errors.New("title is required")
	}

	for i, panel := range doc.Panels {
		if strings.TrimSpace(panel.Title) == "" {
			return fmt.Errorf("panels[%d].title is required", i)
		}
		if strings.TrimSpace(panel.Type) == "" {
			return fmt.Errorf("panels[%d].type is required", i)
		}
		if !validPanelTypes[panel.Type] {
			return fmt.Errorf("panels[%d].type %q is not a recognized panel type", i, panel.Type)
		}
		pos := panel.Position
		if pos.W <= 0 || pos.H <= 0 {
			return fmt.Errorf("panels[%d].position width/height must be > 0", i)
		}
		if pos.X < 0 || pos.Y < 0 {
			return fmt.Errorf("panels[%d].position x/y must be >= 0", i)
		}
		if pos.X+pos.W > 12 {
			return fmt.Errorf("panels[%d].position x + w must be <= 12", i)
		}
	}

	return nil
}

// ---------- Query blob decomposition ----------

// Known keys in the DB query JSONB blob that map to QueryResource fields.
var queryKeys = map[string]bool{
	"expr": true, "promql": true, "signal": true, "legend_format": true,
	"limit": true, "service": true, "datasource_id": true, "canvasData": true,
}

// Known keys in the DB query JSONB blob that map to DisplayResource fields.
var displayKeys = map[string]bool{
	"min": true, "max": true, "unit": true, "decimals": true, "thresholds": true,
	"showSparkline": true, "showTrend": true, "displayAs": true,
	"showLegend": true, "showLabels": true,
}

// QueryBlobToResources decomposes a DB query JSONB blob into structured
// QueryResource and DisplayResource. The datasource_id is stripped (caller
// handles it separately via the resolver).
func QueryBlobToResources(raw json.RawMessage) (*QueryResource, *DisplayResource) {
	if len(raw) == 0 || string(raw) == "{}" || string(raw) == "null" {
		return nil, nil
	}

	var blob map[string]any
	if err := json.Unmarshal(raw, &blob); err != nil {
		return nil, nil
	}

	q := &QueryResource{}
	var d *DisplayResource

	// Query fields
	if v, ok := blob["expr"].(string); ok {
		q.Expr = v
	} else if v, ok := blob["promql"].(string); ok {
		q.Expr = v
	}
	if v, ok := blob["signal"].(string); ok {
		q.Signal = v
	}
	if v, ok := blob["legend_format"].(string); ok {
		q.Legend = v
	}
	if v, ok := blob["service"].(string); ok {
		q.Service = v
	}
	if v, ok := blob["limit"]; ok {
		if f, ok := v.(float64); ok {
			n := int(f)
			q.Limit = &n
		}
	}

	// Canvas data -> raw_data (JSON string to preserve fidelity)
	if v, ok := blob["canvasData"]; ok {
		if raw, err := json.Marshal(v); err == nil {
			q.RawData = string(raw)
		}
	}

	// Display fields
	if hasAnyDisplayKey(blob) {
		d = &DisplayResource{}

		if v, ok := blob["min"]; ok {
			if f, ok := v.(float64); ok {
				d.Min = &f
			}
		}
		if v, ok := blob["max"]; ok {
			if f, ok := v.(float64); ok {
				d.Max = &f
			}
		}
		if v, ok := blob["unit"].(string); ok {
			d.Unit = v
		}
		if v, ok := blob["decimals"]; ok {
			if f, ok := v.(float64); ok {
				n := int(f)
				d.Decimals = &n
			}
		}
		if v, ok := blob["thresholds"]; ok {
			d.Thresholds = parseThresholds(v)
		}
		if v, ok := blob["showSparkline"]; ok {
			if b, ok := v.(bool); ok {
				d.Sparkline = &b
			}
		}
		if v, ok := blob["showTrend"]; ok {
			if b, ok := v.(bool); ok {
				d.Trend = &b
			}
		}
		if v, ok := blob["displayAs"].(string); ok {
			d.Style = v
		}
		if v, ok := blob["showLegend"]; ok {
			if b, ok := v.(bool); ok {
				d.Legend = &b
			}
		}
		if v, ok := blob["showLabels"]; ok {
			if b, ok := v.(bool); ok {
				d.Labels = &b
			}
		}
	}

	// Unknown keys -> Extra
	for k, v := range blob {
		if queryKeys[k] || displayKeys[k] {
			continue
		}
		if q.Extra == nil {
			q.Extra = make(map[string]any)
		}
		q.Extra[k] = v
	}

	return q, d
}

func hasAnyDisplayKey(blob map[string]any) bool {
	for k := range blob {
		if displayKeys[k] {
			return true
		}
	}
	return false
}

func parseThresholds(v any) []ThresholdResource {
	arr, ok := v.([]any)
	if !ok {
		return nil
	}
	var result []ThresholdResource
	for _, item := range arr {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		t := ThresholdResource{}
		if val, ok := m["value"].(float64); ok {
			t.Value = val
		}
		if col, ok := m["color"].(string); ok {
			t.Color = col
		}
		result = append(result, t)
	}
	return result
}

// ResourcesToQueryBlob re-assembles structured QueryResource + DisplayResource
// back into the flat JSONB blob that the DB panels.query column expects.
// The dsID is injected as datasource_id into the blob.
func ResourcesToQueryBlob(q *QueryResource, d *DisplayResource, dsID *string) json.RawMessage {
	blob := make(map[string]any)

	if q != nil {
		if q.Expr != "" {
			blob["expr"] = q.Expr
		}
		if q.Signal != "" {
			blob["signal"] = q.Signal
		}
		if q.Legend != "" {
			blob["legend_format"] = q.Legend // reverse rename
		}
		if q.Limit != nil {
			blob["limit"] = *q.Limit
		}
		if q.Service != "" {
			blob["service"] = q.Service
		}
		if q.RawData != "" {
			var canvasData any
			if err := json.Unmarshal([]byte(q.RawData), &canvasData); err == nil {
				blob["canvasData"] = canvasData
			}
		}
		for k, v := range q.Extra {
			blob[k] = v
		}
	}

	if d != nil {
		if d.Min != nil {
			blob["min"] = *d.Min
		}
		if d.Max != nil {
			blob["max"] = *d.Max
		}
		if d.Unit != "" {
			blob["unit"] = d.Unit
		}
		if d.Decimals != nil {
			blob["decimals"] = *d.Decimals
		}
		if d.Thresholds != nil {
			var arr []map[string]any
			for _, t := range d.Thresholds {
				arr = append(arr, map[string]any{"value": t.Value, "color": t.Color})
			}
			blob["thresholds"] = arr
		}
		if d.Sparkline != nil {
			blob["showSparkline"] = *d.Sparkline // reverse rename
		}
		if d.Trend != nil {
			blob["showTrend"] = *d.Trend
		}
		if d.Style != "" {
			blob["displayAs"] = d.Style
		}
		if d.Legend != nil {
			blob["showLegend"] = *d.Legend
		}
		if d.Labels != nil {
			blob["showLabels"] = *d.Labels
		}
	}

	if dsID != nil {
		blob["datasource_id"] = *dsID
	}

	raw, err := json.Marshal(blob)
	if err != nil {
		return json.RawMessage("{}")
	}
	return raw
}

// ExtractDatasourceID pulls datasource_id from a raw query JSONB blob.
func ExtractDatasourceID(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var blob map[string]any
	if err := json.Unmarshal(raw, &blob); err != nil {
		return ""
	}
	if v, ok := blob["datasource_id"].(string); ok {
		return v
	}
	return ""
}
