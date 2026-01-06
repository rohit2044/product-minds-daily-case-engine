/**
 * Regenerate Visuals Edge Function
 *
 * POST /regenerate-visuals
 *
 * Regenerates images for case studies using image prompts.
 * Supports both single case and bulk operations.
 *
 * Modes:
 * 1. Single case with specific imagePrompt
 * 2. Single case using existing image_prompt from DB
 * 3. Bulk: regenerate images for all/filtered case studies
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RegeneratePayload {
  // Single case mode
  caseId?: string
  imagePrompt?: string

  // Bulk mode
  bulk?: boolean
  caseIds?: string[]  // Specific case IDs to update, or empty for all
  filter?: {
    hasNoImage?: boolean      // Only cases without images
    beforeDate?: string       // Cases created before this date
    afterDate?: string        // Cases created after this date
    questionType?: string     // Filter by question type
  }

  // Common options
  regeneratedBy?: string
  changeReason?: string
}

interface ValidationResult {
  valid: boolean
  errors: string[]
}

// QuickChart.io API for chart generation
const QUICKCHART_URL = 'https://quickchart.io/chart'

// Validate the payload
function validatePayload(payload: RegeneratePayload): ValidationResult {
  const errors: string[] = []

  // Must have either caseId (single mode) or bulk=true (bulk mode)
  if (!payload.caseId && !payload.bulk) {
    errors.push('Either caseId (for single case) or bulk=true (for bulk operation) is required')
  }

  // In single mode, caseId must be a valid UUID format
  if (payload.caseId && !isValidUUID(payload.caseId)) {
    errors.push('caseId must be a valid UUID')
  }

  // In bulk mode with caseIds, validate each UUID
  if (payload.bulk && payload.caseIds) {
    const invalidIds = payload.caseIds.filter(id => !isValidUUID(id))
    if (invalidIds.length > 0) {
      errors.push(`Invalid UUIDs in caseIds: ${invalidIds.join(', ')}`)
    }
  }

  // If imagePrompt provided, must be non-empty string
  if (payload.imagePrompt !== undefined && typeof payload.imagePrompt !== 'string') {
    errors.push('imagePrompt must be a string')
  }

  if (payload.imagePrompt && payload.imagePrompt.trim().length < 10) {
    errors.push('imagePrompt must be at least 10 characters')
  }

  return { valid: errors.length === 0, errors }
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

  if (req.method !== 'POST') {
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
    const payload: RegeneratePayload = await req.json()

    // Validate payload
    const validation = validatePayload(payload)
    if (!validation.valid) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validation failed',
          validationErrors: validation.errors,
          usage: {
            singleCase: {
              caseId: 'UUID (required)',
              imagePrompt: 'string (optional - uses existing if not provided)',
            },
            bulkMode: {
              bulk: 'true (required)',
              caseIds: 'UUID[] (optional - all cases if not provided)',
              filter: {
                hasNoImage: 'boolean',
                beforeDate: 'ISO date string',
                afterDate: 'ISO date string',
                questionType: 'string',
              },
            },
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const {
      caseId,
      imagePrompt,
      bulk = false,
      caseIds,
      filter,
      regeneratedBy = 'api',
      changeReason = 'Image regeneration requested',
    } = payload

    // Handle bulk mode
    if (bulk) {
      return await handleBulkRegeneration(supabase, {
        caseIds,
        filter,
        imagePrompt,
        regeneratedBy,
        changeReason,
      })
    }

    // Handle single case mode
    return await handleSingleCaseRegeneration(supabase, {
      caseId: caseId!,
      imagePrompt,
      regeneratedBy,
      changeReason,
    })

  } catch (err) {
    console.error('Regenerate visuals error:', err)
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

/**
 * Handle single case image regeneration
 */
