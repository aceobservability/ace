-- +migrate Up
ALTER TABLE datasources
    ADD COLUMN IF NOT EXISTS trace_id_field VARCHAR(255) DEFAULT 'trace_id',
    ADD COLUMN IF NOT EXISTS linked_trace_datasource_id UUID REFERENCES datasources(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_datasources_linked_trace ON datasources(linked_trace_datasource_id);

-- +migrate Down
ALTER TABLE datasources
    DROP COLUMN IF EXISTS trace_id_field,
    DROP COLUMN IF EXISTS linked_trace_datasource_id;

DROP INDEX IF EXISTS idx_datasources_linked_trace;
