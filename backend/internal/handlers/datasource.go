package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/aceobservability/ace/backend/internal/analytics"
	"github.com/aceobservability/ace/backend/internal/auth"
	"github.com/aceobservability/ace/backend/internal/datasource"
	"github.com/aceobservability/ace/backend/internal/models"
)

// validateDatasourceURL validates a datasource URL to prevent SSRF attacks.
// Unlike AI provider URLs, datasource URLs may legitimately target private
// networks (e.g. Prometheus on an internal IP). We only block the cloud
// metadata endpoint (169.254.169.254) which is the primary SSRF target.
func validateDatasourceURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("invalid url: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("url must use http or https scheme")
	}
	if u.Host == "" {
		return fmt.Errorf("url must have a host")
	}
	if strings.Contains(raw, "@") {
		return fmt.Errorf("url must not contain userinfo")
	}

	hostname := u.Hostname()
	if ip := net.ParseIP(hostname); ip != nil {
		if ip.Equal(net.ParseIP("169.254.169.254")) {
			return fmt.Errorf("url must not target cloud metadata endpoint")
		}
	}
	// Also resolve hostname to catch DNS-based SSRF
	if ips, err := net.LookupHost(hostname); err == nil {
		for _, ipStr := range ips {
			if ip := net.ParseIP(ipStr); ip != nil && ip.Equal(net.ParseIP("169.254.169.254")) {
				return fmt.Errorf("url must not resolve to cloud metadata endpoint")
			}
		}
	}
	return nil
}

type DataSourceHandler struct {
	pool *pgxpool.Pool
}

func NewDataSourceHandler(pool *pgxpool.Pool) *DataSourceHandler {
	return &DataSourceHandler{pool: pool}
}

func (h *DataSourceHandler) checkOrgMembership(ctx context.Context, userID, orgID uuid.UUID) (string, error) {
	var role string
	err := h.pool.QueryRow(ctx,
		`SELECT role FROM organization_memberships WHERE user_id = $1 AND organization_id = $2`,
		userID, orgID,
	).Scan(&role)
	return role, err
}

// Create creates a new datasource for an organization
func (h *DataSourceHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	orgID, err := uuid.Parse(r.PathValue("orgId"))
	if err != nil {
		http.Error(w, `{"error":"invalid organization id"}`, http.StatusBadRequest)
		return
	}

	var req models.CreateDataSourceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Name == "" {
		http.Error(w, `{"error":"name is required"}`, http.StatusBadRequest)
		return
	}
	if !req.Type.Valid() {
		http.Error(w, `{"error":"invalid datasource type, must be one of: prometheus, loki, victorialogs, victoriametrics, tempo, victoriatraces, clickhouse, cloudwatch, elasticsearch, vmalert, alertmanager"}`, http.StatusBadRequest)
		return
	}
	if req.URL == "" {
		http.Error(w, `{"error":"url is required"}`, http.StatusBadRequest)
		return
	}
	if err := validateDatasourceURL(req.URL); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	role, err := h.checkOrgMembership(ctx, userID, orgID)
	if err != nil {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}
	if role != "admin" {
		http.Error(w, `{"error":"only admins can create datasources"}`, http.StatusForbidden)
		return
	}

	authType := "none"
	if req.AuthType != nil {
		authType = *req.AuthType
	}

	isDefault := false
	if req.IsDefault != nil {
		isDefault = *req.IsDefault
	}

	traceIDField := "trace_id"
	if req.TraceIDField != nil && *req.TraceIDField != "" {
		traceIDField = *req.TraceIDField
	}

	var ds models.DataSource
	err = h.pool.QueryRow(ctx,
		`INSERT INTO datasources (organization_id, name, type, url, is_default, auth_type, auth_config, trace_id_field, linked_trace_datasource_id)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 RETURNING id, organization_id, name, type, url, is_default, auth_type, auth_config, trace_id_field, linked_trace_datasource_id, created_at, updated_at`,
		orgID, req.Name, req.Type, req.URL, isDefault, authType, req.AuthConfig, traceIDField, req.LinkedTraceDatasourceID,
	).Scan(&ds.ID, &ds.OrganizationID, &ds.Name, &ds.Type, &ds.URL, &ds.IsDefault, &ds.AuthType, &ds.AuthConfig, &ds.TraceIDField, &ds.LinkedTraceDatasourceID, &ds.CreatedAt, &ds.UpdatedAt)

	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"failed to create datasource: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	analytics.Track(r.Context(), analytics.Event{
		DistinctID: userID.String(),
		Name:       "datasource_created",
		OptOut:     analytics.RequestOptedOut(r),
		Properties: map[string]any{
			"user_id":         userID.String(),
			"organization_id": orgID.String(),
			"datasource_id":   ds.ID.String(),
			"datasource_type": ds.Type,
			"is_default":      ds.IsDefault,
		},
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(ds)
}

