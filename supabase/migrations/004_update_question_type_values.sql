-- Migration: Update question_type column comment with new question types
-- Created: 2026-01-02

-- Update comment to describe the new question_type values
COMMENT ON COLUMN case_studies.question_type IS 'Type of product management question: Root Cause Analysis (RCA), Product Design (Open-ended), Metrics & Measurement, Feature Prioritization, Strategy & Vision, Pricing Strategy, Launch Decision, Growth Strategy, Trade-off Analysis, A/B Test Design';