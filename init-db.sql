-- Bamboo MCP Database Initialization Script
-- This script sets up the initial database schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create company_profiles table
CREATE TABLE IF NOT EXISTS company_profiles (
    company_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    json_data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_company_profiles_updated_at 
ON company_profiles(updated_at);

CREATE INDEX IF NOT EXISTS idx_company_profiles_json_data_gin 
ON company_profiles USING GIN(json_data);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_company_profiles_updated_at ON company_profiles;
CREATE TRIGGER update_company_profiles_updated_at
    BEFORE UPDATE ON company_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert sample company profile for testing
INSERT INTO company_profiles (company_id, json_data) 
VALUES (
    '550e8400-e29b-41d4-a716-446655440000',
    '{
        "name": "Acme Corporation",
        "industry": "Technology",
        "description": "A leading technology company specializing in innovative solutions",
        "settings": {
            "timezone": "America/New_York",
            "currency": "USD",
            "language": "en"
        },
        "meta_ads": {
            "account_id": "act_123456789",
            "default_campaign_objective": "CONVERSIONS",
            "budget_allocation": {
                "prospecting": 0.7,
                "retargeting": 0.3
            }
        },
        "database": {
            "preferred_schema": "public",
            "read_only_access": false,
            "query_timeout": 30
        },
        "team": {
            "primary_contact": "john.doe@acme.com",
            "marketing_manager": "jane.smith@acme.com",
            "data_analyst": "bob.johnson@acme.com"
        }
    }'
) ON CONFLICT (company_id) DO NOTHING;

-- Create audit log table for tracking changes
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(255) NOT NULL,
    record_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL, -- INSERT, UPDATE, DELETE
    old_data JSONB,
    new_data JSONB,
    user_id VARCHAR(255),
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on audit log
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_log_table_record ON audit_log(table_name, record_id);

-- Create audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log (table_name, record_id, action, old_data, user_id)
        VALUES (TG_TABLE_NAME, OLD.company_id, TG_OP, row_to_json(OLD), current_setting('app.current_user_id', true));
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, user_id)
        VALUES (TG_TABLE_NAME, NEW.company_id, TG_OP, row_to_json(OLD), row_to_json(NEW), current_setting('app.current_user_id', true));
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO audit_log (table_name, record_id, action, new_data, user_id)
        VALUES (TG_TABLE_NAME, NEW.company_id, TG_OP, row_to_json(NEW), current_setting('app.current_user_id', true));
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create audit trigger
DROP TRIGGER IF EXISTS company_profiles_audit_trigger ON company_profiles;
CREATE TRIGGER company_profiles_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON company_profiles
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Grant necessary permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO bamboo;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO bamboo;

-- Display initialization completion message
DO $$
BEGIN
    RAISE NOTICE 'Bamboo MCP database initialization completed successfully!';
    RAISE NOTICE 'Sample company profile created with ID: 550e8400-e29b-41d4-a716-446655440000';
END $$;