// List lists all datasources for an organization
func (h *DataSourceHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	orgID, err := uuid.Parse(r.PathValue("orgId"))
	if err != nil {
		http.Error(w, `{"error":"invalid organization id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	role, err := h.checkOrgMembership(ctx, userID, orgID)
	if err != nil {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}

	rows, err := h.pool.Query(ctx,
		`SELECT id, organization_id, name, type, url, is_default, auth_type, auth_config, trace_id_field, linked_trace_datasource_id, created_at, updated_at
		 FROM datasources
		 WHERE organization_id = $1
		 ORDER BY name ASC`, orgID)
	if err != nil {
		http.Error(w, `{"error":"failed to fetch datasources"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	datasources := []models.DataSource{}
	for rows.Next() {
		var ds models.DataSource
		if err := rows.Scan(&ds.ID, &ds.OrganizationID, &ds.Name, &ds.Type, &ds.URL, &ds.IsDefault, &ds.AuthType, &ds.AuthConfig, &ds.TraceIDField, &ds.LinkedTraceDatasourceID, &ds.CreatedAt, &ds.UpdatedAt); err != nil {
			http.Error(w, `{"error":"failed to scan datasource"}`, http.StatusInternalServerError)
			return
		}
		if role != "admin" {
			ds.AuthConfig = nil
		}
		datasources = append(datasources, ds)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(datasources)
}

// Get returns a single datasource
func (h *DataSourceHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid datasource id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var ds models.DataSource
	err = h.pool.QueryRow(ctx,
		`SELECT id, organization_id, name, type, url, is_default, auth_type, auth_config, trace_id_field, linked_trace_datasource_id, created_at, updated_at
		 FROM datasources WHERE id = $1`, id,
	).Scan(&ds.ID, &ds.OrganizationID, &ds.Name, &ds.Type, &ds.URL, &ds.IsDefault, &ds.AuthType, &ds.AuthConfig, &ds.TraceIDField, &ds.LinkedTraceDatasourceID, &ds.CreatedAt, &ds.UpdatedAt)
	if err != nil {
		http.Error(w, `{"error":"datasource not found"}`, http.StatusNotFound)
		return
	}

	role, err := h.checkOrgMembership(ctx, userID, ds.OrganizationID)
	if err != nil {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}

	if role != "admin" {
		ds.AuthConfig = nil
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ds)
}

// Update updates a datasource
func (h *DataSourceHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid datasource id"}`, http.StatusBadRequest)
		return
	}

	var req models.UpdateDataSourceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Type != nil && !req.Type.Valid() {
		http.Error(w, `{"error":"invalid datasource type"}`, http.StatusBadRequest)
		return
	}
	if req.URL != nil {
		if err := validateDatasourceURL(*req.URL); err != nil {
			http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
			return
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Get existing datasource to check org
	var orgID uuid.UUID
	err = h.pool.QueryRow(ctx, `SELECT organization_id FROM datasources WHERE id = $1`, id).Scan(&orgID)
	if err != nil {
		http.Error(w, `{"error":"datasource not found"}`, http.StatusNotFound)
		return
	}

	role, err := h.checkOrgMembership(ctx, userID, orgID)
	if err != nil {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}
	if role != "admin" {
		http.Error(w, `{"error":"only admins can update datasources"}`, http.StatusForbidden)
		return
	}

	var ds models.DataSource
	err = h.pool.QueryRow(ctx,
		`UPDATE datasources
		 SET name = COALESCE($1, name),
		     type = COALESCE($2, type),
		     url = COALESCE($3, url),
		     is_default = COALESCE($4, is_default),
		     auth_type = COALESCE($5, auth_type),
		     auth_config = COALESCE($6, auth_config),
		     trace_id_field = COALESCE($7, trace_id_field),
		     linked_trace_datasource_id = COALESCE($8, linked_trace_datasource_id),
		     updated_at = NOW()
		 WHERE id = $9
		 RETURNING id, organization_id, name, type, url, is_default, auth_type, auth_config, trace_id_field, linked_trace_datasource_id, created_at, updated_at`,
		req.Name, req.Type, req.URL, req.IsDefault, req.AuthType, req.AuthConfig, req.TraceIDField, req.LinkedTraceDatasourceID, id,
	).Scan(&ds.ID, &ds.OrganizationID, &ds.Name, &ds.Type, &ds.URL, &ds.IsDefault, &ds.AuthType, &ds.AuthConfig, &ds.TraceIDField, &ds.LinkedTraceDatasourceID, &ds.CreatedAt, &ds.UpdatedAt)
	if err != nil {
		http.Error(w, `{"error":"failed to update datasource"}`, http.StatusInternalServerError)
		return
	}

	analytics.Track(r.Context(), analytics.Event{
		DistinctID: userID.String(),
		Name:       "datasource_updated",
		OptOut:     analytics.RequestOptedOut(r),
		Properties: map[string]any{
			"user_id":         userID.String(),
			"organization_id": orgID.String(),
			"datasource_id":   ds.ID.String(),
			"datasource_type": ds.Type,
		},
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ds)
}

// Delete deletes a datasource
func (h *DataSourceHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid datasource id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var orgID uuid.UUID
	err = h.pool.QueryRow(ctx, `SELECT organization_id FROM datasources WHERE id = $1`, id).Scan(&orgID)
	if err != nil {
		http.Error(w, `{"error":"datasource not found"}`, http.StatusNotFound)
		return
	}

	role, err := h.checkOrgMembership(ctx, userID, orgID)
	if err != nil {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}
	if role != "admin" {
		http.Error(w, `{"error":"only admins can delete datasources"}`, http.StatusForbidden)
		return
	}

	result, err := h.pool.Exec(ctx, `DELETE FROM datasources WHERE id = $1`, id)
	if err != nil {
		http.Error(w, `{"error":"failed to delete datasource"}`, http.StatusInternalServerError)
		return
	}
	if result.RowsAffected() == 0 {
		http.Error(w, `{"error":"datasource not found"}`, http.StatusNotFound)
		return
	}

	analytics.Track(r.Context(), analytics.Event{
		DistinctID: userID.String(),
		Name:       "datasource_deleted",
		OptOut:     analytics.RequestOptedOut(r),
		Properties: map[string]any{
			"user_id":         userID.String(),
			"organization_id": orgID.String(),
			"datasource_id":   id.String(),
		},
	})

	w.WriteHeader(http.StatusNoContent)
}

// ListTraceDatasources returns tracing datasources in the same org for linking
func (h *DataSourceHandler) ListTraceDatasources(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	orgID, err := uuid.Parse(r.PathValue("orgId"))
	if err != nil {
		http.Error(w, `{"error":"invalid organization id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	_, err = h.checkOrgMembership(ctx, userID, orgID)
	if err != nil {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}

	type traceDatasource struct {
		ID   uuid.UUID `json:"id"`
		Name string    `json:"name"`
		Type string    `json:"type"`
	}

	rows, err := h.pool.Query(ctx,
		`SELECT id, name, type FROM datasources
		 WHERE organization_id = $1 AND type IN ('tempo', 'victoriatraces')
		 ORDER BY name ASC`, orgID)
	if err != nil {
		http.Error(w, `{"error":"failed to fetch trace datasources"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	results := []traceDatasource{}
	for rows.Next() {
		var td traceDatasource
		if err := rows.Scan(&td.ID, &td.Name, &td.Type); err != nil {
			http.Error(w, `{"error":"failed to scan trace datasource"}`, http.StatusInternalServerError)
			return
		}
		results = append(results, td)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

// Query executes a query against a datasource
func (h *DataSourceHandler) Query(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid datasource id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	// Fetch datasource
	var ds models.DataSource
	err = h.pool.QueryRow(ctx,
		`SELECT id, organization_id, name, type, url, is_default, auth_type, auth_config, trace_id_field, linked_trace_datasource_id, created_at, updated_at
		 FROM datasources WHERE id = $1`, id,
	).Scan(&ds.ID, &ds.OrganizationID, &ds.Name, &ds.Type, &ds.URL, &ds.IsDefault, &ds.AuthType, &ds.AuthConfig, &ds.TraceIDField, &ds.LinkedTraceDatasourceID, &ds.CreatedAt, &ds.UpdatedAt)
	if err != nil {
		http.Error(w, `{"error":"datasource not found"}`, http.StatusNotFound)
		return
	}

	_, err = h.checkOrgMembership(ctx, userID, ds.OrganizationID)
	if err != nil {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")

	// Parse query from body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to read request body"})
		return
	}

	var queryReq datasource.QueryRequest
	if err := json.Unmarshal(body, &queryReq); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "invalid request body"})
		return
	}

	if queryReq.Query == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "query is required"})
		return
	}

	// Parse time range
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

	// Execute query via client
	signal := strings.TrimSpace(queryReq.Signal)
	if signal == "" {
		signal = strings.TrimSpace(r.URL.Query().Get("signal"))
	}

	var result *datasource.QueryResult
	var queryErr error

	switch ds.Type {
	case models.DataSourceClickHouse:
		clickHouseClient, clientErr := datasource.NewClickHouseClient(ds)
		if clientErr != nil {
			analytics.Track(r.Context(), analytics.Event{
				DistinctID: userID.String(),
				Name:       "datasource_query_failed",
				OptOut:     analytics.RequestOptedOut(r),
				Properties: map[string]any{
					"user_id":         userID.String(),
					"organization_id": ds.OrganizationID.String(),
					"datasource_id":   ds.ID.String(),
					"datasource_type": ds.Type,
					"error":           clientErr.Error(),
				},
			})

			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create datasource client: " + clientErr.Error()})
			return
		}

		result, queryErr = clickHouseClient.QueryWithSignal(ctx, queryReq.Query, signal, start, end, step, queryReq.Limit)
	case models.DataSourceCloudWatch:
		cloudWatchClient, clientErr := datasource.NewCloudWatchClient(ds)
		if clientErr != nil {
			analytics.Track(r.Context(), analytics.Event{
				DistinctID: userID.String(),
				Name:       "datasource_query_failed",
				OptOut:     analytics.RequestOptedOut(r),
				Properties: map[string]any{
					"user_id":         userID.String(),
					"organization_id": ds.OrganizationID.String(),
					"datasource_id":   ds.ID.String(),
					"datasource_type": ds.Type,
					"error":           clientErr.Error(),
				},
			})

			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create datasource client: " + clientErr.Error()})
			return
		}

		result, queryErr = cloudWatchClient.QueryWithSignal(ctx, queryReq.Query, signal, start, end, step, queryReq.Limit)
	case models.DataSourceElasticsearch:
		elasticsearchClient, clientErr := datasource.NewElasticsearchClient(ds)
		if clientErr != nil {
			analytics.Track(r.Context(), analytics.Event{
				DistinctID: userID.String(),
				Name:       "datasource_query_failed",
				OptOut:     analytics.RequestOptedOut(r),
				Properties: map[string]any{
					"user_id":         userID.String(),
					"organization_id": ds.OrganizationID.String(),
					"datasource_id":   ds.ID.String(),
					"datasource_type": ds.Type,
					"error":           clientErr.Error(),
				},
			})

			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create datasource client: " + clientErr.Error()})
			return
		}

		result, queryErr = elasticsearchClient.QueryWithSignal(ctx, queryReq.Query, signal, start, end, step, queryReq.Limit)
	default:
		client, clientErr := datasource.NewClient(ds)
		if clientErr != nil {
			analytics.Track(r.Context(), analytics.Event{
				DistinctID: userID.String(),
				Name:       "datasource_query_failed",
				OptOut:     analytics.RequestOptedOut(r),
				Properties: map[string]any{
					"user_id":         userID.String(),
					"organization_id": ds.OrganizationID.String(),
					"datasource_id":   ds.ID.String(),
					"datasource_type": ds.Type,
					"error":           clientErr.Error(),
				},
			})

			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create datasource client: " + clientErr.Error()})
			return
		}

		result, queryErr = client.Query(ctx, queryReq.Query, start, end, step, queryReq.Limit)
	}

	if queryErr != nil {
		analytics.Track(r.Context(), analytics.Event{
			DistinctID: userID.String(),
			Name:       "datasource_query_failed",
			OptOut:     analytics.RequestOptedOut(r),
			Properties: map[string]any{
				"user_id":         userID.String(),
				"organization_id": ds.OrganizationID.String(),
				"datasource_id":   ds.ID.String(),
				"datasource_type": ds.Type,
				"query_length":    len(queryReq.Query),
				"error":           queryErr.Error(),
			},
		})

		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "query failed: " + queryErr.Error()})
		return
	}

	analytics.Track(r.Context(), analytics.Event{
		DistinctID: userID.String(),
		Name:       "datasource_query_executed",
		OptOut:     analytics.RequestOptedOut(r),
		Properties: map[string]any{
			"user_id":         userID.String(),
			"organization_id": ds.OrganizationID.String(),
			"datasource_id":   ds.ID.String(),
			"datasource_type": ds.Type,
			"query_length":    len(queryReq.Query),
			"limit":           queryReq.Limit,
		},
	})

	json.NewEncoder(w).Encode(result)
}

// TestConnectionDraft tests datasource connectivity against unsaved configuration.
func (h *DataSourceHandler) TestConnectionDraft(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	orgID, err := uuid.Parse(r.PathValue("orgId"))
	if err != nil {
		http.Error(w, `{"error":"invalid organization id"}`, http.StatusBadRequest)
		return
	}

	var req models.CreateDataSourceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if !req.Type.Valid() {
		http.Error(w, `{"error":"invalid datasource type, must be one of: prometheus, loki, victorialogs, victoriametrics, tempo, victoriatraces, clickhouse, cloudwatch, elasticsearch, vmalert, alertmanager"}`, http.StatusBadRequest)
		return
	}

	datasourceURL := strings.TrimSpace(req.URL)
	if datasourceURL == "" {
		http.Error(w, `{"error":"url is required"}`, http.StatusBadRequest)
		return
	}
	if err := validateDatasourceURL(datasourceURL); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	role, err := h.checkOrgMembership(ctx, userID, orgID)
	if err != nil {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}
	if role != "admin" {
		http.Error(w, `{"error":"only admins can test datasource connections"}`, http.StatusForbidden)
		return
	}

	authType := "none"
	if req.AuthType != nil {
		authType = *req.AuthType
	}

	requestDatasource := models.DataSource{
		OrganizationID: orgID,
		Name:           strings.TrimSpace(req.Name),
		Type:           req.Type,
		URL:            datasourceURL,
		AuthType:       authType,
		AuthConfig:     req.AuthConfig,
	}

	if err := datasource.TestConnection(ctx, requestDatasource); err != nil {
		analytics.Track(r.Context(), analytics.Event{
			DistinctID: userID.String(),
			Name:       "datasource_connection_draft_test_failed",
			OptOut:     analytics.RequestOptedOut(r),
			Properties: map[string]any{
				"user_id":         userID.String(),
				"organization_id": orgID.String(),
				"datasource_type": req.Type,
				"error":           err.Error(),
			},
		})

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "connection test failed: " + err.Error()})
		return
	}

	analytics.Track(r.Context(), analytics.Event{
		DistinctID: userID.String(),
		Name:       "datasource_connection_draft_test_succeeded",
		OptOut:     analytics.RequestOptedOut(r),
		Properties: map[string]any{
			"user_id":         userID.String(),
			"organization_id": orgID.String(),
			"datasource_type": req.Type,
		},
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		Status string `json:"status"`
	}{
		Status: "success",
	})
}

// TestConnection tests datasource connectivity and auth configuration.
func (h *DataSourceHandler) TestConnection(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid datasource id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	var ds models.DataSource
	err = h.pool.QueryRow(ctx,
		`SELECT id, organization_id, name, type, url, is_default, auth_type, auth_config, trace_id_field, linked_trace_datasource_id, created_at, updated_at
		 FROM datasources WHERE id = $1`, id,
	).Scan(&ds.ID, &ds.OrganizationID, &ds.Name, &ds.Type, &ds.URL, &ds.IsDefault, &ds.AuthType, &ds.AuthConfig, &ds.TraceIDField, &ds.LinkedTraceDatasourceID, &ds.CreatedAt, &ds.UpdatedAt)
	if err != nil {
		http.Error(w, `{"error":"datasource not found"}`, http.StatusNotFound)
		return
	}

	_, err = h.checkOrgMembership(ctx, userID, ds.OrganizationID)
	if err != nil {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}

	if err := datasource.TestConnection(ctx, ds); err != nil {
		analytics.Track(r.Context(), analytics.Event{
			DistinctID: userID.String(),
			Name:       "datasource_connection_test_failed",
			OptOut:     analytics.RequestOptedOut(r),
			Properties: map[string]any{
				"user_id":         userID.String(),
				"organization_id": ds.OrganizationID.String(),
				"datasource_id":   ds.ID.String(),
				"datasource_type": ds.Type,
				"error":           err.Error(),
			},
		})

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "connection test failed: " + err.Error()})
		return
	}

	analytics.Track(r.Context(), analytics.Event{
		DistinctID: userID.String(),
		Name:       "datasource_connection_test_succeeded",
		OptOut:     analytics.RequestOptedOut(r),
		Properties: map[string]any{
			"user_id":         userID.String(),
			"organization_id": ds.OrganizationID.String(),
			"datasource_id":   ds.ID.String(),
			"datasource_type": ds.Type,
		},
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		Status string `json:"status"`
	}{
		Status: "success",
	})
}

