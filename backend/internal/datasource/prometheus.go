package datasource

import (
	"context"
	"time"

	promclient "github.com/aceobservability/ace/backend/pkg/prometheus"
)

type PrometheusClient struct {
	client *promclient.Client
}

func NewPrometheusClient(url string) (*PrometheusClient, error) {
	client, err := promclient.NewClient(url)
	if err != nil {
		return nil, err
	}
	return &PrometheusClient{client: client}, nil
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