async function handleSingleCaseRegeneration(
  supabase: ReturnType<typeof createClient>,
  options: {
    caseId: string
    imagePrompt?: string
    regeneratedBy: string
    changeReason: string
  }
) {
  const { caseId, imagePrompt, regeneratedBy, changeReason } = options

  // Fetch current case study
  const { data: currentCase, error: fetchError } = await supabase
    .from('case_studies')
    .select('id, title, charts, image_prompt')
    .eq('id', caseId)
    .is('deleted_at', null)
    .single()

  if (fetchError || !currentCase) {
    return new Response(
      JSON.stringify({ success: false, error: 'Case study not found or deleted' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
    )
  }

  // Use provided prompt or existing prompt
  const promptToUse = imagePrompt || currentCase.image_prompt

  if (!promptToUse) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'No image prompt available. Provide imagePrompt parameter or ensure case has image_prompt field.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }

  // Delete existing images from storage
  const { data: existingFiles } = await supabase.storage
    .from('case-study-charts')
    .list(caseId)

  if (existingFiles && existingFiles.length > 0) {
    const filesToDelete = existingFiles.map((f) => `${caseId}/${f.name}`)
    const { error: deleteError } = await supabase.storage
      .from('case-study-charts')
      .remove(filesToDelete)

    if (deleteError) {
      console.warn('Failed to delete existing files:', deleteError)
    }
  }

  // Generate new image from prompt
  const generatedChart = await generateImageFromPrompt(supabase, caseId, promptToUse, currentCase.title)

  // Create version record
  const { error: versionError } = await supabase.rpc('create_case_version', {
    p_case_id: caseId,
    p_change_type: 'visuals',
    p_changed_fields: ['charts', 'image_prompt', 'image_generation_status'],
    p_change_reason: changeReason,
    p_previous_values: {
      charts: currentCase.charts,
      image_prompt: currentCase.image_prompt,
    },
    p_new_values: {
      charts: generatedChart ? [generatedChart] : [],
      image_prompt: promptToUse,
    },
    p_created_by: regeneratedBy,
  })

  if (versionError) {
    console.warn('Version creation failed:', versionError)
  }

  // Update case study
  const { data: updatedCase, error: updateError } = await supabase
    .from('case_studies')
    .update({
      charts: generatedChart ? [generatedChart] : [],
      image_prompt: promptToUse,
      image_generation_status: generatedChart ? 'completed' : 'failed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', caseId)
    .select('id, title, charts, image_prompt, image_generation_status')
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
      imageGenerated: !!generatedChart,
      regeneratedBy,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
  )
}

/**
 * Handle bulk image regeneration
 */
async function handleBulkRegeneration(
  supabase: ReturnType<typeof createClient>,
  options: {
    caseIds?: string[]
    filter?: RegeneratePayload['filter']
    imagePrompt?: string
    regeneratedBy: string
    changeReason: string
  }
) {
  const { caseIds, filter, imagePrompt, regeneratedBy, changeReason } = options

  // Build query to get cases
  let query = supabase
    .from('case_studies')
    .select('id, title, image_prompt, charts')
    .is('deleted_at', null)

  // Apply filters
  if (caseIds && caseIds.length > 0) {
    query = query.in('id', caseIds)
  }

  if (filter?.hasNoImage) {
    query = query.or('image_prompt.is.null,charts.is.null')
  }

  if (filter?.beforeDate) {
    query = query.lt('created_at', filter.beforeDate)
  }

  if (filter?.afterDate) {
    query = query.gt('created_at', filter.afterDate)
  }

  if (filter?.questionType) {
    query = query.eq('question_type', filter.questionType)
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

  // Create propagation log
  const { data: logId } = await supabase.rpc('create_propagation_log', {
    p_config_key: 'bulk_image_regeneration',
    p_previous_version: null,
    p_new_version: null,
    p_propagation_type: 'bulk_regenerate',
    p_total_cases: cases.length,
    p_created_by: regeneratedBy,
  })

  // Update log to in_progress
  await supabase.rpc('update_propagation_progress', {
    p_log_id: logId,
    p_processed: 0,
    p_failed: 0,
    p_status: 'in_progress',
  })

  // Process each case
  const results = {
    processed: 0,
    failed: 0,
    successes: [] as string[],
    failures: [] as { id: string; error: string }[],
  }

  for (const caseItem of cases) {
    try {
      // Use provided prompt, or case's existing prompt
      const promptToUse = imagePrompt || caseItem.image_prompt

      if (!promptToUse) {
        results.failures.push({ id: caseItem.id, error: 'No image prompt available' })
        results.failed++
        continue
      }

      // Delete existing images
      const { data: existingFiles } = await supabase.storage
        .from('case-study-charts')
        .list(caseItem.id)

      if (existingFiles && existingFiles.length > 0) {
        await supabase.storage
          .from('case-study-charts')
          .remove(existingFiles.map((f) => `${caseItem.id}/${f.name}`))
      }

      // Generate new image
      const generatedChart = await generateImageFromPrompt(
        supabase,
        caseItem.id,
        promptToUse,
        caseItem.title
      )

      // Update case
      await supabase
        .from('case_studies')
        .update({
          charts: generatedChart ? [generatedChart] : [],
          image_prompt: promptToUse,
          image_generation_status: generatedChart ? 'completed' : 'failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', caseItem.id)

      results.processed++
      results.successes.push(caseItem.id)

    } catch (err) {
      results.failed++
      results.failures.push({ id: caseItem.id, error: err.message })
    }

    // Update progress every 10 cases
    if ((results.processed + results.failed) % 10 === 0) {
      await supabase.rpc('update_propagation_progress', {
        p_log_id: logId,
        p_processed: results.processed,
        p_failed: results.failed,
      })
    }
  }

  // Final progress update
  await supabase.rpc('update_propagation_progress', {
    p_log_id: logId,
    p_processed: results.processed,
    p_failed: results.failed,
    p_status: 'completed',
  })

  return new Response(
    JSON.stringify({
      success: true,
      message: `Bulk regeneration completed`,
      totalCases: cases.length,
      processed: results.processed,
      failed: results.failed,
      propagationLogId: logId,
      failures: results.failures.length > 0 ? results.failures : undefined,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
  )
}

/**
 * Generate image from prompt using SVG (placeholder for actual image generation)
 * In production, this could integrate with DALL-E, Stable Diffusion, etc.
 */
async function generateImageFromPrompt(
  supabase: ReturnType<typeof createClient>,
  caseId: string,
  imagePrompt: string,
  title: string
): Promise<{
  id: string
  type: string
  title: string
  caption: string
  url: string
  position: string
} | null> {
  try {
    // Generate a themed SVG based on the prompt
    const svgContent = generateThemedSVG(imagePrompt, title)
    const svgBlob = new Blob([svgContent], { type: 'image/svg+xml' })
    const svgBuffer = await svgBlob.arrayBuffer()

    const fileName = `image-${Date.now()}.svg`
    const { error: uploadError } = await supabase.storage
      .from('case-study-charts')
      .upload(`${caseId}/${fileName}`, svgBuffer, {
        contentType: 'image/svg+xml',
        upsert: true,
      })

    if (uploadError) {
      throw uploadError
    }

    const { data: urlData } = supabase.storage
      .from('case-study-charts')
      .getPublicUrl(`${caseId}/${fileName}`)

    return {
      id: `image-1`,
      type: 'illustration',
      title: title,
      caption: imagePrompt.substring(0, 100),
      url: urlData.publicUrl,
      position: 'after_story',
    }

  } catch (error) {
    console.error(`Failed to generate image for case ${caseId}:`, error)
    return null
  }
}

/**
 * Generate a themed SVG based on the image prompt
 */
function generateThemedSVG(imagePrompt: string, title: string): string {
  const promptLower = imagePrompt.toLowerCase()

  // Determine theme based on prompt keywords
  let primaryColor = '#4F46E5'
  let secondaryColor = '#818CF8'
  let bgColor = '#EEF2FF'

  if (promptLower.includes('growth') || promptLower.includes('increase') || promptLower.includes('success')) {
    primaryColor = '#10B981'
    secondaryColor = '#34D399'
    bgColor = '#ECFDF5'
  } else if (promptLower.includes('decision') || promptLower.includes('choice') || promptLower.includes('path')) {
    primaryColor = '#F59E0B'
    secondaryColor = '#FBBF24'
    bgColor = '#FFFBEB'
  } else if (promptLower.includes('data') || promptLower.includes('metric') || promptLower.includes('chart')) {
    primaryColor = '#3B82F6'
    secondaryColor = '#60A5FA'
    bgColor = '#EFF6FF'
  } else if (promptLower.includes('risk') || promptLower.includes('warning') || promptLower.includes('challenge')) {
    primaryColor = '#EF4444'
    secondaryColor = '#F87171'
    bgColor = '#FEF2F2'
  }

  const hash = simpleHash(title + imagePrompt)

  // Generate abstract shapes based on hash
  const shapes: string[] = []

  for (let i = 0; i < 6; i++) {
    const x = 50 + (hash * (i + 1) * 7) % 500
    const y = 50 + (hash * (i + 2) * 11) % 300
    const size = 20 + (hash * (i + 3) * 13) % 60
    const opacity = 0.3 + ((hash * (i + 4)) % 40) / 100
    const color = i % 2 === 0 ? primaryColor : secondaryColor

    if (i % 3 === 0) {
      shapes.push(`<circle cx="${x}" cy="${y}" r="${size}" fill="${color}" opacity="${opacity}"/>`)
    } else if (i % 3 === 1) {
      shapes.push(`<rect x="${x - size/2}" y="${y - size/2}" width="${size}" height="${size}" fill="${color}" opacity="${opacity}" rx="8"/>`)
    } else {
      const points = `${x},${y - size} ${x + size * 0.866},${y + size/2} ${x - size * 0.866},${y + size/2}`
      shapes.push(`<polygon points="${points}" fill="${color}" opacity="${opacity}"/>`)
    }
  }

  // Add connecting lines
  for (let i = 0; i < 3; i++) {
    const x1 = 50 + (hash * (i + 10) * 17) % 500
    const y1 = 50 + (hash * (i + 11) * 19) % 300
    const x2 = 50 + (hash * (i + 12) * 23) % 500
    const y2 = 50 + (hash * (i + 13) * 29) % 300
    shapes.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${secondaryColor}" stroke-width="2" opacity="0.3"/>`)
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${bgColor}"/>
      <stop offset="100%" style="stop-color:white"/>
    </linearGradient>
  </defs>
  <rect width="600" height="400" fill="url(#bgGrad)"/>
  ${shapes.join('\n  ')}
  <text x="300" y="380" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" fill="#6B7280">${title.substring(0, 50)}${title.length > 50 ? '...' : ''}</text>
</svg>`
}

function simpleHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}