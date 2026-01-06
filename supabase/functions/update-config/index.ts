/**
 * Update Config Edge Function
 *
 * PATCH /update-config
 *
 * Updates configuration values in the configurations table.
 * Supports single config or multiple configs update.
 * Optionally propagates changes to all existing case studies.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Valid config keys for prompt sections
const VALID_PROMPT_SECTIONS = [
  'prompt_system_intro',
  'prompt_output_schema',
  'prompt_question_types',
  'prompt_mental_models',
  'prompt_answer_structure',
  'prompt_evaluation_criteria',
  'prompt_image_generation',
  'prompt_source_customization',
]

// Valid config keys for system configs
const VALID_SYSTEM_CONFIGS = [
  'similarity_threshold',
  'company_cooldown_days',
  'buffer_target_days',
  'max_generation_per_run',
  'groq_model',
  'groq_max_tokens',
  'chart_color_palettes',
  'version_retention_count',
]

const ALL_VALID_CONFIG_KEYS = [...VALID_PROMPT_SECTIONS, ...VALID_SYSTEM_CONFIGS]

interface SingleConfigUpdate {
  configKey: string
  configValue: Record<string, unknown>
  description?: string
}

interface UpdateConfigPayload {
  // Single config mode (backwards compatible)
  configKey?: string
  configValue?: Record<string, unknown>
  description?: string

  // Multiple configs mode
  configs?: SingleConfigUpdate[]

  // Common options
  updatedBy?: string

  // Propagation options
  propagate?: boolean  // If true, regenerate all case studies with new config
  propagateOptions?: {
    regenerateImages?: boolean
    updateMetadataOnly?: boolean
  }
}

interface ValidationResult {
  valid: boolean
  errors: string[]
  invalidKeys: string[]
}

function validateConfigKey(key: string): { valid: boolean; error?: string } {
  if (!key || typeof key !== 'string') {
    return { valid: false, error: 'configKey must be a non-empty string' }
  }

  if (!ALL_VALID_CONFIG_KEYS.includes(key)) {
    return {
      valid: false,
      error: `Invalid configKey '${key}'. Valid keys are: ${ALL_VALID_CONFIG_KEYS.join(', ')}`
    }
  }

  return { valid: true }
}

function validatePayload(payload: UpdateConfigPayload): ValidationResult {
  const errors: string[] = []
  const invalidKeys: string[] = []

  // Must have either single config or multiple configs
  const hasSingle = payload.configKey && payload.configValue
  const hasMultiple = payload.configs && Array.isArray(payload.configs) && payload.configs.length > 0

  if (!hasSingle && !hasMultiple) {
    errors.push('Either (configKey + configValue) or configs array is required')
  }

  // Validate single config mode
  if (hasSingle) {
    const keyValidation = validateConfigKey(payload.configKey!)
    if (!keyValidation.valid) {
      errors.push(keyValidation.error!)
      invalidKeys.push(payload.configKey!)
    }

    if (typeof payload.configValue !== 'object' || payload.configValue === null) {
      errors.push('configValue must be a JSON object')
    }
  }

  // Validate multiple configs mode
  if (hasMultiple) {
    for (let i = 0; i < payload.configs!.length; i++) {
      const config = payload.configs![i]

      if (!config.configKey) {
        errors.push(`configs[${i}]: configKey is required`)
      } else {
        const keyValidation = validateConfigKey(config.configKey)
        if (!keyValidation.valid) {
          errors.push(`configs[${i}]: ${keyValidation.error}`)
          invalidKeys.push(config.configKey)
        }
      }

      if (!config.configValue || typeof config.configValue !== 'object') {
        errors.push(`configs[${i}]: configValue must be a JSON object`)
      }
    }
  }

  return { valid: errors.length === 0, errors, invalidKeys }
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
    const payload: UpdateConfigPayload = await req.json()

    // Validate payload
    const validation = validatePayload(payload)
    if (!validation.valid) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validation failed',
          validationErrors: validation.errors,
          invalidKeys: validation.invalidKeys,
          validConfigKeys: {
            promptSections: VALID_PROMPT_SECTIONS,
            systemConfigs: VALID_SYSTEM_CONFIGS,
          },
          usage: {
            singleConfig: {
              configKey: 'string (required)',
              configValue: '{ content: "..." } (required)',
              description: 'string (optional)',
            },
            multipleConfigs: {
              configs: '[{ configKey, configValue, description? }, ...]',
            },
            propagation: {
              propagate: 'boolean - regenerate all case studies with new config',
              propagateOptions: {
                regenerateImages: 'boolean - also regenerate images',
                updateMetadataOnly: 'boolean - only update config hash',
              },
            },
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const { updatedBy = 'api', propagate = false, propagateOptions } = payload

    // Determine if single or multiple mode
    const configsToUpdate: SingleConfigUpdate[] = payload.configs
      ? payload.configs
      : [{ configKey: payload.configKey!, configValue: payload.configValue!, description: payload.description }]

    // Process each config update
    const results: {
      updated: Array<{ key: string; previousVersion: number; newVersion: number }>
      failed: Array<{ key: string; error: string }>
    } = { updated: [], failed: [] }

    for (const config of configsToUpdate) {
      try {
        // Fetch current config to get version
        const { data: currentConfig, error: fetchError } = await supabase
          .from('configurations')
          .select('*')
          .eq('config_key', config.configKey)
          .single()

        if (fetchError || !currentConfig) {
          results.failed.push({ key: config.configKey, error: `Config "${config.configKey}" not found` })
          continue
        }

        // Build update object
        const updateData: Record<string, unknown> = {
          config_value: config.configValue,
          version: currentConfig.version + 1,
          updated_at: new Date().toISOString(),
        }

        if (config.description) {
          updateData.description = config.description
        }

        // Apply update
        const { data: updatedConfig, error: updateError } = await supabase
          .from('configurations')
          .update(updateData)
          .eq('config_key', config.configKey)
          .select()
          .single()

        if (updateError) {
          results.failed.push({ key: config.configKey, error: updateError.message })
        } else {
          results.updated.push({
            key: config.configKey,
            previousVersion: currentConfig.version,
            newVersion: updatedConfig.version,
          })
        }

      } catch (err) {
        results.failed.push({ key: config.configKey, error: err.message })
      }
    }

    // Handle propagation if requested
    let propagationResult = null
    if (propagate && results.updated.length > 0) {
      propagationResult = await handlePropagation(supabase, {
        updatedConfigs: results.updated,
        updatedBy,
        options: propagateOptions,
      })
    }

    // Determine overall success
    const allSucceeded = results.failed.length === 0
    const someSucceeded = results.updated.length > 0

    return new Response(
      JSON.stringify({
        success: someSucceeded,
        message: allSucceeded
          ? `Successfully updated ${results.updated.length} config(s)`
          : `Updated ${results.updated.length}, failed ${results.failed.length}`,
        updated: results.updated,
        failed: results.failed.length > 0 ? results.failed : undefined,
        propagation: propagationResult,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: allSucceeded ? 200 : (someSucceeded ? 207 : 500),
      }
    )

  } catch (err) {
    console.error('Update config error:', err)
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

/**
 * Handle propagation of config changes to case studies
 * Uses efficient single bulk update instead of looping
 */
