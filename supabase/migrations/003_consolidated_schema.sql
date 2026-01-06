-- =====================================================
-- CONSOLIDATED MIGRATION: 003_consolidated_schema.sql
-- =====================================================
-- Combines migrations 003, 004, 005, 006 into one script
-- For fresh deployments only - do NOT run if migrations 003-006 already applied
--
-- Includes:
-- 1. asked_in_company and charts columns
-- 2. New template schema (the_question, mental_model, answer_approach, etc.)
-- 3. Configurations table and versioning system
-- 4. image_prompt field and propagation tracking
-- =====================================================

-- =====================================================
-- PART 1: ADDITIONAL CASE STUDY COLUMNS (from 003)
-- =====================================================

-- Add asked_in_company column
ALTER TABLE case_studies ADD COLUMN IF NOT EXISTS asked_in_company TEXT;

-- Add charts column (JSONB array for chart/image metadata)
ALTER TABLE case_studies ADD COLUMN IF NOT EXISTS charts JSONB DEFAULT '[]';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_case_studies_asked_in_company ON case_studies(asked_in_company);
CREATE INDEX IF NOT EXISTS idx_case_studies_has_charts ON case_studies ((jsonb_array_length(charts) > 0));

COMMENT ON COLUMN case_studies.asked_in_company IS 'Company where this question has been asked in PM interviews';
COMMENT ON COLUMN case_studies.charts IS 'Array of chart/image objects with URLs and metadata';

-- =====================================================
-- PART 2: NEW TEMPLATE SCHEMA (from 004)
-- =====================================================

-- The actual interview question
ALTER TABLE case_studies ADD COLUMN IF NOT EXISTS the_question TEXT;

-- Read time in minutes
ALTER TABLE case_studies ADD COLUMN IF NOT EXISTS read_time_minutes INTEGER DEFAULT 3;

-- What Really Happened story
ALTER TABLE case_studies ADD COLUMN IF NOT EXISTS what_happened TEXT;

-- Mental Model JSON
ALTER TABLE case_studies ADD COLUMN IF NOT EXISTS mental_model JSONB;

-- Answer Approach (7 parts)
ALTER TABLE case_studies ADD COLUMN IF NOT EXISTS answer_approach JSONB;

-- Pushback Scenarios
ALTER TABLE case_studies ADD COLUMN IF NOT EXISTS pushback_scenarios JSONB;

-- Summary
ALTER TABLE case_studies ADD COLUMN IF NOT EXISTS summary JSONB;

-- Interviewer Evaluation Points
ALTER TABLE case_studies ADD COLUMN IF NOT EXISTS interviewer_evaluation TEXT[] DEFAULT '{}';

-- Common Mistakes
ALTER TABLE case_studies ADD COLUMN IF NOT EXISTS common_mistakes TEXT[] DEFAULT '{}';

-- Practice Question
ALTER TABLE case_studies ADD COLUMN IF NOT EXISTS practice JSONB;

-- Drop old columns if they exist
ALTER TABLE case_studies DROP COLUMN IF EXISTS hook;
ALTER TABLE case_studies DROP COLUMN IF EXISTS story_content;
ALTER TABLE case_studies DROP COLUMN IF EXISTS challenge_prompt;
ALTER TABLE case_studies DROP COLUMN IF EXISTS hints;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_case_studies_read_time ON case_studies(read_time_minutes);
CREATE INDEX IF NOT EXISTS idx_case_studies_mental_model ON case_studies USING GIN (mental_model);
CREATE INDEX IF NOT EXISTS idx_case_studies_answer_approach ON case_studies USING GIN (answer_approach);

