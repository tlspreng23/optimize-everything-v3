-- Migrate existing V2 database to V3
-- Run this in the Supabase SQL editor (same project as V2)

ALTER TABLE projects ADD COLUMN IF NOT EXISTS topic TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS literature_report JSONB;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS chat_history JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS selected_avenue TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS study_design JSONB;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS analysis_results JSONB;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS paper JSONB;
