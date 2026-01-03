-- Migration: Restructure case_studies for new PM interview template
-- Created: 2025-01-04
-- Description: Replaces narrative storytelling format with structured interview-ready case study format

-- =====================================================
-- STEP 1: ADD NEW COLUMNS
-- =====================================================

-- The actual interview question in quotes
ALTER TABLE case_studies ADD COLUMN the_question TEXT;

-- Estimated read time in minutes (2-3 min typical)
ALTER TABLE case_studies ADD COLUMN read_time_minutes INTEGER DEFAULT 3;

-- What Really Happened: 3-4 sentence story (problem → solution → result → lesson)
ALTER TABLE case_studies ADD COLUMN what_happened TEXT;

-- Mental Model: {flow: "Understand → Define → ...", steps: ["step1", "step2", ...], disclaimer: "..."}
ALTER TABLE case_studies ADD COLUMN mental_model JSONB;

-- How to Answer: Array of 7 parts
-- [{part_number, title, time_estimate, what_you_say, questions_to_ask, thinking}, ...]
ALTER TABLE case_studies ADD COLUMN answer_approach JSONB;

-- Handling Pushback: Array of objection/response pairs
-- [{if_they_say: "...", you_say: "..."}, ...]
ALTER TABLE case_studies ADD COLUMN pushback_scenarios JSONB;

-- Summary: {approach: ["part1", "part2", ...], key_insight: "..."}
ALTER TABLE case_studies ADD COLUMN summary JSONB;

-- What Interviewers Evaluate: Array of evaluation criteria
ALTER TABLE case_studies ADD COLUMN interviewer_evaluation TEXT[] DEFAULT '{}';

-- Common Mistakes: Array of mistakes to avoid
ALTER TABLE case_studies ADD COLUMN common_mistakes TEXT[] DEFAULT '{}';

-- Practice Question: {question: "...", guidance: "..."}
ALTER TABLE case_studies ADD COLUMN practice JSONB;

-- =====================================================
-- STEP 2: ADD COLUMN COMMENTS
-- =====================================================

COMMENT ON COLUMN case_studies.the_question IS 'The exact interview question in quotes that the reader needs to answer';
COMMENT ON COLUMN case_studies.read_time_minutes IS 'Estimated read time in minutes (typically 2-3)';
COMMENT ON COLUMN case_studies.what_happened IS 'Real story: 3-4 sentences covering problem, solution, result, and lesson learned';
COMMENT ON COLUMN case_studies.mental_model IS 'JSON: {flow: "Step1 → Step2 → ...", steps: ["desc1", "desc2", ...], disclaimer: "This isnt a rigid script..."}';
COMMENT ON COLUMN case_studies.answer_approach IS 'JSON array of 7 parts: [{part_number, title, time_estimate, what_you_say, questions_to_ask, thinking}]';
COMMENT ON COLUMN case_studies.pushback_scenarios IS 'JSON array: [{if_they_say: "objection", you_say: "response"}]';
COMMENT ON COLUMN case_studies.summary IS 'JSON: {approach: ["7 part names"], key_insight: "one sentence takeaway"}';
COMMENT ON COLUMN case_studies.interviewer_evaluation IS 'Array of what interviewers look for (6-8 items)';
COMMENT ON COLUMN case_studies.common_mistakes IS 'Array of common mistakes to avoid (5-6 items)';
COMMENT ON COLUMN case_studies.practice IS 'JSON: {question: "similar practice question", guidance: "brief guidance on applying approach"}';

-- =====================================================
-- STEP 3: DROP OLD COLUMNS
-- =====================================================

-- Remove old narrative-style columns that are replaced by new structure
ALTER TABLE case_studies DROP COLUMN IF EXISTS hook;
ALTER TABLE case_studies DROP COLUMN IF EXISTS story_content;
ALTER TABLE case_studies DROP COLUMN IF EXISTS challenge_prompt;
ALTER TABLE case_studies DROP COLUMN IF EXISTS hints;

-- =====================================================
-- STEP 4: UPDATE get_todays_case FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION get_todays_case()
RETURNS TABLE (
  id UUID,
  title TEXT,
  the_question TEXT,
  read_time_minutes INTEGER,
  what_happened TEXT,
  mental_model JSONB,
  answer_approach JSONB,
  pushback_scenarios JSONB,
  summary JSONB,
  interviewer_evaluation TEXT[],
  common_mistakes TEXT[],
  practice JSONB,
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
    cs.the_question,
    cs.read_time_minutes,
    cs.what_happened,
    cs.mental_model,
    cs.answer_approach,
    cs.pushback_scenarios,
    cs.summary,
    cs.interviewer_evaluation,
    cs.common_mistakes,
    cs.practice,
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

-- =====================================================
-- STEP 5: ADD INDEXES FOR NEW COLUMNS
-- =====================================================

-- Index for filtering by read time
CREATE INDEX idx_case_studies_read_time ON case_studies(read_time_minutes);

-- GIN index for JSONB columns to enable efficient querying
CREATE INDEX idx_case_studies_mental_model ON case_studies USING GIN (mental_model);
CREATE INDEX idx_case_studies_answer_approach ON case_studies USING GIN (answer_approach);