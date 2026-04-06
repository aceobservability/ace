-- Audit role setup (run as PostgreSQL superuser BEFORE deploying with AUDIT_DATABASE_URL)
--
-- This script is NOT run by the application's auto-migration system.
-- It creates a restricted role for audit log writes that can only INSERT,
-- providing true immutability guarantees for compliance audits (SOC 2, ISO 27001).
--
-- Usage:
--   psql -U postgres -d ace -f 011_audit_role_setup.sql
--
-- Then set AUDIT_DATABASE_URL in the app environment:
--   AUDIT_DATABASE_URL=postgres://ace_audit:<password>@localhost:5432/ace?sslmode=require

-- Create the restricted audit role
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ace_audit') THEN
        CREATE ROLE ace_audit WITH LOGIN PASSWORD 'changeme';
    END IF;
END
$$;

-- Grant minimal privileges
GRANT CONNECT ON DATABASE ace TO ace_audit;
GRANT USAGE ON SCHEMA public TO ace_audit;
GRANT INSERT ON TABLE audit_log TO ace_audit;

-- Explicitly revoke dangerous operations
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_log FROM ace_audit;
REVOKE CREATE ON SCHEMA public FROM ace_audit;