// GetTrace returns a trace by id from a tracing datasource.
func (h *DataSourceHandler) GetTrace(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid datasource id"}`, http.StatusBadRequest)
		return
	}

	traceID := strings.TrimSpace(r.PathValue("traceId"))
	if traceID == "" {
		http.Error(w, `{"error":"trace id is required"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	var ds models.DataSource
	err = h.pool.QueryRow(ctx,
		`SELECT id, organization_id, name, type, url, is_default, auth_type, auth_config, trace_id_field, linked_trace_datasource_id, created_at, updated_at
		 FROM datasources WHERE id = $1`, id,
	).Scan(&ds.ID, &ds.OrganizationID, &ds.Name, &ds.Type, &ds.URL, &ds.IsDefault, &ds.AuthType, &ds.AuthConfig, &ds.TraceIDField, &ds.LinkedTraceDatasourceID, &ds.CreatedAt, &ds.UpdatedAt)
	if err != nil {
		http.Error(w, `{"error":"datasource not found"}`, http.StatusNotFound)
		return
	}

	_, err = h.checkOrgMembership(ctx, userID, ds.OrganizationID)
	if err != nil {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}

	if !ds.Type.IsTraces() {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "trace endpoints are only supported for tracing datasources"})
		return
	}

	client, err := datasource.NewTracingClient(ds)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create tracing client: " + err.Error()})
		return
	}

	trace, err := client.GetTrace(ctx, traceID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to fetch trace: " + err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		Status string            `json:"status"`
		Data   *datasource.Trace `json:"data"`
	}{
		Status: "success",
		Data:   trace,
	})
}

// TraceServiceGraph returns a service dependency graph for a trace.
func (h *DataSourceHandler) TraceServiceGraph(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid datasource id"}`, http.StatusBadRequest)
		return
	}

	traceID := strings.TrimSpace(r.PathValue("traceId"))
	if traceID == "" {
		http.Error(w, `{"error":"trace id is required"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	var ds models.DataSource
	err = h.pool.QueryRow(ctx,
		`SELECT id, organization_id, name, type, url, is_default, auth_type, auth_config, trace_id_field, linked_trace_datasource_id, created_at, updated_at
		 FROM datasources WHERE id = $1`, id,
	).Scan(&ds.ID, &ds.OrganizationID, &ds.Name, &ds.Type, &ds.URL, &ds.IsDefault, &ds.AuthType, &ds.AuthConfig, &ds.TraceIDField, &ds.LinkedTraceDatasourceID, &ds.CreatedAt, &ds.UpdatedAt)
	if err != nil {
		http.Error(w, `{"error":"datasource not found"}`, http.StatusNotFound)
		return
	}

	_, err = h.checkOrgMembership(ctx, userID, ds.OrganizationID)
	if err != nil {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}

	if !ds.Type.IsTraces() {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "trace endpoints are only supported for tracing datasources"})
		return
	}

	client, err := datasource.NewTracingClient(ds)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create tracing client: " + err.Error()})
		return
	}

	trace, err := client.GetTrace(ctx, traceID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to fetch trace: " + err.Error()})
		return
	}

	graph := datasource.BuildTraceServiceGraph(trace)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		Status string                        `json:"status"`
		Data   *datasource.TraceServiceGraph `json:"data"`
	}{
		Status: "success",
		Data:   graph,
	})
}

// SearchTraces searches traces on a tracing datasource.
func (h *DataSourceHandler) SearchTraces(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid datasource id"}`, http.StatusBadRequest)
		return
	}

	var req datasource.TraceSearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	var ds models.DataSource
	err = h.pool.QueryRow(ctx,
		`SELECT id, organization_id, name, type, url, is_default, auth_type, auth_config, trace_id_field, linked_trace_datasource_id, created_at, updated_at
		 FROM datasources WHERE id = $1`, id,
	).Scan(&ds.ID, &ds.OrganizationID, &ds.Name, &ds.Type, &ds.URL, &ds.IsDefault, &ds.AuthType, &ds.AuthConfig, &ds.TraceIDField, &ds.LinkedTraceDatasourceID, &ds.CreatedAt, &ds.UpdatedAt)
	if err != nil {
		http.Error(w, `{"error":"datasource not found"}`, http.StatusNotFound)
		return
	}

	_, err = h.checkOrgMembership(ctx, userID, ds.OrganizationID)
	if err != nil {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}

	if !ds.Type.IsTraces() {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "trace endpoints are only supported for tracing datasources"})
		return
	}

	client, err := datasource.NewTracingClient(ds)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create tracing client: " + err.Error()})
		return
	}

	traces, err := client.SearchTraces(ctx, req)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to search traces: " + err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		Status string                    `json:"status"`
		Data   []datasource.TraceSummary `json:"data"`
	}{
		Status: "success",
		Data:   traces,
	})
}

