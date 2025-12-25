-- Migration: Add question_type and seniority_level columns to case_studies table
-- Created: 2025-12-26

-- Add question_type column (text type for question categories)
ALTER TABLE case_studies
ADD COLUMN question_type TEXT;

-- Add seniority_level column (integer type for years of experience ranges)
ALTER TABLE case_studies
ADD COLUMN seniority_level INTEGER;

-- Add comment to describe the question_type values
COMMENT ON COLUMN case_studies.question_type IS 'Type of product management question: Brainstorming, Strategy, Product Design, Product Improvement, Estimation, Metrics Definition, Root Cause Analysis, Execution, Technical Tradeoffs, Prioritization, Market Entry, Competitive Analysis, Pricing, Go-to-Market';

-- Add comment to describe the seniority_level values
COMMENT ON COLUMN case_studies.seniority_level IS 'Seniority level based on years of experience: 0=Entry-level/APM (0-2 years), 1=Mid-level PM (2-5 years), 2=Senior PM (5-8 years), 3=Lead/Principal/Director+ (8+ years)';

-- Optional: Add check constraint to ensure seniority_level is within valid range (0-3)
ALTER TABLE case_studies
ADD CONSTRAINT check_seniority_level CHECK (seniority_level >= 0 AND seniority_level <= 3);