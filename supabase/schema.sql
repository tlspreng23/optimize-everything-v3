-- Optimize Everything v3 — Supabase schema

-- Projects table (extended from v2)
CREATE TABLE IF NOT EXISTS projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name          TEXT NOT NULL DEFAULT 'Untitled Project',

  -- V3: Discovery
  topic         TEXT,
  literature_report JSONB,
  chat_history  JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_avenue TEXT,

  -- V3: Study Architecture
  study_design  JSONB,

  -- V2: Optimisation
  variables     JSONB NOT NULL DEFAULT '[]'::jsonb,
  objectives    JSONB NOT NULL DEFAULT '[]'::jsonb,
  batch_size    INTEGER NOT NULL DEFAULT 5,

  -- V3: Analysis
  analysis_results JSONB,

  -- V3: Paper
  paper         JSONB
);

-- Experiments table (unchanged from v2)
CREATE TABLE IF NOT EXISTS experiments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  variable_values   JSONB NOT NULL DEFAULT '{}'::jsonb,
  objective_values  JSONB NOT NULL DEFAULT '{}'::jsonb,
  source            TEXT NOT NULL DEFAULT 'manual'
);

CREATE INDEX IF NOT EXISTS experiments_project_id_idx ON experiments(project_id);
CREATE INDEX IF NOT EXISTS experiments_created_at_idx ON experiments(created_at);

-- Auto-update updated_at on projects
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS projects_updated_at ON projects;
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Row Level Security
-- All access goes through FastAPI backend using the service_role key (bypasses RLS).
ALTER TABLE projects    ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiments ENABLE ROW LEVEL SECURITY;
