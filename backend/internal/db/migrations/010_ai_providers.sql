-- +migrate Up
CREATE TABLE IF NOT EXISTS ai_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider_type VARCHAR(50) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT,
    enabled BOOLEAN NOT NULL DEFAULT true,
    models_override JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(organization_id, display_name)
);
CREATE INDEX IF NOT EXISTS idx_ai_providers_org_id ON ai_providers(organization_id);

-- +migrate Down
DROP INDEX IF EXISTS idx_ai_providers_org_id;
DROP TABLE IF EXISTS ai_providers;
