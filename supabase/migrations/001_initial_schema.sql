-- =====================================================
-- Product Minds Case Study Engine - Database Schema
-- =====================================================
-- Run this in your Supabase SQL Editor

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- =====================================================
-- ENUM TYPES
-- =====================================================

CREATE TYPE source_type AS ENUM (
  'historical_wikipedia',
  'historical_archive',
  'live_news_techcrunch',
  'live_news_hackernews',
  'live_news_producthunt',
  'company_blog',
  'company_earnings',
  'company_sec_filing',
  'framework_classic',
  'framework_book'
);

CREATE TYPE difficulty_level AS ENUM (
  'beginner',
  'intermediate', 
  'advanced'
);

CREATE TYPE generation_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed',
  'skipped_duplicate'
);

-- =====================================================
-- MAIN TABLES
-- =====================================================
-- Note: Tables are created in dependency order to avoid FK errors
-- Circular FKs are added later with ALTER TABLE

-- Sources: Configurable content sources (no dependencies)
CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  name TEXT NOT NULL,
  source_type source_type NOT NULL,

  -- Connection details
  url TEXT NOT NULL, -- RSS feed URL, API endpoint, or base URL
  api_key_env_var TEXT, -- Name of env var containing API key (if needed)

  -- Scraping config
  scrape_selector TEXT, -- CSS selector for content (if web scraping)
  rate_limit_per_hour INTEGER DEFAULT 10,

  -- Scheduling
  day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday, 1=Monday, etc. (when to use this source)
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 1 CHECK (priority > 0), -- Higher = preferred when multiple sources for same day

  -- Stats
  last_scraped_at TIMESTAMPTZ,
  total_cases_generated INTEGER DEFAULT 0,
  success_rate DECIMAL(5,2) DEFAULT 100.00,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generation Logs: Audit trail for debugging (references sources only initially)
CREATE TABLE generation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- What was attempted
  source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
  source_url TEXT,
  raw_content TEXT, -- The scraped content before transformation

  -- Result
  status generation_status DEFAULT 'pending',
  case_study_id UUID, -- FK added later to avoid circular dependency
  error_message TEXT,

  -- Performance metrics
  scrape_duration_ms INTEGER,
  transform_duration_ms INTEGER,
  tokens_used INTEGER,
  cost_usd DECIMAL(10,6),

  -- Deduplication
  similarity_score DECIMAL(5,4), -- If skipped, how similar was it?
  similar_to_case_id UUID, -- FK added later to avoid circular dependency

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Case Studies: The core content table
CREATE TABLE case_studies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Content
  title TEXT NOT NULL,
  hook TEXT NOT NULL, -- Opening line to grab attention
  story_content TEXT NOT NULL, -- The main narrative (500-800 words)
  challenge_prompt TEXT NOT NULL, -- What the user needs to solve
  hints TEXT[] DEFAULT '{}', -- Optional hints for the challenge

  -- Metadata
  source_type source_type NOT NULL,
  source_url TEXT, -- Attribution link
  source_title TEXT, -- Original article/page title
  company_name TEXT,
  industry TEXT,
  year_of_event INTEGER CHECK (year_of_event IS NULL OR (year_of_event >= 1900 AND year_of_event <= EXTRACT(YEAR FROM CURRENT_DATE) + 1)), -- When the real event happened (if historical)

  -- Categorization
  difficulty difficulty_level DEFAULT 'intermediate',
  frameworks_applicable TEXT[] DEFAULT '{}', -- RICE, AARRR, Jobs-to-be-Done, etc.
  tags TEXT[] DEFAULT '{}', -- growth, retention, pricing, etc.

  -- Scheduling
  scheduled_date DATE UNIQUE, -- Only one case per day
  is_published BOOLEAN DEFAULT false,

  -- Deduplication
  content_embedding vector(1536), -- For similarity search
  content_hash TEXT UNIQUE, -- Quick duplicate check

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  generation_log_id UUID -- FK added later to avoid circular dependency
);

