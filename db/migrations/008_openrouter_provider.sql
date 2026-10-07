-- Chrono — allow saved OpenRouter provider records.
ALTER TABLE ai_providers DROP CONSTRAINT IF EXISTS ai_providers_kind_check;
ALTER TABLE ai_providers ADD CONSTRAINT ai_providers_kind_check CHECK (kind IN ('openai', 'anthropic', 'gemini', 'groq', 'openrouter', 'openai-compatible'));
