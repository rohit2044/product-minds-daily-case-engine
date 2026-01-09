/**
 * Regenerate Visuals Edge Function
 *
 * POST /regenerate-visuals
 *
 * Regenerates images for case studies using intelligent chart generation with Groq LLM.
 * Creates contextually relevant charts based on case study content.
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
  caseIds?: string[]
  filter?: {
    hasNoImage?: boolean
    beforeDate?: string
    afterDate?: string
    questionType?: string
  }

  // Common options
  regeneratedBy?: string
  changeReason?: string
  useIntelligentGeneration?: boolean // Default true
}

interface ChartSpec {
  chartType: string
  title: string
  caption?: string
  data?: Array<{ label: string; value: number }>
  comparison?: {
    before: { label: string; value: number }
    after: { label: string; value: number }
  }
  metrics?: Array<{ label: string; value: string; trend?: string }>
  colorScheme?: string
}

interface GeneratedChart {
  id: string
  type: string
  title: string
  caption: string
  url: string
  position: string
  metadata?: Record<string, unknown>
}

// Color schemes
const COLOR_SCHEMES: Record<string, string[]> = {
  primary: ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'],
  growth: ['#10B981', '#34D399', '#6EE7B7', '#A7F3D0'],
  decline: ['#EF4444', '#F87171', '#FCA5A5', '#FECACA'],
  comparison: ['#3B82F6', '#F59E0B', '#10B981', '#EF4444'],
  metrics: ['#6366F1', '#8B5CF6', '#A78BFA', '#C4B5FD'],
  neutral: ['#6B7280', '#9CA3AF', '#D1D5DB', '#E5E7EB'],
}

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}

function validatePayload(payload: RegeneratePayload): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!payload.caseId && !payload.bulk) {
    errors.push('Either caseId (for single case) or bulk=true (for bulk operation) is required')
  }

  if (payload.caseId && !isValidUUID(payload.caseId)) {
    errors.push('caseId must be a valid UUID')
  }

  if (payload.bulk && payload.caseIds) {
    const invalidIds = payload.caseIds.filter(id => !isValidUUID(id))
    if (invalidIds.length > 0) {
      errors.push(`Invalid UUIDs in caseIds: ${invalidIds.join(', ')}`)
    }
  }

  if (payload.imagePrompt !== undefined && typeof payload.imagePrompt !== 'string') {
    errors.push('imagePrompt must be a string')
  }

  return { valid: errors.length === 0, errors }
}

Deno.serve(async (req) => {
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const groqApiKey = Deno.env.get('GROQ_API_KEY')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const payload: RegeneratePayload = await req.json()

    const validation = validatePayload(payload)
    if (!validation.valid) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validation failed',
          validationErrors: validation.errors,
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
      useIntelligentGeneration = true,
    } = payload

    if (bulk) {
      return await handleBulkRegeneration(supabase, {
        caseIds,
        filter,
        imagePrompt,
        regeneratedBy,
        changeReason,
        useIntelligentGeneration,
        groqApiKey,
      })
    }

    return await handleSingleCaseRegeneration(supabase, {
      caseId: caseId!,
      imagePrompt,
      regeneratedBy,
      changeReason,
      useIntelligentGeneration,
      groqApiKey,
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
    useIntelligentGeneration: boolean
    groqApiKey?: string
  }
) {
  const { caseId, imagePrompt, regeneratedBy, changeReason, useIntelligentGeneration, groqApiKey } = options

  const { data: currentCase, error: fetchError } = await supabase
    .from('case_studies')
    .select('id, title, company_name, industry, question_type, the_question, what_happened, mental_model, summary, tags, charts, image_prompt')
    .eq('id', caseId)
    .is('deleted_at', null)
    .single()

  if (fetchError || !currentCase) {
    return new Response(
      JSON.stringify({ success: false, error: 'Case study not found or deleted' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
    )
  }

  const promptToUse = imagePrompt || currentCase.image_prompt

  // Delete existing images from storage
  const { data: existingFiles } = await supabase.storage
    .from('case-study-charts')
    .list(caseId)

  if (existingFiles && existingFiles.length > 0) {
    const filesToDelete = existingFiles.map((f) => `${caseId}/${f.name}`)
    await supabase.storage.from('case-study-charts').remove(filesToDelete)
  }

  // Generate new chart
  let generatedChart: GeneratedChart | null = null

  if (useIntelligentGeneration && groqApiKey) {
    generatedChart = await generateIntelligentChart(supabase, caseId, currentCase, groqApiKey)
  }

  // Fallback to basic SVG if intelligent generation fails or is disabled
  if (!generatedChart) {
    generatedChart = await generateFallbackChart(supabase, caseId, currentCase, promptToUse)
  }

  // Create version record
  try {
    await supabase.rpc('create_case_version', {
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
  } catch (versionError) {
    console.warn('Version creation failed:', versionError)
  }

  // Update case study
  const { data: updatedCase, error: updateError } = await supabase
    .from('case_studies')
    .update({
      charts: generatedChart ? [generatedChart] : [],
      image_prompt: promptToUse || currentCase.image_prompt,
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
      chartType: generatedChart?.type,
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
    useIntelligentGeneration: boolean
    groqApiKey?: string
  }
) {
  const { caseIds, filter, imagePrompt, regeneratedBy, changeReason, useIntelligentGeneration, groqApiKey } = options

  let query = supabase
    .from('case_studies')
    .select('id, title, company_name, industry, question_type, the_question, what_happened, mental_model, summary, tags, image_prompt, charts')
    .is('deleted_at', null)

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

  await supabase.rpc('update_propagation_progress', {
    p_log_id: logId,
    p_processed: 0,
    p_failed: 0,
    p_status: 'in_progress',
  })

  const results = {
    processed: 0,
    failed: 0,
    successes: [] as string[],
    failures: [] as { id: string; error: string }[],
  }

  for (const caseItem of cases) {
    try {
      const promptToUse = imagePrompt || caseItem.image_prompt

      // Delete existing images
      const { data: existingFiles } = await supabase.storage
        .from('case-study-charts')
        .list(caseItem.id)

      if (existingFiles && existingFiles.length > 0) {
        await supabase.storage
          .from('case-study-charts')
          .remove(existingFiles.map((f) => `${caseItem.id}/${f.name}`))
      }

      // Generate new chart
      let generatedChart: GeneratedChart | null = null

      if (useIntelligentGeneration && groqApiKey) {
        generatedChart = await generateIntelligentChart(supabase, caseItem.id, caseItem, groqApiKey)
      }

      if (!generatedChart) {
        generatedChart = await generateFallbackChart(supabase, caseItem.id, caseItem, promptToUse)
      }

      // Update case
      await supabase
        .from('case_studies')
        .update({
          charts: generatedChart ? [generatedChart] : [],
          image_prompt: promptToUse || caseItem.image_prompt,
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

    if ((results.processed + results.failed) % 10 === 0) {
      await supabase.rpc('update_propagation_progress', {
        p_log_id: logId,
        p_processed: results.processed,
        p_failed: results.failed,
      })
    }
  }

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
 * Generate intelligent chart using Groq LLM
 */
