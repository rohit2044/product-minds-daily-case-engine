-- Migration: Add charts column to case_studies table for storing chart/image metadata
-- Created: 2026-01-02

-- Add charts column (JSONB array for storing chart/image specifications and URLs)
ALTER TABLE case_studies ADD COLUMN charts JSONB DEFAULT '[]';

-- Add comment to describe the charts column structure
COMMENT ON COLUMN case_studies.charts IS 'Array of chart/image objects: [{id, type, title, url, caption, position, chart_type}]. Types: chart (bar, line, pie, funnel, etc.) or image (illustration, diagram, etc.)';

-- Create index for querying cases with/without charts efficiently
CREATE INDEX idx_case_studies_has_charts
ON case_studies ((jsonb_array_length(charts) > 0));

-- Update get_todays_case function to include charts
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