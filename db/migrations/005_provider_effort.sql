-- Chrono Flex: persist provider reasoning effort alongside the primary model.
ALTER TABLE ai_providers ADD COLUMN IF NOT EXISTS effort TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE ai_providers DROP CONSTRAINT IF EXISTS ai_providers_effort_check;
ALTER TABLE ai_providers ADD CONSTRAINT ai_providers_effort_check CHECK (effort IN ('low', 'medium', 'high'));