async function generateIntelligentChart(
  supabase: ReturnType<typeof createClient>,
  caseId: string,
  caseStudy: Record<string, unknown>,
  groqApiKey: string
): Promise<GeneratedChart | null> {
  try {
    console.log(`Generating intelligent chart for case: ${caseStudy.title}`)

    // Generate chart specification using Groq
    const chartSpec = await generateChartSpecification(caseStudy, groqApiKey)

    if (!chartSpec) {
      console.log('Failed to generate chart spec')
      return null
    }

    console.log(`Chart type: ${chartSpec.chartType}, Title: ${chartSpec.title}`)

    // Render the chart as SVG
    const svgContent = renderChartToSVG(chartSpec)

    if (!svgContent) {
      console.log('Failed to render chart')
      return null
    }

    // Upload to storage
    const fileName = `${caseId}/chart-${Date.now()}.svg`
    const svgBlob = new Blob([svgContent], { type: 'image/svg+xml' })
    const svgBuffer = await svgBlob.arrayBuffer()

    const { error: uploadError } = await supabase.storage
      .from('case-study-charts')
      .upload(fileName, svgBuffer, {
        contentType: 'image/svg+xml',
        upsert: true,
      })

    if (uploadError) {
      throw uploadError
    }

    const { data: urlData } = supabase.storage
      .from('case-study-charts')
      .getPublicUrl(fileName)

    return {
      id: `chart-${Date.now()}`,
      type: chartSpec.chartType,
      title: chartSpec.title,
      caption: chartSpec.caption || chartSpec.title,
      url: urlData.publicUrl,
      position: 'after_story',
      metadata: {
        generatedBy: 'intelligent-chart-generator',
        chartType: chartSpec.chartType,
      },
    }

  } catch (error) {
    console.error(`Intelligent chart generation failed:`, error)
    return null
  }
}