// TraceServices lists available services from a tracing datasource.
func (h *DataSourceHandler) TraceServices(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid datasource id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	var ds models.DataSource
	err = h.pool.QueryRow(ctx,
		`SELECT id, organization_id, name, type, url, is_default, auth_type, auth_config, trace_id_field, linked_trace_datasource_id, created_at, updated_at
		 FROM datasources WHERE id = $1`, id,
	).Scan(&ds.ID, &ds.OrganizationID, &ds.Name, &ds.Type, &ds.URL, &ds.IsDefault, &ds.AuthType, &ds.AuthConfig, &ds.TraceIDField, &ds.LinkedTraceDatasourceID, &ds.CreatedAt, &ds.UpdatedAt)
	if err != nil {
		http.Error(w, `{"error":"datasource not found"}`, http.StatusNotFound)
		return
	}

	_, err = h.checkOrgMembership(ctx, userID, ds.OrganizationID)
	if err != nil {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}

	if !ds.Type.IsTraces() {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "trace endpoints are only supported for tracing datasources"})
		return
	}

	client, err := datasource.NewTracingClient(ds)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create tracing client: " + err.Error()})
		return
	}

	services, err := client.Services(ctx)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to list trace services: " + err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		Status string   `json:"status"`
		Data   []string `json:"data"`
	}{
		Status: "success",
		Data:   services,
	})
}

