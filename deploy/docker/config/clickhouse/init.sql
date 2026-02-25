CREATE TABLE IF NOT EXISTS logs (
    timestamp    DateTime64(9) DEFAULT now64(9),
    trace_id     String        DEFAULT '',
    span_id      String        DEFAULT '',
    severity     LowCardinality(String) DEFAULT 'INFO',
    service_name LowCardinality(String) DEFAULT '',
    body         String        DEFAULT '',
    attributes   Map(String, String)
)
ENGINE = MergeTree()
ORDER BY (service_name, timestamp)
TTL toDateTime(timestamp) + INTERVAL 7 DAY
SETTINGS index_granularity = 8192;
