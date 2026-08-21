package handlers

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/aceobservability/ace/backend/internal/datasource"
	"github.com/aceobservability/ace/backend/internal/models"
)

var (
	// ErrDatasourceNotFound is returned when the datasource id does not exist.
	ErrDatasourceNotFound = errors.New("datasource not found")
	// ErrQueryRequired is returned when a query/expr is missing.
	ErrQueryRequired = errors.New("query is required")
	// ErrLabelRequired is returned when a label name is missing.
	ErrLabelRequired = errors.New("label name is required")
	// ErrTraceIDRequired is returned when a trace id is missing.
	ErrTraceIDRequired = errors.New("trace id is required")
	// ErrMetricNamesUnsupported is returned when the datasource cannot list metric names.
	ErrMetricNamesUnsupported = errors.New("metric name discovery is only supported for Prometheus and VictoriaMetrics datasources")
	// ErrLabelsUnsupported is returned when the datasource cannot list labels.
	ErrLabelsUnsupported = errors.New("label discovery is not supported for this datasource type")
	// ErrLabelValuesUnsupported is returned when the datasource cannot list label values.
	ErrLabelValuesUnsupported = errors.New("label value discovery is not supported for this datasource type")
	// ErrNotTracingDatasource is returned when a tracing endpoint is used on a non-tracing datasource.
	ErrNotTracingDatasource = errors.New("trace endpoints are only supported for tracing datasources")
	// ErrUseTracingEndpoints is returned when /query cannot serve a tracing datasource.
	ErrUseTracingEndpoints = errors.New("datasource does not support /query; use tracing endpoints")
)

const datasourceSelect = `SELECT id, organization_id, name, type, url, is_default, auth_type, auth_config, trace_id_field, linked_trace_datasource_id, created_at, updated_at
		 FROM datasources WHERE id = $1`

func (h *DataSourceHandler) loadAccessibleDatasource(ctx context.Context, userID, dsID uuid.UUID) (*models.DataSource, error) {
	var ds models.DataSource
	err := h.pool.QueryRow(ctx, datasourceSelect, dsID).Scan(
		&ds.ID, &ds.OrganizationID, &ds.Name, &ds.Type, &ds.URL, &ds.IsDefault,
		&ds.AuthType, &ds.AuthConfig, &ds.TraceIDField, &ds.LinkedTraceDatasourceID,
		&ds.CreatedAt, &ds.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrDatasourceNotFound
		}
		return nil, err
	}

	if _, err := h.checkOrgMembership(ctx, userID, ds.OrganizationID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotOrgMember
		}
		return nil, err
	}
	return &ds, nil
}

func emptyStrings(in []string) []string {
	if in == nil {
		return []string{}
	}
	return in
}

// GetMetricNames lists metric names for an org-accessible PromQL datasource.
func (h *DataSourceHandler) GetMetricNames(ctx context.Context, userID, dsID uuid.UUID, search string) ([]string, error) {
	ds, err := h.loadAccessibleDatasource(ctx, userID, dsID)
	if err != nil {
		return nil, err
	}

	client, err := datasource.NewClient(*ds)
	if err != nil {
		return nil, err
	}
	namesClient, ok := client.(datasource.MetricNamesClient)
	if !ok {
		return nil, ErrMetricNamesUnsupported
	}
	names, err := namesClient.MetricNames(ctx, search)
	if err != nil {
		return nil, err
	}
	return emptyStrings(names), nil
}

// GetLabels lists label names for an org-accessible datasource.
func (h *DataSourceHandler) GetLabels(ctx context.Context, userID, dsID uuid.UUID, metric string) ([]string, error) {
	ds, err := h.loadAccessibleDatasource(ctx, userID, dsID)
	if err != nil {
		return nil, err
	}

	client, err := datasource.NewClient(*ds)
	if err != nil {
		return nil, err
	}

	var labels []string
	switch c := client.(type) {
	case datasource.MetricLabelsClient:
		labels, err = c.Labels(ctx, metric)
	case datasource.LabelsClient:
		labels, err = c.Labels(ctx)
	default:
		return nil, ErrLabelsUnsupported
	}
	if err != nil {
		return nil, err
	}
	return emptyStrings(labels), nil
}

