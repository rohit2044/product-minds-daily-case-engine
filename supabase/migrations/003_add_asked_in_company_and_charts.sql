-- Migration: Add asked_in_company and charts columns to case_studies table
-- Merged from: 003_add_asked_in_company.sql, 004_update_question_type_values.sql, 005_add_charts_column.sql

-- Add asked_in_company column
ALTER TABLE case_studies ADD COLUMN asked_in_company TEXT;

-- Add charts column (JSONB array for chart/image metadata)
ALTER TABLE case_studies ADD COLUMN charts JSONB DEFAULT '[]';

-- Column comments
COMMENT ON COLUMN case_studies.asked_in_company IS 'Name of the company where this case study question has been asked in PM interviews (e.g., Google, Meta, Amazon, etc.)';
COMMENT ON COLUMN case_studies.charts IS 'Array of chart/image objects: [{id, type, title, url, caption, position, chart_type}]. Types: chart (bar, line, pie, funnel, etc.) or image (illustration, diagram, etc.)';
COMMENT ON COLUMN case_studies.question_type IS 'Type of product management question: Root Cause Analysis (RCA), Product Design (Open-ended), Metrics & Measurement, Feature Prioritization, Strategy & Vision, Pricing Strategy, Launch Decision, Growth Strategy, Trade-off Analysis, A/B Test Design';

-- Indexes
CREATE INDEX idx_case_studies_asked_in_company ON case_studies(asked_in_company);
CREATE INDEX idx_case_studies_has_charts ON case_studies ((jsonb_array_length(charts) > 0));

-- Update get_todays_case function to include new columns
CREATE OR REPLACE FUNCTION get_todays_case()
RETURNS TABLE (
  id UUID,
  title TEXT,
  hook TEXT,
  story_content TEXT,
  challenge_prompt TEXT,
  hints TEXT[],
  source_type source_type,
  source_url TEXT,
  company_name TEXT,
  industry TEXT,
  difficulty difficulty_level,
  question_type TEXT,
  seniority_level INTEGER,
  frameworks_applicable TEXT[],
  tags TEXT[],
  asked_in_company TEXT,
  charts JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cs.id,
    cs.title,
    cs.hook,
    cs.story_content,
    cs.challenge_prompt,
    cs.hints,
    cs.source_type,
    cs.source_url,
    cs.company_name,
    cs.industry,
    cs.difficulty,
    cs.question_type,
    cs.seniority_level,
    cs.frameworks_applicable,
    cs.tags,
    cs.asked_in_company,
    cs.charts
  FROM case_studies cs
  WHERE cs.scheduled_date = CURRENT_DATE
    AND cs.is_published = true
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;