/**
 * Generate chart specification using Groq LLM
 */
async function generateChartSpecification(
  caseStudy: Record<string, unknown>,
  groqApiKey: string
): Promise<ChartSpec | null> {
  const context = buildContextFromCaseStudy(caseStudy)

  const systemPrompt = `You are a data visualization expert. Create a meaningful chart specification for a business case study.

RULES:
1. Generate REALISTIC, PLAUSIBLE data
2. Keep labels short (max 15 characters)
3. Use 3-6 data points for clarity

Chart types:
- "bar": Compare categories (revenue, market share)
- "line": Show trends over time
- "pie": Parts of a whole
- "doughnut": Same as pie, modern look
- "comparison": Before/after (2 items only)
- "metrics": KPIs (3-4 metrics)
- "funnel": Progression/conversion

Respond ONLY with valid JSON:
{
  "chartType": "bar|line|pie|doughnut|comparison|metrics|funnel",
  "title": "Chart title (max 50 chars)",
  "caption": "Brief explanation",
  "data": [{"label": "Category", "value": 100}],
  "colorScheme": "primary|growth|decline|comparison|metrics|neutral"
}

For comparison: {"comparison": {"before": {"label": "Before", "value": 40}, "after": {"label": "After", "value": 85}}}
For metrics: {"metrics": [{"label": "Revenue", "value": "$2.4M", "trend": "up"}]}`

  const userPrompt = `Create a chart for this case study:

TITLE: ${caseStudy.title || 'Unknown'}
COMPANY: ${caseStudy.company_name || 'Unknown'}
INDUSTRY: ${caseStudy.industry || 'Technology'}
QUESTION TYPE: ${caseStudy.question_type || 'General'}

CONTEXT:
${context}

IMAGE PROMPT: ${caseStudy.image_prompt || 'Not specified'}`

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1500,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      throw new Error('Empty response from LLM')
    }

    const chartSpec = JSON.parse(content) as ChartSpec

    if (!validateChartSpec(chartSpec)) {
      throw new Error('Invalid chart specification')
    }

    return chartSpec

  } catch (error) {
    console.error(`LLM chart generation error:`, error)
    return null
  }
}

function buildContextFromCaseStudy(caseStudy: Record<string, unknown>): string {
  const parts: string[] = []

  if (caseStudy.what_happened) {
    parts.push(`STORY: ${String(caseStudy.what_happened).substring(0, 500)}`)
  }

  if (caseStudy.the_question) {
    parts.push(`QUESTION: ${caseStudy.the_question}`)
  }

  const summary = caseStudy.summary as Record<string, unknown> | undefined
  if (summary?.approach_summary) {
    parts.push(`APPROACH: ${summary.approach_summary}`)
  }

  const mentalModel = caseStudy.mental_model as Record<string, unknown> | undefined
  if (mentalModel?.intro) {
    parts.push(`FRAMEWORK: ${mentalModel.intro}`)
  }

  const tags = caseStudy.tags as string[] | undefined
  if (tags && tags.length > 0) {
    parts.push(`TAGS: ${tags.join(', ')}`)
  }

  return parts.join('\n\n') || 'No additional context available.'
}

