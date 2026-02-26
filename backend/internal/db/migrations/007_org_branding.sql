-- +migrate Up
ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS branding_primary_color VARCHAR(7),
    ADD COLUMN IF NOT EXISTS branding_logo_data TEXT,
    ADD COLUMN IF NOT EXISTS branding_logo_mime VARCHAR(50),
    ADD COLUMN IF NOT EXISTS branding_app_title VARCHAR(100);

-- +migrate Down
ALTER TABLE organizations
    DROP COLUMN IF EXISTS branding_primary_color,
    DROP COLUMN IF EXISTS branding_logo_data,
    DROP COLUMN IF EXISTS branding_logo_mime,
    DROP COLUMN IF EXISTS branding_app_title;
