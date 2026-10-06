-- Chrono: account-synced server Gemini model preference.
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_gemini_model TEXT NOT NULL DEFAULT 'gemini-flash-latest';