function validateChartSpec(spec: ChartSpec): boolean {
  if (!spec || typeof spec !== 'object') return false
  if (!spec.chartType || !spec.title) return false

  const validTypes = ['bar', 'line', 'pie', 'doughnut', 'comparison', 'metrics', 'funnel']
  if (!validTypes.includes(spec.chartType)) return false

  if (spec.chartType === 'comparison') {
    if (!spec.comparison || !spec.comparison.before || !spec.comparison.after) return false
  } else if (spec.chartType === 'metrics') {
    if (!Array.isArray(spec.metrics) || spec.metrics.length < 2) return false
  } else {
    if (!Array.isArray(spec.data) || spec.data.length < 2) return false
  }

  return true
}

/**
 * Render chart specification to SVG
 */
function renderChartToSVG(spec: ChartSpec): string {
  const colorScheme = COLOR_SCHEMES[spec.colorScheme || 'primary'] || COLOR_SCHEMES.primary

  switch (spec.chartType) {
    case 'bar':
      return renderBarChart(spec, colorScheme)
    case 'line':
      return renderLineChart(spec, colorScheme)
    case 'pie':
    case 'doughnut':
      return renderPieChart(spec, colorScheme, spec.chartType === 'doughnut')
    case 'comparison':
      return renderComparisonChart(spec, colorScheme)
    case 'metrics':
      return renderMetricsChart(spec, colorScheme)
    case 'funnel':
      return renderFunnelChart(spec, colorScheme)
    default:
      return renderBarChart(spec, colorScheme)
  }
}