// GetLabelValues lists values for a label on an org-accessible datasource.
func (h *DataSourceHandler) GetLabelValues(ctx context.Context, userID, dsID uuid.UUID, label, metric string) ([]string, error) {
	label = strings.TrimSpace(label)
	if label == "" {
		return nil, ErrLabelRequired
	}

	ds, err := h.loadAccessibleDatasource(ctx, userID, dsID)
	if err != nil {
		return nil, err
	}

	client, err := datasource.NewClient(*ds)
	if err != nil {
		return nil, err
	}

	var values []string
	switch c := client.(type) {
	case datasource.MetricLabelValuesClient:
		values, err = c.LabelValues(ctx, label, metric)
	case datasource.LabelValuesClient:
		values, err = c.LabelValues(ctx, label)
	default:
		return nil, ErrLabelValuesUnsupported
	}
	if err != nil {
		return nil, err
	}
	return emptyStrings(values), nil
}

// ExecuteQuery runs POST /api/datasources/{id}/query for an org-accessible datasource.
func (h *DataSourceHandler) ExecuteQuery(ctx context.Context, userID, dsID uuid.UUID, queryReq datasource.QueryRequest) (*datasource.QueryResult, error) {
	ds, err := h.loadAccessibleDatasource(ctx, userID, dsID)
	if err != nil {
		return nil, err
	}

	if ds.Type == models.DataSourceTempo || ds.Type == models.DataSourceVictoriaTraces {
		return nil, ErrUseTracingEndpoints
	}

	if strings.TrimSpace(queryReq.Query) == "" {
		return nil, ErrQueryRequired
	}

	start := time.Now().Add(-1 * time.Hour)
	end := time.Now()
	step := 15 * time.Second
	if queryReq.Start > 0 {
		start = time.Unix(queryReq.Start, 0)
	}
	if queryReq.End > 0 {
		end = time.Unix(queryReq.End, 0)
	}
	if queryReq.Step > 0 {
		step = time.Duration(queryReq.Step) * time.Second
	}

	client, err := datasource.NewClient(*ds)
	if err != nil {
		return nil, err
	}

	signal := strings.TrimSpace(queryReq.Signal)
	var result *datasource.QueryResult
	if qws, ok := client.(datasource.SignalQueryClient); ok {
		result, err = qws.QueryWithSignal(ctx, queryReq.Query, signal, start, end, step, queryReq.Limit)
	} else {
		result, err = client.Query(ctx, queryReq.Query, start, end, step, queryReq.Limit)
	}
	if err != nil {
		return nil, err
	}
	if result == nil {
		return &datasource.QueryResult{Status: "success"}, nil
	}
	return result, nil
}

// GetTraceServices lists service names from an org-accessible tracing datasource.
func (h *DataSourceHandler) GetTraceServices(ctx context.Context, userID, dsID uuid.UUID) ([]string, error) {
	ds, err := h.loadAccessibleDatasource(ctx, userID, dsID)
	if err != nil {
		return nil, err
	}
	if !ds.Type.IsTraces() {
		return nil, ErrNotTracingDatasource
	}

	client, err := datasource.NewTracingClient(*ds)
	if err != nil {
		return nil, err
	}
	services, err := client.Services(ctx)
	if err != nil {
		return nil, err
	}
	return emptyStrings(services), nil
}

// ExecuteTraceSearch searches traces on an org-accessible tracing datasource.
func (h *DataSourceHandler) ExecuteTraceSearch(ctx context.Context, userID, dsID uuid.UUID, req datasource.TraceSearchRequest) ([]datasource.TraceSummary, error) {
	ds, err := h.loadAccessibleDatasource(ctx, userID, dsID)
	if err != nil {
		return nil, err
	}
	if !ds.Type.IsTraces() {
		return nil, ErrNotTracingDatasource
	}

	client, err := datasource.NewTracingClient(*ds)
	if err != nil {
		return nil, err
	}
	traces, err := client.SearchTraces(ctx, req)
	if err != nil {
		return nil, err
	}
	if traces == nil {
		return []datasource.TraceSummary{}, nil
	}
	return traces, nil
}

// FetchTrace loads a trace by id from an org-accessible tracing datasource.
func (h *DataSourceHandler) FetchTrace(ctx context.Context, userID, dsID uuid.UUID, traceID string) (*datasource.Trace, error) {
	traceID = strings.TrimSpace(traceID)
	if traceID == "" {
		return nil, ErrTraceIDRequired
	}

	ds, err := h.loadAccessibleDatasource(ctx, userID, dsID)
	if err != nil {
		return nil, err
	}
	if !ds.Type.IsTraces() {
		return nil, ErrNotTracingDatasource
	}

	client, err := datasource.NewTracingClient(*ds)
	if err != nil {
		return nil, err
	}
	return client.GetTrace(ctx, traceID)
}