async function handlePropagation(
  supabase: ReturnType<typeof createClient>,
  options: {
    updatedConfigs: Array<{ key: string; previousVersion: number; newVersion: number }>
    updatedBy: string
    options?: UpdateConfigPayload['propagateOptions']
  }
): Promise<{
  logId: string | null
  status: string
  totalCases: number
  processed: number
  failed: number
}> {
  const { updatedConfigs, updatedBy, options: propOptions } = options

  // Get current prompt hash
  const { data: hashData } = await supabase.rpc('get_prompt_version_hash')
  const newConfigHash = hashData || 'unknown'

  // Count all case studies that need updating
  const { count, error: countError } = await supabase
    .from('case_studies')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)

  if (countError || count === null) {
    return {
      logId: null,
      status: 'failed',
      totalCases: 0,
      processed: 0,
      failed: 0,
    }
  }

  // Create propagation log
  const { data: logId } = await supabase.rpc('create_propagation_log', {
    p_config_key: updatedConfigs.map(c => c.key).join(','),
    p_previous_version: updatedConfigs[0]?.previousVersion || null,
    p_new_version: updatedConfigs[0]?.newVersion || null,
    p_propagation_type: 'prompt_change',
    p_total_cases: count,
    p_created_by: updatedBy,
  })

  // Update log to in_progress
  await supabase.rpc('update_propagation_progress', {
    p_log_id: logId,
    p_processed: 0,
    p_failed: 0,
    p_status: 'in_progress',
  })

  // Build update object
  const updateData: Record<string, unknown> = {
    config_version_hash: newConfigHash,
    updated_at: new Date().toISOString(),
  }

  // If not metadata only, mark images for regeneration
  if (!propOptions?.updateMetadataOnly) {
    updateData.image_generation_status = 'pending'
  }

  // EFFICIENT: Single bulk update for ALL cases at once
  const { error: updateError, count: updatedCount } = await supabase
    .from('case_studies')
    .update(updateData)
    .is('deleted_at', null)
    .select('id', { count: 'exact', head: true })

  const processed = updateError ? 0 : (updatedCount ?? count)
  const failed = updateError ? count : 0

  // Final progress update
  await supabase.rpc('update_propagation_progress', {
    p_log_id: logId,
    p_processed: processed,
    p_failed: failed,
    p_status: updateError ? 'failed' : 'completed',
    p_error: updateError?.message || null,
  })

  return {
    logId,
    status: updateError ? 'failed' : 'completed',
    totalCases: count,
    processed,
    failed,
  }
}