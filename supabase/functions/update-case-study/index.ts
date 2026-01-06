/**
 * Update Case Study Edge Function
 *
 * PATCH /update-case-study
 *
 * Updates case studies with version tracking.
 * Supports both single case and bulk operations.
 *
 * Modes:
 * 1. Single case: Update one case by caseId
 * 2. Bulk: Update multiple/all cases with same updates
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Valid field definitions for validation
const VALID_FIELDS = {
  // Content fields
  content: [
    'title', 'the_question', 'read_time_minutes', 'what_happened',
    'mental_model', 'answer_approach', 'pushback_scenarios', 'summary',
    'interviewer_evaluation', 'common_mistakes', 'practice', 'image_prompt'
  ],
  // Metadata fields
  metadata: [
    'difficulty', 'question_type', 'seniority_level', 'frameworks_applicable',
    'tags', 'asked_in_company', 'industry', 'company_name', 'source_type'
  ],
  // Visual fields
  visuals: ['charts', 'image_generation_status'],
  // System fields (not directly updatable)
  system: [
    'id', 'created_at', 'updated_at', 'deleted_at', 'deleted_by',
    'delete_reason', 'current_version', 'content_embedding', 'content_hash',
    'generation_log_id', 'prompt_version_hash', 'config_version_hash'
  ],
}

// Valid enum values
const VALID_ENUMS = {
  difficulty: ['beginner', 'intermediate', 'advanced'],
  question_type: [
    'Root Cause Analysis (RCA)', 'Product Design (Open-ended)',
    'Metrics & Measurement', 'Feature Prioritization', 'Strategy & Vision',
    'Pricing Strategy', 'Launch Decision', 'Growth Strategy',
    'Trade-off Analysis', 'A/B Test Design', 'Estimation', 'Execution'
  ],
  seniority_level: [0, 1, 2, 3],
  image_generation_status: ['pending', 'generating', 'completed', 'failed'],
  source_type: [
    'historical_wikipedia', 'historical_archive', 'live_news_techcrunch',
    'live_news_hackernews', 'live_news_producthunt', 'company_blog',
    'company_earnings', 'company_sec_filing', 'framework_classic', 'framework_book'
  ],
}

interface UpdatePayload {
  // Single case mode
  caseId?: string
  updates?: Record<string, unknown>

  // Bulk mode
  bulk?: boolean
  caseIds?: string[]  // Specific case IDs, or empty for all
  filter?: {
    questionType?: string
    difficulty?: string
    industry?: string
    beforeDate?: string
    afterDate?: string
  }

  // Common options
  options?: {
    updateType?: 'content' | 'metadata' | 'visuals' | 'full_regenerate'
    changeReason?: string
    updatedBy?: string
    skipVersioning?: boolean
  }
}

interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

// Validate a single update object
function validateUpdates(updates: Record<string, unknown>): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const allValidFields = [
    ...VALID_FIELDS.content,
    ...VALID_FIELDS.metadata,
    ...VALID_FIELDS.visuals,
  ]

  // Check for invalid fields
  for (const key of Object.keys(updates)) {
    if (VALID_FIELDS.system.includes(key)) {
      errors.push(`Field '${key}' is a system field and cannot be updated directly`)
    } else if (!allValidFields.includes(key)) {
      warnings.push(`Unknown field '${key}' - will be ignored`)
    }
  }

  // Validate enum fields
  if (updates.difficulty !== undefined) {
    if (!VALID_ENUMS.difficulty.includes(updates.difficulty as string)) {
      errors.push(`Invalid difficulty '${updates.difficulty}'. Valid values: ${VALID_ENUMS.difficulty.join(', ')}`)
    }
  }

  if (updates.question_type !== undefined) {
    if (!VALID_ENUMS.question_type.includes(updates.question_type as string)) {
      errors.push(`Invalid question_type '${updates.question_type}'. Valid values: ${VALID_ENUMS.question_type.join(', ')}`)
    }
  }

  if (updates.seniority_level !== undefined) {
    const level = updates.seniority_level as number
    if (!VALID_ENUMS.seniority_level.includes(level)) {
      errors.push(`Invalid seniority_level '${level}'. Valid values: ${VALID_ENUMS.seniority_level.join(', ')}`)
    }
  }

  if (updates.source_type !== undefined) {
    if (!VALID_ENUMS.source_type.includes(updates.source_type as string)) {
      errors.push(`Invalid source_type '${updates.source_type}'. Valid values: ${VALID_ENUMS.source_type.join(', ')}`)
    }
  }

  if (updates.image_generation_status !== undefined) {
    if (!VALID_ENUMS.image_generation_status.includes(updates.image_generation_status as string)) {
      errors.push(`Invalid image_generation_status '${updates.image_generation_status}'. Valid values: ${VALID_ENUMS.image_generation_status.join(', ')}`)
    }
  }

  // Validate field types
  if (updates.read_time_minutes !== undefined) {
    const rt = updates.read_time_minutes as number
    if (typeof rt !== 'number' || rt < 1 || rt > 30) {
      errors.push('read_time_minutes must be a number between 1 and 30')
    }
  }

  if (updates.tags !== undefined && !Array.isArray(updates.tags)) {
    errors.push('tags must be an array of strings')
  }

  if (updates.frameworks_applicable !== undefined && !Array.isArray(updates.frameworks_applicable)) {
    errors.push('frameworks_applicable must be an array of strings')
  }

  if (updates.mental_model !== undefined && typeof updates.mental_model !== 'object') {
    errors.push('mental_model must be an object with flow, intro, steps, disclaimer')
  }

  if (updates.answer_approach !== undefined && !Array.isArray(updates.answer_approach)) {
    errors.push('answer_approach must be an array of approach parts')
  }

  return { valid: errors.length === 0, errors, warnings }
}

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'PATCH' && req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 405 }
    )
  }

  try {
    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request body
    const payload: UpdatePayload = await req.json()
    const { caseId, updates, bulk = false, caseIds, filter, options = {} } = payload

    // Basic validation
    if (!caseId && !bulk) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Either caseId (for single case) or bulk=true (for bulk operation) is required',
          usage: {
            singleCase: {
              caseId: 'UUID (required)',
              updates: '{ field: value, ... } (required)',
            },
            bulkMode: {
              bulk: 'true (required)',
              updates: '{ field: value, ... } (required)',
              caseIds: 'UUID[] (optional - all cases if not provided)',
              filter: {
                questionType: 'string',
                difficulty: 'beginner|intermediate|advanced',
                industry: 'string',
                beforeDate: 'ISO date string',
                afterDate: 'ISO date string',
              },
            },
            validFields: {
              content: VALID_FIELDS.content,
              metadata: VALID_FIELDS.metadata,
              visuals: VALID_FIELDS.visuals,
            },
            validEnums: VALID_ENUMS,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    if (!updates || Object.keys(updates).length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'updates object is required and must not be empty' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Validate the updates object
    const validation = validateUpdates(updates)
    if (!validation.valid) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validation failed',
          validationErrors: validation.errors,
          warnings: validation.warnings,
          validEnums: VALID_ENUMS,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Validate UUID if single mode
    if (caseId && !isValidUUID(caseId)) {
      return new Response(
        JSON.stringify({ success: false, error: 'caseId must be a valid UUID' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Validate caseIds if provided
    if (caseIds) {
      const invalidIds = caseIds.filter(id => !isValidUUID(id))
      if (invalidIds.length > 0) {
        return new Response(
          JSON.stringify({ success: false, error: `Invalid UUIDs: ${invalidIds.join(', ')}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }
    }

    const {
      updateType = 'content',
      changeReason = '',
      updatedBy = 'api',
      skipVersioning = false,
    } = options

    // Handle bulk mode
    if (bulk) {
      return await handleBulkUpdate(supabase, {
        updates,
        caseIds,
        filter,
        updateType,
        changeReason,
        updatedBy,
        skipVersioning,
        warnings: validation.warnings,
      })
    }

    // Handle single case mode
    return await handleSingleUpdate(supabase, {
      caseId: caseId!,
      updates,
      updateType,
      changeReason,
      updatedBy,
      skipVersioning,
      warnings: validation.warnings,
    })

  } catch (err) {
    console.error('Update error:', err)
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

/**
 * Handle single case update
 */