-- Column comments
COMMENT ON COLUMN case_studies.the_question IS 'The exact interview question in quotes';
COMMENT ON COLUMN case_studies.read_time_minutes IS 'Estimated read time (2-3 min typical)';
COMMENT ON COLUMN case_studies.what_happened IS 'Real story: problem, solution, result, lesson';
COMMENT ON COLUMN case_studies.mental_model IS 'JSON: {flow, intro, steps[], disclaimer}';
COMMENT ON COLUMN case_studies.answer_approach IS 'JSON array of 7 parts with dialogue and reasoning';
COMMENT ON COLUMN case_studies.pushback_scenarios IS 'JSON array: [{if_they_say, you_say}]';
COMMENT ON COLUMN case_studies.summary IS 'JSON: {approach[], key_insight}';
COMMENT ON COLUMN case_studies.interviewer_evaluation IS 'What interviewers look for (6-8 items)';
COMMENT ON COLUMN case_studies.common_mistakes IS 'Mistakes to avoid (5-6 items)';
COMMENT ON COLUMN case_studies.practice IS 'JSON: {question, guidance}';

-- =====================================================
-- PART 3: CONFIGURATIONS TABLE (from 005)
-- =====================================================

CREATE TABLE IF NOT EXISTS configurations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  config_key VARCHAR(100) UNIQUE NOT NULL,
  config_value JSONB NOT NULL,
  config_type VARCHAR(50) NOT NULL CHECK (config_type IN (
    'prompt_section', 'system', 'feature_flag', 'threshold'
  )),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  version INTEGER DEFAULT 1,
  parent_key VARCHAR(100),
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(100) DEFAULT 'system'
);

-- Self-referential FK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_configurations_parent'
  ) THEN
    ALTER TABLE configurations
      ADD CONSTRAINT fk_configurations_parent
      FOREIGN KEY (parent_key) REFERENCES configurations(config_key) ON DELETE SET NULL;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_configurations_type_active ON configurations(config_type, is_active);
CREATE INDEX IF NOT EXISTS idx_configurations_key ON configurations(config_key);
CREATE INDEX IF NOT EXISTS idx_configurations_parent ON configurations(parent_key);
CREATE INDEX IF NOT EXISTS idx_configurations_order ON configurations(config_type, display_order);

-- =====================================================
-- PART 4: CASE STUDY VERSIONS TABLE (from 005)
-- =====================================================

CREATE TABLE IF NOT EXISTS case_study_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_study_id UUID NOT NULL REFERENCES case_studies(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  change_type VARCHAR(50) NOT NULL CHECK (change_type IN (
    'content', 'metadata', 'visuals', 'full_regenerate', 'soft_delete', 'restore'
  )),
  changed_fields TEXT[] DEFAULT '{}',
  change_reason TEXT,
  previous_values JSONB NOT NULL DEFAULT '{}',
  new_values JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(100) DEFAULT 'system',
  UNIQUE(case_study_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_case_versions_case_id ON case_study_versions(case_study_id);
CREATE INDEX IF NOT EXISTS idx_case_versions_created ON case_study_versions(created_at);
CREATE INDEX IF NOT EXISTS idx_case_versions_type ON case_study_versions(change_type);

-- =====================================================
-- PART 5: VERSIONING & SOFT DELETE FOR CASE_STUDIES (from 005)
-- =====================================================

ALTER TABLE case_studies ADD COLUMN IF NOT EXISTS current_version INTEGER DEFAULT 1;
ALTER TABLE case_studies ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE case_studies ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(100);
ALTER TABLE case_studies ADD COLUMN IF NOT EXISTS delete_reason TEXT;
ALTER TABLE case_studies ADD COLUMN IF NOT EXISTS prompt_version_hash VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_case_studies_deleted ON case_studies(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_case_studies_version ON case_studies(current_version);

-- =====================================================
-- PART 6: IMAGE PROMPT & PROPAGATION (from 006)
-- =====================================================

-- Add image_prompt column
ALTER TABLE case_studies ADD COLUMN IF NOT EXISTS image_prompt TEXT;

-- Add image generation status
DO $$
BEGIN
  ALTER TABLE case_studies ADD COLUMN IF NOT EXISTS image_generation_status VARCHAR(20) DEFAULT 'pending';
  -- Add constraint if column is new
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'case_studies_image_generation_status_check'
  ) THEN
    ALTER TABLE case_studies
      ADD CONSTRAINT case_studies_image_generation_status_check
      CHECK (image_generation_status IN ('pending', 'generating', 'completed', 'failed'));
  END IF;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Config version hash tracking
ALTER TABLE case_studies ADD COLUMN IF NOT EXISTS config_version_hash VARCHAR(64);

-- Propagation logs table
CREATE TABLE IF NOT EXISTS config_propagation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  config_key VARCHAR(100) NOT NULL,
  previous_version INTEGER,
  new_version INTEGER,
  propagation_type VARCHAR(50) NOT NULL CHECK (propagation_type IN (
    'prompt_change', 'threshold_change', 'bulk_regenerate'
  )),
  total_cases INTEGER DEFAULT 0,
  processed_cases INTEGER DEFAULT 0,
  failed_cases INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
    'pending', 'in_progress', 'completed', 'failed', 'cancelled'
  )),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(100) DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS idx_propagation_logs_status ON config_propagation_logs(status);
