-- +migrate Up

-- Widen the provider CHECK constraint to include github_copilot
-- PostgreSQL: drop old constraint, add new one
ALTER TABLE sso_configs DROP CONSTRAINT IF EXISTS sso_configs_provider_check;
ALTER TABLE sso_configs ADD CONSTRAINT sso_configs_provider_check
    CHECK (provider IN ('google', 'microsoft', 'github_copilot'));

-- +migrate Down
ALTER TABLE sso_configs DROP CONSTRAINT IF EXISTS sso_configs_provider_check;
ALTER TABLE sso_configs ADD CONSTRAINT sso_configs_provider_check
    CHECK (provider IN ('google', 'microsoft'));