-- Daily Schedule: Track what's scheduled for each day
CREATE TABLE daily_schedule (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  schedule_date DATE NOT NULL UNIQUE,
  case_study_id UUID REFERENCES case_studies(id) ON DELETE SET NULL,
  source_type source_type NOT NULL, -- What type was supposed to run

  -- Status
  is_generated BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT false,
  fallback_used BOOLEAN DEFAULT false, -- If primary source failed

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- ADD CIRCULAR FOREIGN KEYS
-- =====================================================
-- Now that all tables exist, add the circular foreign key constraints

ALTER TABLE generation_logs
  ADD CONSTRAINT fk_generation_logs_case_study
  FOREIGN KEY (case_study_id) REFERENCES case_studies(id) ON DELETE SET NULL;

ALTER TABLE generation_logs
  ADD CONSTRAINT fk_generation_logs_similar_case
  FOREIGN KEY (similar_to_case_id) REFERENCES case_studies(id) ON DELETE SET NULL;

ALTER TABLE case_studies
  ADD CONSTRAINT fk_case_studies_generation_log
  FOREIGN KEY (generation_log_id) REFERENCES generation_logs(id) ON DELETE SET NULL;

-- =====================================================
-- INDEXES
-- =====================================================

-- Fast lookup for today's case
CREATE INDEX idx_case_studies_scheduled_date ON case_studies(scheduled_date);
CREATE INDEX idx_case_studies_published ON case_studies(is_published, scheduled_date);

-- Deduplication queries
CREATE INDEX idx_case_studies_company ON case_studies(company_name, created_at);
CREATE INDEX idx_case_studies_content_hash ON case_studies(content_hash);

-- Vector similarity search (for deduplication)
CREATE INDEX idx_case_studies_embedding ON case_studies 
  USING ivfflat (content_embedding vector_cosine_ops)
  WITH (lists = 100);

-- Source scheduling
CREATE INDEX idx_sources_day ON sources(day_of_week, is_active);

-- Log queries
CREATE INDEX idx_generation_logs_date ON generation_logs(created_at);
CREATE INDEX idx_generation_logs_status ON generation_logs(status);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Get today's case study
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
  frameworks_applicable TEXT[],
  tags TEXT[]
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
    cs.frameworks_applicable,
    cs.tags
  FROM case_studies cs
  WHERE cs.scheduled_date = CURRENT_DATE
    AND cs.is_published = true
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Get buffer status (how many days of content ready)
CREATE OR REPLACE FUNCTION get_buffer_status()
RETURNS TABLE (
  total_unpublished INTEGER,
  days_of_buffer INTEGER,
  next_empty_date DATE,
  oldest_unscheduled_date DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INTEGER as total_unpublished,
    COUNT(CASE WHEN scheduled_date >= CURRENT_DATE THEN 1 END)::INTEGER as days_of_buffer,
    (
      SELECT MIN(d::DATE)
      FROM generate_series(CURRENT_DATE, CURRENT_DATE + INTERVAL '60 days', '1 day') d
      WHERE NOT EXISTS (
        SELECT 1 FROM case_studies WHERE scheduled_date = d::DATE
      )
    ) as next_empty_date,
    MIN(CASE WHEN scheduled_date IS NULL THEN created_at::DATE END) as oldest_unscheduled_date
  FROM case_studies
  WHERE is_published = false OR scheduled_date >= CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- Check for similar existing cases (deduplication)
CREATE OR REPLACE FUNCTION find_similar_cases(
  query_embedding vector(1536),
  similarity_threshold DECIMAL DEFAULT 0.85,
  company TEXT DEFAULT NULL,
  days_lookback INTEGER DEFAULT 60
)
RETURNS TABLE (
  case_id UUID,
  title TEXT,
  company_name TEXT,
  similarity DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cs.id as case_id,
    cs.title,
    cs.company_name,
    (1 - (cs.content_embedding <=> query_embedding))::DECIMAL as similarity
  FROM case_studies cs
  WHERE cs.content_embedding IS NOT NULL
    AND cs.created_at > NOW() - (days_lookback || ' days')::INTERVAL
    AND (company IS NULL OR cs.company_name = company)
    AND (1 - (cs.content_embedding <=> query_embedding)) > similarity_threshold
  ORDER BY cs.content_embedding <=> query_embedding
  LIMIT 5;
END;
$$ LANGUAGE plpgsql;

-- Schedule next available case
CREATE OR REPLACE FUNCTION schedule_next_case(target_date DATE)
RETURNS UUID AS $$
DECLARE
  case_id UUID;
  target_source source_type;
BEGIN
  -- Determine which source type should be used for this day
  SELECT s.source_type INTO target_source
  FROM sources s
  WHERE s.day_of_week = EXTRACT(DOW FROM target_date)
    AND s.is_active = true
  ORDER BY s.priority DESC
  LIMIT 1;
  
  -- Find an unscheduled case of the right type
  SELECT cs.id INTO case_id
  FROM case_studies cs
  WHERE cs.scheduled_date IS NULL
    AND cs.source_type = target_source
  ORDER BY cs.created_at ASC
  LIMIT 1;
  
  -- If no matching type, get any unscheduled case
  IF case_id IS NULL THEN
    SELECT cs.id INTO case_id
    FROM case_studies cs
    WHERE cs.scheduled_date IS NULL
    ORDER BY cs.created_at ASC
    LIMIT 1;
  END IF;
  
  -- Schedule it
  IF case_id IS NOT NULL THEN
    UPDATE case_studies
    SET scheduled_date = target_date,
        is_published = true,
        updated_at = NOW()
    WHERE id = case_id;
  END IF;
  
  RETURN case_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

ALTER TABLE case_studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_schedule ENABLE ROW LEVEL SECURITY;

-- Public read access to published cases
CREATE POLICY "Public can read published cases" ON case_studies
  FOR SELECT
  USING (is_published = true AND scheduled_date <= CURRENT_DATE);

-- Service role has full access (for GitHub Actions)
CREATE POLICY "Service role full access to cases" ON case_studies
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to sources" ON sources
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to logs" ON generation_logs
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to schedule" ON daily_schedule
  FOR ALL
  USING (auth.role() = 'service_role');

-- =====================================================
-- SEED DATA: Initial Sources Configuration
-- =====================================================

INSERT INTO sources (name, source_type, url, day_of_week, priority) VALUES
-- Monday & Tuesday: Historical
('Wikipedia Product Launches', 'historical_wikipedia', 'https://en.wikipedia.org/wiki/Category:Product_launches', 1, 1),
('Archive.org Tech News', 'historical_archive', 'https://web.archive.org/web/*/https://techcrunch.com/*', 2, 1),

-- Wednesday & Thursday: Live News
('TechCrunch RSS', 'live_news_techcrunch', 'https://techcrunch.com/feed/', 3, 1),
('Hacker News API', 'live_news_hackernews', 'https://hacker-news.firebaseio.com/v0/topstories.json', 4, 1),
('Product Hunt API', 'live_news_producthunt', 'https://api.producthunt.com/v2/api/graphql', 4, 2),

-- Friday & Saturday: Company Sources
('Company Newsrooms', 'company_blog', 'MULTIPLE', 5, 1),
('SEC Edgar Filings', 'company_sec_filing', 'https://www.sec.gov/cgi-bin/browse-edgar', 6, 1),

-- Sunday: Frameworks
('Classic PM Cases', 'framework_classic', 'INTERNAL', 0, 1);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER case_studies_updated_at
  BEFORE UPDATE ON case_studies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