CREATE INDEX IF NOT EXISTS idx_propagation_logs_config ON config_propagation_logs(config_key);

-- Valid config keys reference
CREATE TABLE IF NOT EXISTS valid_config_keys (
  config_key VARCHAR(100) PRIMARY KEY,
  config_type VARCHAR(50) NOT NULL,
  description TEXT,
  is_required BOOLEAN DEFAULT false
);

-- =====================================================
-- PART 7: HELPER FUNCTIONS
-- =====================================================

-- Get single config value
CREATE OR REPLACE FUNCTION get_config(p_key VARCHAR)
RETURNS JSONB AS $$
  SELECT config_value FROM configurations
  WHERE config_key = p_key AND is_active = true;
$$ LANGUAGE sql STABLE;

-- Get configs by type
CREATE OR REPLACE FUNCTION get_configs_by_type(p_type VARCHAR)
RETURNS TABLE (config_key VARCHAR, config_value JSONB, display_order INTEGER) AS $$
  SELECT c.config_key, c.config_value, c.display_order
  FROM configurations c
  WHERE c.config_type = p_type AND c.is_active = true
  ORDER BY c.display_order ASC;
$$ LANGUAGE sql STABLE;

-- Assemble prompt from sections
CREATE OR REPLACE FUNCTION get_assembled_prompt()
RETURNS TEXT AS $$
DECLARE
  result TEXT := '';
  section RECORD;
BEGIN
  FOR section IN
    SELECT config_key, config_value FROM configurations
    WHERE config_type = 'prompt_section' AND is_active = true
    ORDER BY display_order ASC
  LOOP
    result := result || (section.config_value->>'content') || E'\n\n';
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get prompt version hash
CREATE OR REPLACE FUNCTION get_prompt_version_hash()
RETURNS VARCHAR AS $$
DECLARE prompt_text TEXT;
BEGIN
  SELECT get_assembled_prompt() INTO prompt_text;
  RETURN md5(prompt_text);
END;
$$ LANGUAGE plpgsql STABLE;

-- Create case version with auto-pruning
CREATE OR REPLACE FUNCTION create_case_version(
  p_case_id UUID,
  p_change_type VARCHAR,
  p_changed_fields TEXT[],
  p_change_reason TEXT,
  p_previous_values JSONB,
  p_new_values JSONB,
  p_created_by VARCHAR DEFAULT 'system'
)
RETURNS UUID AS $$
DECLARE
  new_version_number INTEGER;
  version_count INTEGER;
  new_version_id UUID;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO new_version_number
  FROM case_study_versions WHERE case_study_id = p_case_id;

  INSERT INTO case_study_versions (
    case_study_id, version_number, change_type, changed_fields,
    change_reason, previous_values, new_values, created_by
  ) VALUES (
    p_case_id, new_version_number, p_change_type, p_changed_fields,
    p_change_reason, p_previous_values, p_new_values, p_created_by
  ) RETURNING id INTO new_version_id;

  UPDATE case_studies SET current_version = new_version_number WHERE id = p_case_id;

  SELECT COUNT(*) INTO version_count FROM case_study_versions WHERE case_study_id = p_case_id;
  IF version_count > 5 THEN
    DELETE FROM case_study_versions WHERE id IN (
      SELECT id FROM case_study_versions
      WHERE case_study_id = p_case_id ORDER BY version_number ASC LIMIT (version_count - 5)
    );
  END IF;

  RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;