// Stream opens a live log stream against a datasource
func (h *DataSourceHandler) Stream(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid datasource id"}`, http.StatusBadRequest)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to read request body"})
		return
	}

	var streamReq datasource.StreamRequest
	if err := json.Unmarshal(body, &streamReq); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "invalid request body"})
		return
	}

	streamQuery := strings.TrimSpace(streamReq.Query)
	if streamQuery == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "query is required"})
		return
	}

	dbCtx, dbCancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer dbCancel()

	var ds models.DataSource
	err = h.pool.QueryRow(dbCtx,
		`SELECT id, organization_id, name, type, url, is_default, auth_type, auth_config, trace_id_field, linked_trace_datasource_id, created_at, updated_at
		 FROM datasources WHERE id = $1`, id,
	).Scan(&ds.ID, &ds.OrganizationID, &ds.Name, &ds.Type, &ds.URL, &ds.IsDefault, &ds.AuthType, &ds.AuthConfig, &ds.TraceIDField, &ds.LinkedTraceDatasourceID, &ds.CreatedAt, &ds.UpdatedAt)
	if err != nil {
		http.Error(w, `{"error":"datasource not found"}`, http.StatusNotFound)
		return
	}

	_, err = h.checkOrgMembership(dbCtx, userID, ds.OrganizationID)
	if err != nil {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}

	if !ds.Type.IsLogs() {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "live streaming is only supported for log datasources"})
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "streaming is not supported"})
		return
	}

	if rc := http.NewResponseController(w); rc != nil {
		_ = rc.SetWriteDeadline(time.Time{})
	}

	start := time.Now().Add(-5 * time.Second)
	if streamReq.Start > 0 {
		start = time.Unix(streamReq.Start, 0)
	}

	limit := streamReq.Limit
	if limit <= 0 {
		limit = 200
	}
	if limit > 1000 {
		limit = 1000
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	if err := writeSSEEvent(w, flusher, "status", map[string]string{"status": "connected"}); err != nil {
		return
	}

	streamCtx, streamCancel := context.WithCancel(r.Context())
	defer streamCancel()

	logCh := make(chan datasource.LogEntry, 256)
	errCh := make(chan error, 1)

	go func() {
		defer close(logCh)

		onLog := func(entry datasource.LogEntry) error {
			select {
			case <-streamCtx.Done():
				return streamCtx.Err()
			case logCh <- entry:
				return nil
			}
		}

		var streamErr error
		switch ds.Type {
		case models.DataSourceLoki:
			client, err := datasource.NewLokiClient(ds.URL)
			if err != nil {
				streamErr = fmt.Errorf("failed to create datasource client: %w", err)
				break
			}
			streamErr = client.Stream(streamCtx, streamQuery, start, limit, onLog)
		case models.DataSourceVictoriaLogs:
			client, err := datasource.NewVictoriaLogsClient(ds.URL)
			if err != nil {
				streamErr = fmt.Errorf("failed to create datasource client: %w", err)
				break
			}
			streamErr = client.Stream(streamCtx, streamQuery, start, limit, onLog)
		default:
			streamErr = fmt.Errorf("live streaming is only supported for log datasources")
		}

		if streamErr != nil && streamCtx.Err() == nil {
			select {
			case errCh <- streamErr:
			default:
			}
		}
	}()

	heartbeatTicker := time.NewTicker(10 * time.Second)
	defer heartbeatTicker.Stop()

	for {
		select {
		case <-streamCtx.Done():
			return
		case streamErr := <-errCh:
			_ = writeSSEEvent(w, flusher, "error", map[string]string{"error": streamErr.Error()})
			return
		case entry, ok := <-logCh:
			if !ok {
				return
			}
			if err := writeSSEEvent(w, flusher, "log", entry); err != nil {
				return
			}
		case <-heartbeatTicker.C:
			if err := writeSSEEvent(w, flusher, "heartbeat", map[string]string{"status": "ok"}); err != nil {
				return
			}
		}
	}
}

