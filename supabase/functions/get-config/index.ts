/**
 * Get Config Edge Function
 *
 * GET /get-config
 *
 * Retrieves configuration values from the configurations table.
 * Supports fetching single config by key or all configs by type.
 * Returns valid config keys on error for guidance.
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

const VALID_CONFIG_TYPES = ['prompt_section', 'system', 'threshold', 'feature_flag']

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 405 }
    )
  }

  try {
    // Create Supabase client (anon key is fine for reading public configs)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Parse query parameters or body
    let configKey: string | null = null
    let configType: string | null = null
    let includeInactive = false

    if (req.method === 'GET') {
      const url = new URL(req.url)
      configKey = url.searchParams.get('key')
      configType = url.searchParams.get('type')
      includeInactive = url.searchParams.get('includeInactive') === 'true'
    } else {
      const body = await req.json()
      configKey = body.key || null
      configType = body.type || null
      includeInactive = body.includeInactive || false
    }

    // Fetch single config by key
    if (configKey) {
      // Validate the config key
      if (!ALL_VALID_CONFIG_KEYS.includes(configKey)) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Invalid config key '${configKey}'`,
            validConfigKeys: {
              promptSections: VALID_PROMPT_SECTIONS,
              systemConfigs: VALID_SYSTEM_CONFIGS,
            },
            usage: {
              byKey: 'GET /get-config?key=prompt_mental_models',
              byType: 'GET /get-config?type=prompt_section',
              all: 'GET /get-config',
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      let query = supabase
        .from('configurations')
        .select('*')
        .eq('config_key', configKey)

      if (!includeInactive) {
        query = query.eq('is_active', true)
      }

      const { data, error } = await query.single()

      if (error || !data) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Config "${configKey}" not found`,
            validConfigKeys: {
              promptSections: VALID_PROMPT_SECTIONS,
              systemConfigs: VALID_SYSTEM_CONFIGS,
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        )
      }

      return new Response(
        JSON.stringify({
          success: true,
          data,
          value: data.config_value,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Fetch all configs by type
    if (configType) {
      // Validate the config type
      if (!VALID_CONFIG_TYPES.includes(configType)) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Invalid config type '${configType}'`,
            validConfigTypes: VALID_CONFIG_TYPES,
            usage: {
              byKey: 'GET /get-config?key=prompt_mental_models',
              byType: 'GET /get-config?type=prompt_section',
              all: 'GET /get-config',
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      let query = supabase
        .from('configurations')
        .select('*')
        .eq('config_type', configType)
        .order('display_order', { ascending: true })

      if (!includeInactive) {
        query = query.eq('is_active', true)
      }

      const { data, error } = await query

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
      }

      return new Response(
        JSON.stringify({
          success: true,
          data,
          count: data.length,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // No key or type specified - return all active configs grouped by type
    let query = supabase
      .from('configurations')
      .select('*')
      .order('config_type', { ascending: true })
      .order('display_order', { ascending: true })

    if (!includeInactive) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query

    if (error) {
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Group by type
    const grouped: Record<string, typeof data> = {}
    for (const config of data || []) {
      const type = config.config_type
      if (!grouped[type]) grouped[type] = []
      grouped[type].push(config)
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: grouped,
        totalCount: data?.length || 0,
        types: Object.keys(grouped),
        validConfigKeys: {
          promptSections: VALID_PROMPT_SECTIONS,
          systemConfigs: VALID_SYSTEM_CONFIGS,
        },
        validConfigTypes: VALID_CONFIG_TYPES,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (err) {
    console.error('Get config error:', err)
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})