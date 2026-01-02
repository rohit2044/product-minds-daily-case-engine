-- Migration: Add asked_in_company column to case_studies table
-- Created: 2026-01-02

-- Add asked_in_company column (text type for company names where this case study was asked in interviews)
ALTER TABLE case_studies
ADD COLUMN asked_in_company TEXT;

-- Add comment to describe the asked_in_company column
COMMENT ON COLUMN case_studies.asked_in_company IS 'Name of the company where this case study question has been asked in PM interviews (e.g., Google, Meta, Amazon, etc.)';

-- Create index for filtering by asked_in_company
CREATE INDEX idx_case_studies_asked_in_company ON case_studies(asked_in_company);

-- Update the get_todays_case function to include asked_in_company
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
  asked_in_company TEXT
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
    cs.asked_in_company
  FROM case_studies cs
  WHERE cs.scheduled_date = CURRENT_DATE
    AND cs.is_published = true
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;