async function handleSingleUpdate(
  supabase: ReturnType<typeof createClient>,
  options: {
    caseId: string
    updates: Record<string, unknown>
    updateType: string
    changeReason: string
    updatedBy: string
    skipVersioning: boolean
    warnings: string[]
  }
) {
  const { caseId, updates, updateType, changeReason, updatedBy, skipVersioning, warnings } = options

  // Fetch current case study
  const { data: currentCase, error: fetchError } = await supabase
    .from('case_studies')
    .select('*')
    .eq('id', caseId)
    .is('deleted_at', null)
    .single()

  if (fetchError || !currentCase) {
    return new Response(
      JSON.stringify({ success: false, error: 'Case study not found or deleted' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
    )
  }

  // Determine changed fields
  const changedFields: string[] = []
  const previousValues: Record<string, unknown> = {}
  const newValues: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(updates)) {
    // Skip system fields
    if (VALID_FIELDS.system.includes(key)) continue

    if (JSON.stringify(currentCase[key]) !== JSON.stringify(value)) {
      changedFields.push(key)
      previousValues[key] = currentCase[key]
      newValues[key] = value
    }
  }

  if (changedFields.length === 0) {
    return new Response(
      JSON.stringify({
        success: true,
        message: 'No changes detected',
        data: currentCase,
        warnings: warnings.length > 0 ? warnings : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }

  // Create version record (unless skipped)
  let versionId = null
  if (!skipVersioning) {
    const { data: vid, error: versionError } = await supabase.rpc('create_case_version', {
      p_case_id: caseId,
      p_change_type: updateType,
      p_changed_fields: changedFields,
      p_change_reason: changeReason || null,
      p_previous_values: previousValues,
      p_new_values: newValues,
      p_created_by: updatedBy,
    })

    if (versionError) {
      console.error('Version creation failed:', versionError)
    } else {
      versionId = vid
    }
  }

  // Apply updates
  const { data: updatedCase, error: updateError } = await supabase
    .from('case_studies')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', caseId)
    .select()
    .single()

  if (updateError) {
    return new Response(
      JSON.stringify({ success: false, error: updateError.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }

  return new Response(
    JSON.stringify({
      success: true,
      data: updatedCase,
      versionId,
      changedFields,
      updateType,
      warnings: warnings.length > 0 ? warnings : undefined,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
  )
}

/**
 * Handle bulk update
 */
async function handleBulkUpdate(
  supabase: ReturnType<typeof createClient>,
  options: {
    updates: Record<string, unknown>
    caseIds?: string[]
    filter?: UpdatePayload['filter']
    updateType: string
    changeReason: string
    updatedBy: string
    skipVersioning: boolean
    warnings: string[]
  }
) {
  const { updates, caseIds, filter, updateType, changeReason, updatedBy, skipVersioning, warnings } = options

  // Build query to get cases
  let query = supabase
    .from('case_studies')
    .select('id, title')
    .is('deleted_at', null)

  // Apply filters
  if (caseIds && caseIds.length > 0) {
    query = query.in('id', caseIds)
  }

  if (filter?.questionType) {
    query = query.eq('question_type', filter.questionType)
  }

  if (filter?.difficulty) {
    query = query.eq('difficulty', filter.difficulty)
  }

  if (filter?.industry) {
    query = query.eq('industry', filter.industry)
  }

  if (filter?.beforeDate) {
    query = query.lt('created_at', filter.beforeDate)
  }

  if (filter?.afterDate) {
    query = query.gt('created_at', filter.afterDate)
  }

  const { data: cases, error: fetchError } = await query.order('created_at', { ascending: false })

  if (fetchError) {
    return new Response(
      JSON.stringify({ success: false, error: fetchError.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }

  if (!cases || cases.length === 0) {
    return new Response(
      JSON.stringify({
        success: true,
        message: 'No cases found matching criteria',
        processed: 0,
        failed: 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }

  // Process updates
  const results = {
    processed: 0,
    failed: 0,
    unchanged: 0,
    successes: [] as string[],
    failures: [] as { id: string; error: string }[],
  }

  for (const caseItem of cases) {
    try {
      // For bulk, we can do a direct update without fetching each case
      // but if versioning is needed, we need to track changes
      if (!skipVersioning) {
        // Fetch current values for versioning
        const { data: currentCase } = await supabase
          .from('case_studies')
          .select('*')
          .eq('id', caseItem.id)
          .single()

        if (currentCase) {
          const changedFields: string[] = []
          const previousValues: Record<string, unknown> = {}
          const newValues: Record<string, unknown> = {}

          for (const [key, value] of Object.entries(updates)) {
            if (VALID_FIELDS.system.includes(key)) continue
            if (JSON.stringify(currentCase[key]) !== JSON.stringify(value)) {
              changedFields.push(key)
              previousValues[key] = currentCase[key]
              newValues[key] = value
            }
          }

          if (changedFields.length === 0) {
            results.unchanged++
            continue
          }

          // Create version
          await supabase.rpc('create_case_version', {
            p_case_id: caseItem.id,
            p_change_type: updateType,
            p_changed_fields: changedFields,
            p_change_reason: changeReason || `Bulk update: ${changedFields.join(', ')}`,
            p_previous_values: previousValues,
            p_new_values: newValues,
            p_created_by: updatedBy,
          })
        }
      }

      // Apply update
      const { error: updateError } = await supabase
        .from('case_studies')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', caseItem.id)

      if (updateError) {
        throw new Error(updateError.message)
      }

      results.processed++
      results.successes.push(caseItem.id)

    } catch (err) {
      results.failed++
      results.failures.push({ id: caseItem.id, error: err.message })
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: 'Bulk update completed',
      totalCases: cases.length,
      processed: results.processed,
      unchanged: results.unchanged,
      failed: results.failed,
      failures: results.failures.length > 0 ? results.failures : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
  )
}