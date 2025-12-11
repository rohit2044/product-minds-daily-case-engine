/**
 * Supabase Client Utility
 * 
 * Centralized Supabase client configuration for the case study engine.
 */

import { createClient } from '@supabase/supabase-js';

// Validate environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing SUPABASE_URL environment variable');
}

if (!supabaseServiceKey) {
  throw new Error('Missing SUPABASE_SERVICE_KEY environment variable');
}

// Create Supabase client with service role key (for server-side operations)
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Get today's case study
 */
export async function getTodaysCase() {
  const today = new Date().toISOString().split('T')[0];
  
  const { data, error } = await supabase
    .from('case_studies')
    .select('*')
    .eq('scheduled_date', today)
    .eq('is_published', true)
    .single();
  
  if (error) {
    console.error('Error fetching today\'s case:', error.message);
    return null;
  }
  
  return data;
}

/**
 * Get buffer status
 */
export async function getBufferStatus() {
  const { data, error } = await supabase.rpc('get_buffer_status');
  
  if (error) {
    console.error('Error getting buffer status:', error.message);
    return null;
  }
  
  return data?.[0] || null;
}

/**
 * Insert a new case study
 */
export async function insertCaseStudy(caseStudy) {
  const { data, error } = await supabase
    .from('case_studies')
    .insert(caseStudy)
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to insert case study: ${error.message}`);
  }
  
  return data;
}

/**
 * Create a generation log entry
 */
export async function createLogEntry(sourceType) {
  const { data, error } = await supabase
    .from('generation_logs')
    .insert({
      status: 'processing',
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create log entry: ${error.message}`);
  }
  
  return data;
}

/**
 * Update a generation log entry
 */
export async function updateLogEntry(id, updates) {
  const { error } = await supabase
    .from('generation_logs')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('Failed to update log:', error.message);
  }
}

/**
 * Schedule a case for a specific date
 */
export async function scheduleCase(caseId, date) {
  const { error } = await supabase
    .from('case_studies')
    .update({ 
      scheduled_date: date,
      is_published: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', caseId);

  if (error) {
    throw new Error(`Failed to schedule case: ${error.message}`);
  }
}

/**
 * Find similar cases using vector similarity
 */
export async function findSimilarCases(embedding, companyName, daysLookback = 60) {
  try {
    const { data, error } = await supabase.rpc('find_similar_cases', {
      query_embedding: embedding,
      similarity_threshold: 0.85,
      company: companyName,
      days_lookback: daysLookback,
    });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Vector search failed:', error.message);
    return [];
  }
}

/**
 * Get recent cases for a company
 */
export async function getRecentCompanyCases(companyName, days = 60) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('case_studies')
    .select('id, title, created_at')
    .eq('company_name', companyName)
    .gte('created_at', cutoffDate)
    .limit(5);

  if (error) {
    console.error('Error fetching recent company cases:', error.message);
    return [];
  }
  
  return data || [];
}

/**
 * Get unscheduled cases
 */
export async function getUnscheduledCases(limit = 100) {
  const { data, error } = await supabase
    .from('case_studies')
    .select('id, source_type, created_at')
    .is('scheduled_date', null)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Error fetching unscheduled cases:', error.message);
    return [];
  }
  
  return data || [];
}

/**
 * Get generation logs for reporting
 */
export async function getRecentLogs(days = 7) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('generation_logs')
    .select('status, created_at, similarity_score')
    .gte('created_at', cutoffDate);

  if (error) {
    console.error('Error fetching logs:', error.message);
    return [];
  }
  
  return data || [];
}

export default supabase;