-- Soft delete case
CREATE OR REPLACE FUNCTION soft_delete_case(
  p_case_id UUID, p_reason TEXT DEFAULT NULL, p_deleted_by VARCHAR DEFAULT 'system'
)
RETURNS BOOLEAN AS $$
DECLARE case_exists BOOLEAN; previous_data JSONB;
BEGIN
  SELECT EXISTS(SELECT 1 FROM case_studies WHERE id = p_case_id AND deleted_at IS NULL) INTO case_exists;
  IF NOT case_exists THEN RETURN FALSE; END IF;

  SELECT jsonb_build_object('is_published', is_published, 'scheduled_date', scheduled_date)
  INTO previous_data FROM case_studies WHERE id = p_case_id;

  PERFORM create_case_version(p_case_id, 'soft_delete',
    ARRAY['deleted_at', 'deleted_by', 'delete_reason', 'is_published'],
    p_reason, previous_data,
    jsonb_build_object('deleted_at', NOW(), 'deleted_by', p_deleted_by, 'is_published', false),
    p_deleted_by);

  UPDATE case_studies SET deleted_at = NOW(), deleted_by = p_deleted_by,
    delete_reason = p_reason, is_published = false WHERE id = p_case_id;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Restore case
CREATE OR REPLACE FUNCTION restore_case(p_case_id UUID, p_restored_by VARCHAR DEFAULT 'system')
RETURNS BOOLEAN AS $$
DECLARE case_exists BOOLEAN; previous_data JSONB;
BEGIN
  SELECT EXISTS(SELECT 1 FROM case_studies WHERE id = p_case_id AND deleted_at IS NOT NULL) INTO case_exists;
  IF NOT case_exists THEN RETURN FALSE; END IF;

  SELECT jsonb_build_object('deleted_at', deleted_at, 'deleted_by', deleted_by, 'delete_reason', delete_reason)
  INTO previous_data FROM case_studies WHERE id = p_case_id;

  PERFORM create_case_version(p_case_id, 'restore',
    ARRAY['deleted_at', 'deleted_by', 'delete_reason'], 'Restored from soft delete',
    previous_data, jsonb_build_object('deleted_at', null, 'deleted_by', null, 'delete_reason', null),
    p_restored_by);

  UPDATE case_studies SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL WHERE id = p_case_id;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Update config with version increment
CREATE OR REPLACE FUNCTION update_config(p_key VARCHAR, p_value JSONB, p_updated_by VARCHAR DEFAULT 'system')
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE configurations SET config_value = p_value, version = version + 1, updated_at = NOW()
  WHERE config_key = p_key;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Create propagation log
CREATE OR REPLACE FUNCTION create_propagation_log(
  p_config_key VARCHAR, p_previous_version INTEGER, p_new_version INTEGER,
  p_propagation_type VARCHAR, p_total_cases INTEGER, p_created_by VARCHAR DEFAULT 'system'
)
RETURNS UUID AS $$
DECLARE new_log_id UUID;
BEGIN
  INSERT INTO config_propagation_logs (
    config_key, previous_version, new_version, propagation_type, total_cases, status, created_by
  ) VALUES (
    p_config_key, p_previous_version, p_new_version, p_propagation_type, p_total_cases, 'pending', p_created_by
  ) RETURNING id INTO new_log_id;
  RETURN new_log_id;
END;
$$ LANGUAGE plpgsql;