// Labels returns indexed labels/fields for log datasources
func (h *DataSourceHandler) Labels(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid datasource id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	var ds models.DataSource
	err = h.pool.QueryRow(ctx,
		`SELECT id, organization_id, name, type, url, is_default, auth_type, auth_config, trace_id_field, linked_trace_datasource_id, created_at, updated_at
		 FROM datasources WHERE id = $1`, id,
	).Scan(&ds.ID, &ds.OrganizationID, &ds.Name, &ds.Type, &ds.URL, &ds.IsDefault, &ds.AuthType, &ds.AuthConfig, &ds.TraceIDField, &ds.LinkedTraceDatasourceID, &ds.CreatedAt, &ds.UpdatedAt)
	if err != nil {
		http.Error(w, `{"error":"datasource not found"}`, http.StatusNotFound)
		return
	}

	_, err = h.checkOrgMembership(ctx, userID, ds.OrganizationID)
	if err != nil {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}

	var labels []string
	switch ds.Type {
	case models.DataSourceLoki:
		client, err := datasource.NewLokiClient(ds.URL)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create datasource client: " + err.Error()})
			return
		}

		labels, err = client.Labels(ctx)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to fetch labels: " + err.Error()})
			return
		}

	case models.DataSourceVictoriaLogs:
		client, err := datasource.NewVictoriaLogsClient(ds.URL)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create datasource client: " + err.Error()})
			return
		}

		labels, err = client.Labels(ctx)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to fetch labels: " + err.Error()})
			return
		}

	case models.DataSourceVictoriaMetrics, models.DataSourcePrometheus:
		client, err := datasource.NewVictoriaMetricsClient(ds.URL)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create datasource client: " + err.Error()})
			return
		}

		metric := r.URL.Query().Get("metric")
		labels, err = client.Labels(ctx, metric)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to fetch labels: " + err.Error()})
			return
		}

	default:
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "label discovery is not supported for this datasource type"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		Status string   `json:"status"`
		Data   []string `json:"data"`
	}{
		Status: "success",
		Data:   labels,
	})
}