function renderBarChart(spec: ChartSpec, colors: string[]): string {
  const width = 600
  const height = 400
  const padding = { top: 60, right: 40, bottom: 80, left: 60 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  const data = spec.data || []
  const maxValue = Math.max(...data.map((d) => d.value))
  const barWidth = Math.min(60, (chartWidth / data.length) * 0.7)
  const barGap = (chartWidth - barWidth * data.length) / (data.length + 1)

  let bars = ''
  let labels = ''
  let values = ''

  data.forEach((item, i) => {
    const x = padding.left + barGap + i * (barWidth + barGap)
    const barHeight = (item.value / maxValue) * chartHeight
    const y = padding.top + chartHeight - barHeight
    const color = colors[i % colors.length]

    bars += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="${color}" rx="4"/>`
    values += `<text x="${x + barWidth / 2}" y="${y - 8}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="600" fill="#374151">${formatValue(item.value)}</text>`
    labels += `<text x="${x + barWidth / 2}" y="${height - padding.bottom + 20}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" fill="#6B7280">${truncateText(item.label, 12)}</text>`
  })

  let yAxis = ''
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (i / 4) * chartHeight
    const value = maxValue * (1 - i / 4)
    yAxis += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#E5E7EB" stroke-dasharray="4"/>`
    yAxis += `<text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" font-family="system-ui, sans-serif" font-size="10" fill="#9CA3AF">${formatValue(value)}</text>`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs><linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#F9FAFB"/><stop offset="100%" style="stop-color:#FFFFFF"/></linearGradient></defs>
  <rect width="${width}" height="${height}" fill="url(#bgGrad)" rx="8"/>
  <text x="${width / 2}" y="35" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="600" fill="#111827">${escapeXml(spec.title)}</text>
  ${yAxis}${bars}${values}${labels}
</svg>`
}

function renderLineChart(spec: ChartSpec, colors: string[]): string {
  const width = 600
  const height = 400
  const padding = { top: 60, right: 40, bottom: 80, left: 60 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  const data = spec.data || []
  const maxValue = Math.max(...data.map((d) => d.value))
  const minValue = Math.min(0, ...data.map((d) => d.value))
  const valueRange = maxValue - minValue

  const points = data.map((item, i) => ({
    x: padding.left + (i / (data.length - 1)) * chartWidth,
    y: padding.top + chartHeight - ((item.value - minValue) / valueRange) * chartHeight,
    ...item,
  }))

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`

  let dots = ''
  let labels = ''

  points.forEach((p, i) => {
    dots += `<circle cx="${p.x}" cy="${p.y}" r="5" fill="${colors[0]}" stroke="white" stroke-width="2"/>`
    dots += `<text x="${p.x}" y="${p.y - 12}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" font-weight="500" fill="#374151">${formatValue(p.value)}</text>`

    if (i === 0 || i === data.length - 1 || data.length <= 5) {
      labels += `<text x="${p.x}" y="${height - padding.bottom + 20}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="10" fill="#6B7280">${truncateText(p.label, 10)}</text>`
    }
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#F9FAFB"/><stop offset="100%" style="stop-color:#FFFFFF"/></linearGradient>
    <linearGradient id="areaGrad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:${colors[0]};stop-opacity:0.3"/><stop offset="100%" style="stop-color:${colors[0]};stop-opacity:0.05"/></linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bgGrad)" rx="8"/>
  <text x="${width / 2}" y="35" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="600" fill="#111827">${escapeXml(spec.title)}</text>
  <path d="${areaPath}" fill="url(#areaGrad)"/>
  <path d="${linePath}" fill="none" stroke="${colors[0]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  ${dots}${labels}
</svg>`
}

function renderPieChart(spec: ChartSpec, colors: string[], isDoughnut: boolean): string {
  const width = 600
  const height = 400
  const centerX = width / 2
  const centerY = height / 2 + 10
  const radius = 120
  const innerRadius = isDoughnut ? radius * 0.6 : 0

  const data = spec.data || []
  const total = data.reduce((sum, d) => sum + d.value, 0)

  let startAngle = -Math.PI / 2
  let slices = ''
  let labels = ''
  let legendItems = ''

  data.forEach((item, i) => {
    const sliceAngle = (item.value / total) * 2 * Math.PI
    const endAngle = startAngle + sliceAngle
    const midAngle = startAngle + sliceAngle / 2
    const color = colors[i % colors.length]

    const x1 = centerX + radius * Math.cos(startAngle)
    const y1 = centerY + radius * Math.sin(startAngle)
    const x2 = centerX + radius * Math.cos(endAngle)
    const y2 = centerY + radius * Math.sin(endAngle)
    const largeArc = sliceAngle > Math.PI ? 1 : 0

    let path
    if (isDoughnut) {
      const ix1 = centerX + innerRadius * Math.cos(startAngle)
      const iy1 = centerY + innerRadius * Math.sin(startAngle)
      const ix2 = centerX + innerRadius * Math.cos(endAngle)
      const iy2 = centerY + innerRadius * Math.sin(endAngle)
      path = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix1} ${iy1} Z`
    } else {
      path = `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`
    }

    slices += `<path d="${path}" fill="${color}" stroke="white" stroke-width="2"/>`

    const labelRadius = isDoughnut ? (radius + innerRadius) / 2 : radius * 0.65
    const labelX = centerX + labelRadius * Math.cos(midAngle)
    const labelY = centerY + labelRadius * Math.sin(midAngle)
    const percentage = Math.round((item.value / total) * 100)

    if (percentage >= 8) {
      labels += `<text x="${labelX}" y="${labelY}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="600" fill="white">${percentage}%</text>`
    }

    const legendY = 60 + i * 22
    legendItems += `<rect x="${width - 150}" y="${legendY - 8}" width="12" height="12" fill="${color}" rx="2"/>`
    legendItems += `<text x="${width - 132}" y="${legendY}" font-family="system-ui, sans-serif" font-size="11" fill="#374151">${truncateText(item.label, 15)}</text>`

    startAngle = endAngle
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs><linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#F9FAFB"/><stop offset="100%" style="stop-color:#FFFFFF"/></linearGradient></defs>
  <rect width="${width}" height="${height}" fill="url(#bgGrad)" rx="8"/>
  <text x="${width / 2}" y="35" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="600" fill="#111827">${escapeXml(spec.title)}</text>
  ${slices}${labels}${legendItems}
</svg>`
}

function renderComparisonChart(spec: ChartSpec, colors: string[]): string {
  const width = 600
  const height = 400
  const padding = { top: 80, right: 60, bottom: 60, left: 60 }

  const before = spec.comparison?.before || { label: 'Before', value: 0 }
  const after = spec.comparison?.after || { label: 'After', value: 0 }
  const maxValue = Math.max(before.value, after.value)

  const barWidth = 120
  const gap = 80
  const startX = (width - (barWidth * 2 + gap)) / 2
  const chartHeight = height - padding.top - padding.bottom

  const beforeHeight = (before.value / maxValue) * chartHeight
  const afterHeight = (after.value / maxValue) * chartHeight
  const beforeY = padding.top + chartHeight - beforeHeight
  const afterY = padding.top + chartHeight - afterHeight

  const change = after.value - before.value
  const changePercent = before.value > 0 ? Math.round((change / before.value) * 100) : 0
  const changeColor = change >= 0 ? '#10B981' : '#EF4444'
  const changeSign = change >= 0 ? '+' : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs><linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#F9FAFB"/><stop offset="100%" style="stop-color:#FFFFFF"/></linearGradient></defs>
  <rect width="${width}" height="${height}" fill="url(#bgGrad)" rx="8"/>
  <text x="${width / 2}" y="35" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="600" fill="#111827">${escapeXml(spec.title)}</text>
  <rect x="${startX}" y="${beforeY}" width="${barWidth}" height="${beforeHeight}" fill="${colors[0]}" rx="6"/>
  <text x="${startX + barWidth / 2}" y="${beforeY - 10}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="18" font-weight="700" fill="#374151">${formatValue(before.value)}</text>
  <text x="${startX + barWidth / 2}" y="${height - padding.bottom + 25}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" fill="#6B7280">${before.label}</text>
  <rect x="${startX + barWidth + gap}" y="${afterY}" width="${barWidth}" height="${afterHeight}" fill="${colors[1]}" rx="6"/>
  <text x="${startX + barWidth + gap + barWidth / 2}" y="${afterY - 10}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="18" font-weight="700" fill="#374151">${formatValue(after.value)}</text>
  <text x="${startX + barWidth + gap + barWidth / 2}" y="${height - padding.bottom + 25}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" fill="#6B7280">${after.label}</text>
  <rect x="${width / 2 - 50}" y="50" width="100" height="28" fill="${changeColor}" rx="14"/>
  <text x="${width / 2}" y="68" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" font-weight="600" fill="white">${changeSign}${changePercent}%</text>
</svg>`
}

function renderMetricsChart(spec: ChartSpec, colors: string[]): string {
  const width = 600
  const height = 400

  const metrics = spec.metrics || []
  const cols = metrics.length <= 2 ? metrics.length : Math.min(metrics.length, 3)
  const rows = Math.ceil(metrics.length / cols)

  const cardWidth = (width - 80) / cols - 20
  const cardHeight = (height - 120) / rows - 20
  const startX = 50
  const startY = 70

  let cards = ''

  metrics.forEach((metric, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = startX + col * (cardWidth + 20)
    const y = startY + row * (cardHeight + 20)
    const color = colors[i % colors.length]

    let trendIcon = ''
    if (metric.trend === 'up') {
      trendIcon = `<path d="M ${x + cardWidth - 30} ${y + cardHeight - 25} L ${x + cardWidth - 20} ${y + cardHeight - 35} L ${x + cardWidth - 10} ${y + cardHeight - 25}" fill="none" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`
    } else if (metric.trend === 'down') {
      trendIcon = `<path d="M ${x + cardWidth - 30} ${y + cardHeight - 35} L ${x + cardWidth - 20} ${y + cardHeight - 25} L ${x + cardWidth - 10} ${y + cardHeight - 35}" fill="none" stroke="#EF4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`
    }

    cards += `
    <rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" fill="white" stroke="#E5E7EB" stroke-width="1" rx="12"/>
    <rect x="${x}" y="${y}" width="4" height="${cardHeight}" fill="${color}" rx="2"/>
    <text x="${x + 20}" y="${y + 30}" font-family="system-ui, sans-serif" font-size="12" fill="#6B7280">${truncateText(metric.label, 20)}</text>
    <text x="${x + 20}" y="${y + cardHeight - 25}" font-family="system-ui, sans-serif" font-size="24" font-weight="700" fill="#111827">${metric.value}</text>
    ${trendIcon}`
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs><linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#F9FAFB"/><stop offset="100%" style="stop-color:#FFFFFF"/></linearGradient></defs>
  <rect width="${width}" height="${height}" fill="url(#bgGrad)" rx="8"/>
  <text x="${width / 2}" y="40" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="600" fill="#111827">${escapeXml(spec.title)}</text>
  ${cards}
</svg>`
}

function renderFunnelChart(spec: ChartSpec, colors: string[]): string {
  const width = 600
  const height = 400
  const padding = { top: 60, right: 100, bottom: 40, left: 100 }

  const data = spec.data || []
  const maxValue = data[0]?.value || 100
  const stageHeight = (height - padding.top - padding.bottom) / data.length

  let stages = ''
  let labels = ''

  data.forEach((item, i) => {
    const widthRatio = item.value / maxValue
    const topWidth = (width - padding.left - padding.right) * (i === 0 ? 1 : data[i - 1].value / maxValue)
    const bottomWidth = (width - padding.left - padding.right) * widthRatio

    const y = padding.top + i * stageHeight
    const topLeft = (width - topWidth) / 2
    const topRight = topLeft + topWidth
    const bottomLeft = (width - bottomWidth) / 2
    const bottomRight = bottomLeft + bottomWidth

    const color = colors[i % colors.length]

    stages += `<path d="M ${topLeft} ${y} L ${topRight} ${y} L ${bottomRight} ${y + stageHeight} L ${bottomLeft} ${y + stageHeight} Z" fill="${color}" stroke="white" stroke-width="2"/>`

    const labelY = y + stageHeight / 2
    labels += `<text x="${width / 2}" y="${labelY}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="600" fill="white">${truncateText(item.label, 15)}</text>`

    const percentage = Math.round((item.value / maxValue) * 100)
    labels += `<text x="${bottomRight + 15}" y="${labelY}" dominant-baseline="middle" font-family="system-ui, sans-serif" font-size="11" fill="#6B7280">${formatValue(item.value)} (${percentage}%)</text>`
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs><linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#F9FAFB"/><stop offset="100%" style="stop-color:#FFFFFF"/></linearGradient></defs>
  <rect width="${width}" height="${height}" fill="url(#bgGrad)" rx="8"/>
  <text x="${width / 2}" y="35" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="600" fill="#111827">${escapeXml(spec.title)}</text>
  ${stages}${labels}
</svg>`
}

/**
 * Generate fallback chart when intelligent generation fails
 */
async function generateFallbackChart(
  supabase: ReturnType<typeof createClient>,
  caseId: string,
  caseStudy: Record<string, unknown>,
  imagePrompt?: string
): Promise<GeneratedChart | null> {
  try {
    const theme = determineTheme(caseStudy, imagePrompt)
    const svgContent = generateFallbackSVG(caseStudy, theme)

    const fileName = `${caseId}/fallback-${Date.now()}.svg`
    const svgBlob = new Blob([svgContent], { type: 'image/svg+xml' })
    const svgBuffer = await svgBlob.arrayBuffer()

    const { error: uploadError } = await supabase.storage
      .from('case-study-charts')
      .upload(fileName, svgBuffer, {
        contentType: 'image/svg+xml',
        upsert: true,
      })

    if (uploadError) {
      throw uploadError
    }

    const { data: urlData } = supabase.storage
      .from('case-study-charts')
      .getPublicUrl(fileName)

    return {
      id: `fallback-${Date.now()}`,
      type: 'illustration',
      title: String(caseStudy.title || 'Case Study'),
      caption: 'Case study visualization',
      url: urlData.publicUrl,
      position: 'after_story',
      metadata: { generatedBy: 'fallback' },
    }

  } catch (error) {
    console.error(`Fallback chart generation failed:`, error)
    return null
  }
}

function determineTheme(caseStudy: Record<string, unknown>, imagePrompt?: string) {
  const content = `${caseStudy.title || ''} ${caseStudy.what_happened || ''} ${caseStudy.the_question || ''} ${imagePrompt || ''}`.toLowerCase()

  if (content.includes('growth') || content.includes('increase') || content.includes('success')) {
    return { primary: '#10B981', secondary: '#34D399', bg: '#ECFDF5' }
  }
  if (content.includes('risk') || content.includes('crisis') || content.includes('decline')) {
    return { primary: '#EF4444', secondary: '#F87171', bg: '#FEF2F2' }
  }
  if (content.includes('decision') || content.includes('strategy') || content.includes('choice')) {
    return { primary: '#F59E0B', secondary: '#FBBF24', bg: '#FFFBEB' }
  }
  if (content.includes('innovat') || content.includes('disrupt') || content.includes('creative')) {
    return { primary: '#8B5CF6', secondary: '#A78BFA', bg: '#F5F3FF' }
  }

  return { primary: '#4F46E5', secondary: '#818CF8', bg: '#EEF2FF' }
}

function generateFallbackSVG(caseStudy: Record<string, unknown>, theme: { primary: string; secondary: string; bg: string }): string {
  const width = 600
  const height = 400
  const title = String(caseStudy.title || 'Case Study')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:${theme.bg}"/><stop offset="100%" style="stop-color:#FFFFFF"/></linearGradient>
    <linearGradient id="circleGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:${theme.primary};stop-opacity:0.8"/><stop offset="100%" style="stop-color:${theme.secondary};stop-opacity:0.6"/></linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bgGrad)" rx="8"/>
  <circle cx="150" cy="200" r="80" fill="url(#circleGrad)" opacity="0.4"/>
  <circle cx="450" cy="180" r="100" fill="${theme.secondary}" opacity="0.2"/>
  <circle cx="300" cy="280" r="60" fill="${theme.primary}" opacity="0.3"/>
  <line x1="150" y1="200" x2="300" y2="280" stroke="${theme.primary}" stroke-width="2" opacity="0.3"/>
  <line x1="300" y1="280" x2="450" y2="180" stroke="${theme.secondary}" stroke-width="2" opacity="0.3"/>
  <rect x="100" y="120" width="40" height="40" fill="${theme.primary}" opacity="0.2" rx="8" transform="rotate(15, 120, 140)"/>
  <rect x="460" y="250" width="30" height="30" fill="${theme.secondary}" opacity="0.25" rx="6" transform="rotate(-10, 475, 265)"/>
  <text x="${width / 2}" y="${height - 30}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" fill="#6B7280">${escapeXml(truncateText(title, 60))}</text>
  <rect x="20" y="20" width="8" height="24" fill="${theme.primary}" rx="2"/>
  <text x="35" y="37" font-family="system-ui, sans-serif" font-size="11" font-weight="600" fill="${theme.primary}">PM Case Study</text>
</svg>`
}

// Utility functions
function formatValue(value: number | string): string {
  if (typeof value === 'string') return value
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
  if (Number.isInteger(value)) return value.toString()
  return value.toFixed(1)
}

function truncateText(text: string, maxLength: number): string {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength - 1) + '…'
}

function escapeXml(text: string): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}