-- Update propagation progress
CREATE OR REPLACE FUNCTION update_propagation_progress(
  p_log_id UUID, p_processed INTEGER, p_failed INTEGER DEFAULT 0,
  p_status VARCHAR DEFAULT NULL, p_error TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE config_propagation_logs SET
    processed_cases = p_processed, failed_cases = p_failed,
    status = COALESCE(p_status, status), error_message = COALESCE(p_error, error_message),
    started_at = CASE WHEN p_status = 'in_progress' AND started_at IS NULL THEN NOW() ELSE started_at END,
    completed_at = CASE WHEN p_status IN ('completed', 'failed', 'cancelled') THEN NOW() ELSE completed_at END
  WHERE id = p_log_id;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Validate config key
CREATE OR REPLACE FUNCTION validate_config_key(p_key VARCHAR)
RETURNS TABLE (is_valid BOOLEAN, expected_type VARCHAR, valid_keys TEXT[]) AS $$
BEGIN
  RETURN QUERY SELECT
    EXISTS(SELECT 1 FROM valid_config_keys WHERE config_key = p_key),
    (SELECT vck.config_type FROM valid_config_keys vck WHERE vck.config_key = p_key),
    (SELECT array_agg(vck.config_key ORDER BY vck.config_key) FROM valid_config_keys vck);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PART 8: ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_study_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_propagation_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then create
DROP POLICY IF EXISTS "Public can read active configs" ON configurations;
DROP POLICY IF EXISTS "Service role full access to configs" ON configurations;
DROP POLICY IF EXISTS "Public can read versions of published cases" ON case_study_versions;
DROP POLICY IF EXISTS "Service role full access to versions" ON case_study_versions;
DROP POLICY IF EXISTS "Service role full access to propagation logs" ON config_propagation_logs;
DROP POLICY IF EXISTS "Public can read published non-deleted cases" ON case_studies;

CREATE POLICY "Public can read active configs" ON configurations FOR SELECT USING (is_active = true);
CREATE POLICY "Service role full access to configs" ON configurations FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Public can read versions of published cases" ON case_study_versions FOR SELECT USING (
  EXISTS (SELECT 1 FROM case_studies cs WHERE cs.id = case_study_versions.case_study_id
    AND cs.is_published = true AND cs.deleted_at IS NULL)
);
CREATE POLICY "Service role full access to versions" ON case_study_versions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access to propagation logs" ON config_propagation_logs FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Public can read published non-deleted cases" ON case_studies FOR SELECT USING (
  is_published = true AND scheduled_date <= CURRENT_DATE AND deleted_at IS NULL
);

-- =====================================================
-- PART 9: TRIGGERS
-- =====================================================

DROP TRIGGER IF EXISTS configurations_updated_at ON configurations;
CREATE TRIGGER configurations_updated_at BEFORE UPDATE ON configurations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- PART 10: SEED DATA
-- =====================================================

-- Seed prompt sections
INSERT INTO configurations (config_key, config_type, config_value, description, display_order) VALUES
('prompt_system_intro', 'prompt_section', '{"content": "You are creating a PM interview case study in a daily post format (2-3 minute read, ~600-700 words max).\n\nYour job is to transform raw information about products, companies, and business events into structured, interview-ready case studies that help PMs practice real decision-making."}'::jsonb, 'System role definition', 10),
('prompt_output_schema', 'prompt_section', '{"content": "## OUTPUT STRUCTURE\n\nGenerate a JSON object with: title, the_question, read_time_minutes, what_happened, mental_model, answer_approach (7 parts), pushback_scenarios, summary, interviewer_evaluation, common_mistakes, practice, difficulty, question_type, seniority_level, frameworks_applicable, industry, tags, company_name, asked_in_company, image_prompt"}'::jsonb, 'JSON output schema', 20),
('prompt_question_types', 'prompt_section', '{"content": "## QUESTION TYPES\n\nChoose one: Root Cause Analysis (RCA), Product Design (Open-ended), Metrics & Measurement, Feature Prioritization, Strategy & Vision, Pricing Strategy, Launch Decision, Growth Strategy, Trade-off Analysis, A/B Test Design, Estimation, Execution"}'::jsonb, 'Available question types', 30),
('prompt_mental_models', 'prompt_section', '{"content": "## MENTAL MODEL PATTERNS\n\n- Root Cause: Clarify → Scope → Decompose → Diagnose → Theorize → Validate → Solve\n- Product Design: Clarify → Users → Problems → Solutions → Prioritize → Validate → Recommend\n- Prioritization: Understand → Define Success → Generate → Evaluate → Trade-offs → Decide → Communicate\n- Metrics: Clarify → Goals → Metrics → Diagnose → Hypothesize → Validate → Fix\n- Strategy: Situation → Vision → Options → Evaluate → Trade-offs → Decide → Communicate"}'::jsonb, 'Mental model patterns', 40),
('prompt_answer_structure', 'prompt_section', '{"content": "## SENIORITY LEVELS\n0 = Entry/APM (0-2 yrs), 1 = Mid (2-5 yrs), 2 = Senior (5-8 yrs), 3 = Lead/Director+ (8+ yrs)\n\n## DIFFICULTY\nbeginner = Clear problem, obvious approaches\nintermediate = Some ambiguity, multiple approaches\nadvanced = High ambiguity, complex trade-offs"}'::jsonb, 'Seniority and difficulty', 50),
('prompt_evaluation_criteria', 'prompt_section', '{"content": "## ASKED IN COMPANY\nMatch to company styles: Google (product sense), Meta (growth), Amazon (leadership principles), Apple (design), Microsoft (enterprise), Netflix (content), Uber (marketplace), Airbnb (trust), Stripe (developer exp). Use null if no match."}'::jsonb, 'Company matching', 60),
('prompt_image_generation', 'prompt_section', '{"content": "## IMAGE GENERATION\n\nGenerate a concise image_prompt (1-2 sentences) describing a professional visual representation of the case study. Focus on abstract concepts, charts, or business scenarios. Avoid specific people or logos."}'::jsonb, 'Image prompt instructions', 70),
('prompt_source_customization', 'prompt_section', '{"content": "## WRITING STYLE\n- Conversational but professional\n- Use → arrows for transitions\n- Bold key concepts\n- Short paragraphs (2-3 sentences)\n- 600-700 words, 2-3 min read\n- 7 answer_approach parts with timing\n- 2-3 pushback scenarios\n- 6-8 evaluation points\n- 5-6 common mistakes\n\nRespond with valid JSON only."}'::jsonb, 'Writing style', 80)
ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value, display_order = EXCLUDED.display_order, updated_at = NOW();