// LabelValues returns indexed values for a specific log datasource field
func (h *DataSourceHandler) LabelValues(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid datasource id"}`, http.StatusBadRequest)
		return
	}

	labelName := strings.TrimSpace(r.PathValue("name"))
	if labelName == "" {
		http.Error(w, `{"error":"label name is required"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	var ds models.DataSource
	err = h.pool.QueryRow(ctx,
		`SELECT id, organization_id, name, type, url, is_default, auth_type, auth_config, trace_id_field, linked_trace_datasource_id, created_at, updated_at
		 FROM datasources WHERE id = $1`, id,
	).Scan(&ds.ID, &ds.OrganizationID, &ds.Name, &ds.Type, &ds.URL, &ds.IsDefault, &ds.AuthType, &ds.AuthConfig, &ds.TraceIDField, &ds.LinkedTraceDatasourceID, &ds.CreatedAt, &ds.UpdatedAt)
	if err != nil {
		http.Error(w, `{"error":"datasource not found"}`, http.StatusNotFound)
		return
	}

	_, err = h.checkOrgMembership(ctx, userID, ds.OrganizationID)
	if err != nil {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}

	var values []string
	switch ds.Type {
	case models.DataSourceLoki:
		client, err := datasource.NewLokiClient(ds.URL)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create datasource client: " + err.Error()})
			return
		}

		values, err = client.LabelValues(ctx, labelName)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to fetch label values: " + err.Error()})
			return
		}
	case models.DataSourceVictoriaLogs:
		client, err := datasource.NewVictoriaLogsClient(ds.URL)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create datasource client: " + err.Error()})
			return
		}

		values, err = client.LabelValues(ctx, labelName)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to fetch label values: " + err.Error()})
			return
		}
	case models.DataSourceVictoriaMetrics, models.DataSourcePrometheus:
		client, err := datasource.NewVictoriaMetricsClient(ds.URL)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create datasource client: " + err.Error()})
			return
		}

		metric := r.URL.Query().Get("metric")
		values, err = client.LabelValues(ctx, labelName, metric)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to fetch label values: " + err.Error()})
			return
		}

	default:
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "label value discovery is not supported for this datasource type"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		Status string   `json:"status"`
		Data   []string `json:"data"`
	}{
		Status: "success",
		Data:   values,
	})
}

// MetricNames returns metric names for Prometheus/VictoriaMetrics datasources
func (h *DataSourceHandler) MetricNames(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid datasource id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	var ds models.DataSource
	err = h.pool.QueryRow(ctx,
		`SELECT id, organization_id, name, type, url, is_default, auth_type, auth_config, trace_id_field, linked_trace_datasource_id, created_at, updated_at
		 FROM datasources WHERE id = $1`, id,
	).Scan(&ds.ID, &ds.OrganizationID, &ds.Name, &ds.Type, &ds.URL, &ds.IsDefault, &ds.AuthType, &ds.AuthConfig, &ds.TraceIDField, &ds.LinkedTraceDatasourceID, &ds.CreatedAt, &ds.UpdatedAt)
	if err != nil {
		http.Error(w, `{"error":"datasource not found"}`, http.StatusNotFound)
		return
	}

	_, err = h.checkOrgMembership(ctx, userID, ds.OrganizationID)
	if err != nil {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}

	var names []string
	switch ds.Type {
	case models.DataSourceVictoriaMetrics, models.DataSourcePrometheus:
		client, err := datasource.NewVictoriaMetricsClient(ds.URL)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create datasource client: " + err.Error()})
			return
		}

		search := r.URL.Query().Get("search")
		names, err = client.MetricNames(ctx, search)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to fetch metric names: " + err.Error()})
			return
		}

	default:
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "metric name discovery is only supported for Prometheus and VictoriaMetrics datasources"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		Status string   `json:"status"`
		Data   []string `json:"data"`
	}{
		Status: "success",
		Data:   names,
	})
}

// QueryByParams handles GET-based query with query parameters (backwards compatible with existing Prometheus handler)
func (h *DataSourceHandler) QueryByParams(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")

	dsIDStr := r.URL.Query().Get("datasource_id")
	if dsIDStr == "" {
		// Fall back to the old Prometheus handler behavior using PROMETHEUS_URL env
		// This maintains backwards compatibility
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "datasource_id parameter is required"})
		return
	}

	dsID, err := uuid.Parse(dsIDStr)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "invalid datasource_id"})
		return
	}

	query := r.URL.Query().Get("query")
	if query == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "query parameter is required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	var ds models.DataSource
	err = h.pool.QueryRow(ctx,
		`SELECT id, organization_id, name, type, url, is_default, auth_type, auth_config, trace_id_field, linked_trace_datasource_id, created_at, updated_at
		 FROM datasources WHERE id = $1`, dsID,
	).Scan(&ds.ID, &ds.OrganizationID, &ds.Name, &ds.Type, &ds.URL, &ds.IsDefault, &ds.AuthType, &ds.AuthConfig, &ds.TraceIDField, &ds.LinkedTraceDatasourceID, &ds.CreatedAt, &ds.UpdatedAt)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "datasource not found"})
		return
	}

	start := time.Now().Add(-1 * time.Hour)
	end := time.Now()
	step := 15 * time.Second

	if s := r.URL.Query().Get("start"); s != "" {
		if v, err := strconv.ParseInt(s, 10, 64); err == nil {
			start = time.Unix(v, 0)
		}
	}
	if e := r.URL.Query().Get("end"); e != "" {
		if v, err := strconv.ParseInt(e, 10, 64); err == nil {
			end = time.Unix(v, 0)
		}
	}
	if st := r.URL.Query().Get("step"); st != "" {
		if v, err := strconv.ParseInt(st, 10, 64); err == nil {
			step = time.Duration(v) * time.Second
		}
	}

	limit := 0
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil {
			limit = v
		}
	}

	signal := strings.TrimSpace(r.URL.Query().Get("signal"))

	var result *datasource.QueryResult
	var queryErr error

	switch ds.Type {
	case models.DataSourceClickHouse:
		clickHouseClient, clientErr := datasource.NewClickHouseClient(ds)
		if clientErr != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create datasource client: " + clientErr.Error()})
			return
		}

		result, queryErr = clickHouseClient.QueryWithSignal(ctx, query, signal, start, end, step, limit)
	case models.DataSourceCloudWatch:
		cloudWatchClient, clientErr := datasource.NewCloudWatchClient(ds)
		if clientErr != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create datasource client: " + clientErr.Error()})
			return
		}

		result, queryErr = cloudWatchClient.QueryWithSignal(ctx, query, signal, start, end, step, limit)
	case models.DataSourceElasticsearch:
		elasticsearchClient, clientErr := datasource.NewElasticsearchClient(ds)
		if clientErr != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create datasource client: " + clientErr.Error()})
			return
		}

		result, queryErr = elasticsearchClient.QueryWithSignal(ctx, query, signal, start, end, step, limit)
	default:
		client, clientErr := datasource.NewClient(ds)
		if clientErr != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create datasource client: " + clientErr.Error()})
			return
		}

		result, queryErr = client.Query(ctx, query, start, end, step, limit)
	}

	if queryErr != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "query failed: " + queryErr.Error()})
		return
	}

	json.NewEncoder(w).Encode(result)
}

func writeSSEEvent(w http.ResponseWriter, flusher http.Flusher, event string, payload interface{}) error {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to encode sse payload: %w", err)
	}

	if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, encoded); err != nil {
		return err
	}

	flusher.Flush()
	return nil
}
