package datasource

import (
	"context"
	"net/http"
	"time"

	"github.com/aceobservability/ace/backend/internal/models"
	promclient "github.com/aceobservability/ace/backend/pkg/prometheus"
)

type PrometheusClient struct {
	datasource models.DataSource
	client     *promclient.Client
	httpClient *http.Client
	meta       *promqlMetadata
}

func NewPrometheusClient(ds models.DataSource) (*PrometheusClient, error) {
	httpClient := newDatasourceHTTPClient(ds, 30*time.Second)
	client, err := promclient.NewClient(ds.URL, httpClient)
	if err != nil {
		return nil, err
	}
	return &PrometheusClient{
		datasource: ds,
		client:     client,
		httpClient: httpClient,
		meta: &promqlMetadata{
			baseURL: ds.URL,
			client:  httpClient,
		},
	}, nil
}

func (c *PrometheusClient) Query(ctx context.Context, query string, start, end time.Time, step time.Duration, limit int) (*QueryResult, error) {
	result, err := c.client.QueryRange(ctx, query, start, end, step)
	if err != nil {
		return nil, err
	}

	// Convert from prometheus.QueryResult to datasource.QueryResult
	qr := &QueryResult{
		Status:     result.Status,
		Error:      result.Error,
		ResultType: "metrics",
	}

	if result.Data != nil {
		qr.Data = &QueryData{
			ResultType: result.Data.ResultType,
			Result:     make([]MetricResult, len(result.Data.Result)),
		}
		for i, r := range result.Data.Result {
			qr.Data.Result[i] = MetricResult{
				Metric: r.Metric,
				Values: r.Values,
			}
		}
	}

	return qr, nil
}

func (c *PrometheusClient) TestConnection(ctx context.Context) error {
	return runHTTPConnectionCheck(ctx, c.datasource, c.httpClient, []string{"/-/healthy", "/api/v1/query?query=1", "/"})
}

func (c *PrometheusClient) Labels(ctx context.Context, metric string) ([]string, error) {
	return c.meta.Labels(ctx, metric)
}

func (c *PrometheusClient) LabelValues(ctx context.Context, label, metric string) ([]string, error) {
	return c.meta.LabelValues(ctx, label, metric)
}

func (c *PrometheusClient) MetricNames(ctx context.Context, search string) ([]string, error) {
	return c.meta.MetricNames(ctx, search)
}