-- Seed system configs
INSERT INTO configurations (config_key, config_type, config_value, description) VALUES
('similarity_threshold', 'threshold', '{"value": 0.85}'::jsonb, 'Duplicate detection threshold'),
('company_cooldown_days', 'threshold', '{"value": 60}'::jsonb, 'Company cooldown days'),
('buffer_target_days', 'system', '{"value": 14}'::jsonb, 'Content buffer target'),
('max_generation_per_run', 'system', '{"value": 3}'::jsonb, 'Max cases per run'),
('groq_model', 'system', '{"value": "llama-3.3-70b-versatile"}'::jsonb, 'Default Groq model'),
('groq_max_tokens', 'system', '{"value": 4000}'::jsonb, 'Max LLM tokens'),
('chart_color_palettes', 'system', '{"default": ["#4F46E5", "#10B981", "#F59E0B", "#EF4444"]}'::jsonb, 'Chart colors'),
('version_retention_count', 'system', '{"value": 5}'::jsonb, 'Version retention')
ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value, updated_at = NOW();

-- Seed valid config keys
INSERT INTO valid_config_keys (config_key, config_type, description, is_required) VALUES
('prompt_system_intro', 'prompt_section', 'System role definition', true),
('prompt_output_schema', 'prompt_section', 'JSON output schema', true),
('prompt_question_types', 'prompt_section', 'Question type definitions', true),
('prompt_mental_models', 'prompt_section', 'Mental model patterns', true),
('prompt_answer_structure', 'prompt_section', 'Seniority/difficulty levels', true),
('prompt_evaluation_criteria', 'prompt_section', 'Company interview matching', true),
('prompt_image_generation', 'prompt_section', 'Image prompt instructions', true),
('prompt_source_customization', 'prompt_section', 'Writing style constraints', true),
('similarity_threshold', 'threshold', 'Duplicate detection threshold', false),
('company_cooldown_days', 'threshold', 'Company cooldown period', false),
('buffer_target_days', 'system', 'Content buffer target', false),
('max_generation_per_run', 'system', 'Max cases per generation', false),
('groq_model', 'system', 'Default LLM model', false),
('groq_max_tokens', 'system', 'Max tokens for LLM', false),
('chart_color_palettes', 'system', 'Color palettes', false),
('version_retention_count', 'system', 'Version history limit', false)
ON CONFLICT (config_key) DO NOTHING;