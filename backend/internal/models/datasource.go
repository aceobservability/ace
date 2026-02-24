package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type DataSourceType string

const (
	DataSourcePrometheus      DataSourceType = "prometheus"
	DataSourceLoki            DataSourceType = "loki"
	DataSourceVictoriaLogs    DataSourceType = "victorialogs"
	DataSourceVictoriaMetrics DataSourceType = "victoriametrics"
	DataSourceTempo           DataSourceType = "tempo"
	DataSourceVictoriaTraces  DataSourceType = "victoriatraces"
	DataSourceClickHouse      DataSourceType = "clickhouse"
	DataSourceCloudWatch      DataSourceType = "cloudwatch"
	DataSourceElasticsearch   DataSourceType = "elasticsearch"
	DataSourceVMAlert         DataSourceType = "vmalert"
	DataSourceAlertManager    DataSourceType = "alertmanager"
)

type DataSource struct {
	ID             uuid.UUID       `json:"id"`
	OrganizationID uuid.UUID       `json:"organization_id"`
	Name           string          `json:"name"`
	Type           DataSourceType  `json:"type"`
	URL            string          `json:"url"`
	IsDefault      bool            `json:"is_default"`
	AuthType       string          `json:"auth_type"`
	AuthConfig     json.RawMessage `json:"auth_config,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

type CreateDataSourceRequest struct {
	Name       string          `json:"name"`
	Type       DataSourceType  `json:"type"`
	URL        string          `json:"url"`
	IsDefault  *bool           `json:"is_default,omitempty"`
	AuthType   *string         `json:"auth_type,omitempty"`
	AuthConfig json.RawMessage `json:"auth_config,omitempty"`
}

type UpdateDataSourceRequest struct {
	Name       *string         `json:"name,omitempty"`
	Type       *DataSourceType `json:"type,omitempty"`
	URL        *string         `json:"url,omitempty"`
	IsDefault  *bool           `json:"is_default,omitempty"`
	AuthType   *string         `json:"auth_type,omitempty"`
	AuthConfig json.RawMessage `json:"auth_config,omitempty"`
}

func (t DataSourceType) Valid() bool {
	switch t {
	case DataSourcePrometheus, DataSourceLoki, DataSourceVictoriaLogs, DataSourceVictoriaMetrics, DataSourceTempo, DataSourceVictoriaTraces, DataSourceClickHouse, DataSourceCloudWatch, DataSourceElasticsearch, DataSourceVMAlert, DataSourceAlertManager:
		return true
	}
	return false
}

func (t DataSourceType) IsMetrics() bool {
	return t == DataSourcePrometheus || t == DataSourceVictoriaMetrics || t == DataSourceClickHouse || t == DataSourceCloudWatch || t == DataSourceElasticsearch
}

func (t DataSourceType) IsLogs() bool {
	return t == DataSourceLoki || t == DataSourceVictoriaLogs || t == DataSourceClickHouse || t == DataSourceCloudWatch || t == DataSourceElasticsearch
}

func (t DataSourceType) IsTraces() bool {
	return t == DataSourceTempo || t == DataSourceVictoriaTraces || t == DataSourceClickHouse
}
