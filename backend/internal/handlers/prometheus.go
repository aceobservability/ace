package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/aceobservability/ace/backend/pkg/prometheus"
)

// CacheEntry holds cached data with expiration
type CacheEntry struct {
	Data      interface{}
	ExpiresAt time.Time
}

// MetadataCache provides thread-safe caching for Prometheus metadata
type MetadataCache struct {
	mu      sync.RWMutex
	entries map[string]CacheEntry
	ttl     time.Duration
}

func NewMetadataCache(ttl time.Duration) *MetadataCache {
	return &MetadataCache{
		entries: make(map[string]CacheEntry),
		ttl:     ttl,
	}
}

func (c *MetadataCache) Get(key string) (interface{}, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	entry, ok := c.entries[key]
	if !ok || time.Now().After(entry.ExpiresAt) {
		return nil, false
	}
	return entry.Data, true
}

func (c *MetadataCache) Set(key string, data interface{}) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.entries[key] = CacheEntry{
		Data:      data,
		ExpiresAt: time.Now().Add(c.ttl),
	}
}

type PrometheusHandler struct {
	prometheusURL string
	cache         *MetadataCache
}

func NewPrometheusHandler(prometheusURL string) *PrometheusHandler {
	return &PrometheusHandler{
		prometheusURL: prometheusURL,
		cache:         NewMetadataCache(5 * time.Minute),
	}
}

type QueryRequest struct {
	Query string `json:"query"`
	Start int64  `json:"start"` // Unix timestamp in seconds
	End   int64  `json:"end"`   // Unix timestamp in seconds
	Step  int64  `json:"step"`  // Step interval in seconds
}

type ErrorResponse struct {
	Status string `json:"status"`
	Error  string `json:"error"`
}

// Query executes a PromQL range query
func (h *PrometheusHandler) Query(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Parse query parameters
	query := r.URL.Query().Get("query")
	if query == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{
			Status: "error",
			Error:  "query parameter is required",
		})
		return
	}

	startStr := r.URL.Query().Get("start")
	endStr := r.URL.Query().Get("end")
	stepStr := r.URL.Query().Get("step")

	// Parse start time (default: 1 hour ago)
	var start time.Time
	if startStr != "" {
		startUnix, err := strconv.ParseInt(startStr, 10, 64)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(ErrorResponse{
				Status: "error",
				Error:  "invalid start timestamp",
			})
			return
		}
		start = time.Unix(startUnix, 0)
	} else {
		start = time.Now().Add(-1 * time.Hour)
	}

	// Parse end time (default: now)
	var end time.Time
	if endStr != "" {
		endUnix, err := strconv.ParseInt(endStr, 10, 64)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(ErrorResponse{
				Status: "error",
				Error:  "invalid end timestamp",
			})
			return
		}
		end = time.Unix(endUnix, 0)
	} else {
		end = time.Now()
	}

	// Parse step (default: 15 seconds)
	var step time.Duration
	if stepStr != "" {
		stepSec, err := strconv.ParseInt(stepStr, 10, 64)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(ErrorResponse{
				Status: "error",
				Error:  "invalid step value",
			})
			return
		}
		step = time.Duration(stepSec) * time.Second
	} else {
		step = 15 * time.Second
	}

	// Create Prometheus client
	client, err := prometheus.NewClient(h.prometheusURL)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{
			Status: "error",
			Error:  "failed to create Prometheus client: " + err.Error(),
		})
		return
	}

	// Execute query
	result, err := client.QueryRange(r.Context(), query, start, end, step)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{
			Status: "error",
			Error:  "query execution failed: " + err.Error(),
		})
		return
	}

	// Check if the query itself returned an error
	if result.Status == "error" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(result)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(result)
}

// MetricsResponse contains the list of metric names
type MetricsResponse struct {
	Status string   `json:"status"`
	Data   []string `json:"data"`
}

// Labels returns all available label names (GET /api/datasources/prometheus/labels)
func (h *PrometheusHandler) Labels(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Check cache first
	if cached, ok := h.cache.Get("labels"); ok {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(MetricsResponse{
			Status: "success",
			Data:   cached.([]string),
		})
		return
	}

	client, err := prometheus.NewClient(h.prometheusURL)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{
			Status: "error",
			Error:  "failed to create Prometheus client: " + err.Error(),
		})
		return
	}

	labels, err := client.LabelNames(r.Context())
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{
			Status: "error",
			Error:  "failed to get labels: " + err.Error(),
		})
		return
	}

	// Cache the result
	h.cache.Set("labels", labels)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(MetricsResponse{
		Status: "success",
		Data:   labels,
	})
}

// Metrics returns all available metric names (GET /api/datasources/prometheus/metrics)
func (h *PrometheusHandler) Metrics(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Check cache first
	if cached, ok := h.cache.Get("metrics"); ok {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(MetricsResponse{
			Status: "success",
			Data:   cached.([]string),
		})
		return
	}

	client, err := prometheus.NewClient(h.prometheusURL)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{
			Status: "error",
			Error:  "failed to create Prometheus client: " + err.Error(),
		})
		return
	}

	// Get values for __name__ label to get all metric names
	metrics, err := client.LabelValues(r.Context(), "__name__")
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{
			Status: "error",
			Error:  "failed to get metrics: " + err.Error(),
		})
		return
	}

	// Cache the result
	h.cache.Set("metrics", metrics)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(MetricsResponse{
		Status: "success",
		Data:   metrics,
	})
}

// LabelValues returns all values for a specific label (GET /api/datasources/prometheus/label/{name}/values)
func (h *PrometheusHandler) LabelValues(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	labelName := r.PathValue("name")
	if labelName == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{
			Status: "error",
			Error:  "label name is required",
		})
		return
	}

	cacheKey := "label_values:" + labelName

	// Check cache first
	if cached, ok := h.cache.Get(cacheKey); ok {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(MetricsResponse{
			Status: "success",
			Data:   cached.([]string),
		})
		return
	}

	client, err := prometheus.NewClient(h.prometheusURL)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{
			Status: "error",
			Error:  "failed to create Prometheus client: " + err.Error(),
		})
		return
	}

	values, err := client.LabelValues(r.Context(), labelName)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{
			Status: "error",
			Error:  "failed to get label values: " + err.Error(),
		})
		return
	}

	// Cache the result
	h.cache.Set(cacheKey, values)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(MetricsResponse{
		Status: "success",
		Data:   values,
	})
}
