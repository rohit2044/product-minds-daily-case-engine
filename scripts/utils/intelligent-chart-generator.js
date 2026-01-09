/**
 * Intelligent Chart Generator
 *
 * Uses Groq LLM to generate contextually relevant charts and visualizations
 * for case studies. Unlike the basic SVG generator, this creates meaningful
 * data visualizations based on the case study content.
 *
 * Features:
 * - LLM-powered chart data generation
 * - Multiple chart types: bar, line, pie, doughnut, comparison, metrics
 * - Context-aware visualization selection
 * - Professional SVG rendering
 * - Fallback to basic SVG on failure
 */

import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';

// Validate required environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const groqApiKey = process.env.GROQ_API_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing required environment variables: SUPABASE_URL and/or SUPABASE_SERVICE_KEY');
}

if (!groqApiKey) {
  throw new Error('Missing required environment variable: GROQ_API_KEY');
}

// Initialize clients
const supabase = createClient(supabaseUrl, supabaseKey);
const groq = new Groq({ apiKey: groqApiKey });

const STORAGE_BUCKET = 'case-study-charts';

// Model configuration
const MODEL_CONFIG = {
  model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  maxTokens: 1500,
};

// Color schemes for different chart types
const COLOR_SCHEMES = {
  primary: ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'],
  growth: ['#10B981', '#34D399', '#6EE7B7', '#A7F3D0'],
  decline: ['#EF4444', '#F87171', '#FCA5A5', '#FECACA'],
  comparison: ['#3B82F6', '#F59E0B', '#10B981', '#EF4444'],
  metrics: ['#6366F1', '#8B5CF6', '#A78BFA', '#C4B5FD'],
  neutral: ['#6B7280', '#9CA3AF', '#D1D5DB', '#E5E7EB'],
};

// Chart type configurations
const CHART_CONFIGS = {
  bar: { minBars: 3, maxBars: 6 },
  line: { minPoints: 4, maxPoints: 8 },
  pie: { minSlices: 3, maxSlices: 5 },
  doughnut: { minSlices: 3, maxSlices: 5 },
  comparison: { items: 2 },
  metrics: { minMetrics: 3, maxMetrics: 4 },
  timeline: { minEvents: 3, maxEvents: 5 },
  funnel: { minStages: 3, maxStages: 5 },
};

/**
 * Generate an intelligent chart from case study content
 *
 * @param {Object} supabaseClient - Supabase client instance (optional, uses default)
 * @param {string} caseId - The case study ID for storage path
 * @param {Object} caseStudy - The case study object with content
 * @returns {Promise<Object|null>} - Generated visual object with URL, or null on failure
 */
export async function generateIntelligentChart(supabaseClient, caseId, caseStudy) {
  const client = supabaseClient || supabase;

  if (!caseStudy) {
    console.log('  ❌ No case study data provided');
    return null;
  }

  console.log(`  🧠 Generating intelligent chart for case: ${caseStudy.title || caseId}`);

  try {
    // Step 1: Generate chart specification using LLM
    const chartSpec = await generateChartSpecification(caseStudy);

    if (!chartSpec) {
      console.log('  ⚠️ Failed to generate chart spec, using fallback');
      return await generateFallbackChart(client, caseId, caseStudy);
    }

    console.log(`  📊 Chart type: ${chartSpec.chartType}, Title: ${chartSpec.title}`);

    // Step 2: Render the chart as SVG
    const svgContent = renderChartToSVG(chartSpec);

    if (!svgContent) {
      console.log('  ⚠️ Failed to render chart, using fallback');
      return await generateFallbackChart(client, caseId, caseStudy);
    }

    // Step 3: Upload to storage
    const fileName = `${caseId}/chart-${Date.now()}.svg`;
    const svgBuffer = Buffer.from(svgContent, 'utf-8');

    const { error: uploadError } = await client.storage
      .from(STORAGE_BUCKET)
      .upload(fileName, svgBuffer, {
        contentType: 'image/svg+xml',
        upsert: true,
      });

    if (uploadError) {
      if (uploadError.message?.includes('Bucket not found')) {
        console.log('  📦 Creating storage bucket...');
        const { error: bucketError } = await client.storage.createBucket(STORAGE_BUCKET, {
          public: true,
          fileSizeLimit: 5 * 1024 * 1024,
        });
        if (bucketError && !bucketError.message?.includes('already exists')) {
          throw new Error(`Failed to create storage bucket: ${bucketError.message}`);
        }
        // Retry upload
        const { error: retryError } = await client.storage
          .from(STORAGE_BUCKET)
          .upload(fileName, svgBuffer, {
            contentType: 'image/svg+xml',
            upsert: true,
          });
        if (retryError) throw retryError;
      } else {
        throw uploadError;
      }
    }

    const { data: urlData } = client.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(fileName);

    console.log(`  ✅ Intelligent chart generated and uploaded`);

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
        dataPoints: chartSpec.data?.length || 0,
      },
    };
  } catch (error) {
    console.error(`  ❌ Intelligent chart generation failed:`, error.message);
    // Try fallback
    try {
      return await generateFallbackChart(client, caseId, caseStudy);
    } catch (fallbackError) {
      console.error(`  ❌ Fallback also failed:`, fallbackError.message);
      return null;
    }
  }
}

/**
 * Generate chart specification using Groq LLM
 *
 * @param {Object} caseStudy - The case study content
 * @returns {Promise<Object|null>} - Chart specification or null on failure
 */
async function generateChartSpecification(caseStudy) {
  // Build context from case study
  const context = buildContextFromCaseStudy(caseStudy);

  const systemPrompt = `You are a data visualization expert. Your task is to create a meaningful chart specification based on a business case study.

IMPORTANT RULES:
1. Generate REALISTIC, PLAUSIBLE data that fits the context
2. Use actual numbers that make sense for the scenario
3. The chart should provide insight relevant to the case study
4. Keep labels short (max 15 characters)
5. Use 3-6 data points/categories for clarity

Available chart types and when to use them:
- "bar": Compare discrete categories (revenue by segment, feature usage, market share)
- "line": Show trends over time (growth, performance metrics, user engagement)
- "pie": Show parts of a whole (market share distribution, budget allocation)
- "doughnut": Same as pie, more modern look
- "comparison": Before/after or A/B comparisons (2 items only)
- "metrics": Key performance indicators (3-4 metrics with values and labels)
- "funnel": Show progression/conversion (signup flow, sales pipeline)

Respond ONLY with valid JSON in this exact format:
{
  "chartType": "bar|line|pie|doughnut|comparison|metrics|funnel",
  "title": "Clear, descriptive chart title (max 50 chars)",
  "caption": "Brief explanation of what the chart shows",
  "data": [
    {"label": "Category", "value": 100}
  ],
  "colorScheme": "primary|growth|decline|comparison|metrics|neutral"
}

For comparison type, use exactly 2 items with a "comparison" wrapper:
{
  "chartType": "comparison",
  "title": "Before vs After Implementation",
  "caption": "Impact of changes",
  "comparison": {
    "before": {"label": "Before", "value": 40},
    "after": {"label": "After", "value": 85}
  },
  "colorScheme": "comparison"
}

For metrics type:
{
  "chartType": "metrics",
  "title": "Key Performance Indicators",
  "caption": "Critical metrics overview",
  "metrics": [
    {"label": "Revenue", "value": "$2.4M", "trend": "up"},
    {"label": "Users", "value": "150K", "trend": "up"},
    {"label": "Churn", "value": "2.1%", "trend": "down"}
  ],
  "colorScheme": "metrics"
}`;

  const userPrompt = `Create a meaningful chart for this case study:

TITLE: ${caseStudy.title || 'Unknown'}
COMPANY: ${caseStudy.company_name || 'Unknown'}
INDUSTRY: ${caseStudy.industry || 'Technology'}
QUESTION TYPE: ${caseStudy.question_type || 'General'}

CONTEXT:
${context}

IMAGE PROMPT (if available): ${caseStudy.image_prompt || 'Not specified'}

Generate a chart that helps visualize a key aspect of this case study. The data should be realistic and relevant.`;

  try {
    const response = await groq.chat.completions.create({
      model: MODEL_CONFIG.model,
      max_tokens: MODEL_CONFIG.maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4, // Lower temperature for more consistent output
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from LLM');
    }

    const chartSpec = JSON.parse(content);

    // Validate the response
    if (!validateChartSpec(chartSpec)) {
      throw new Error('Invalid chart specification');
    }

    return chartSpec;
  } catch (error) {
    console.error(`  ⚠️ LLM chart generation error:`, error.message);
    return null;
  }
}

/**
 * Build context string from case study
 */
function buildContextFromCaseStudy(caseStudy) {
  const parts = [];

  if (caseStudy.what_happened) {
    parts.push(`STORY: ${caseStudy.what_happened.substring(0, 500)}`);
  }

  if (caseStudy.the_question) {
    parts.push(`QUESTION: ${caseStudy.the_question}`);
  }

  if (caseStudy.summary?.approach_summary) {
    parts.push(`APPROACH: ${caseStudy.summary.approach_summary}`);
  }

  if (caseStudy.mental_model?.intro) {
    parts.push(`FRAMEWORK: ${caseStudy.mental_model.intro}`);
  }

  // Include any key metrics mentioned
  if (caseStudy.tags && caseStudy.tags.length > 0) {
    parts.push(`TAGS: ${caseStudy.tags.join(', ')}`);
  }

  return parts.join('\n\n') || 'No additional context available.';
}

/**
 * Validate chart specification
 */
function validateChartSpec(spec) {
  if (!spec || typeof spec !== 'object') return false;
  if (!spec.chartType || !spec.title) return false;

  const validTypes = ['bar', 'line', 'pie', 'doughnut', 'comparison', 'metrics', 'funnel'];
  if (!validTypes.includes(spec.chartType)) return false;

  // Type-specific validation
  if (spec.chartType === 'comparison') {
    if (!spec.comparison || !spec.comparison.before || !spec.comparison.after) return false;
  } else if (spec.chartType === 'metrics') {
    if (!Array.isArray(spec.metrics) || spec.metrics.length < 2) return false;
  } else {
    if (!Array.isArray(spec.data) || spec.data.length < 2) return false;
  }

  return true;
}

/**
 * Render chart specification to SVG
 */
function renderChartToSVG(spec) {
  const colorScheme = COLOR_SCHEMES[spec.colorScheme] || COLOR_SCHEMES.primary;

  switch (spec.chartType) {
    case 'bar':
      return renderBarChart(spec, colorScheme);
    case 'line':
      return renderLineChart(spec, colorScheme);
    case 'pie':
    case 'doughnut':
      return renderPieChart(spec, colorScheme, spec.chartType === 'doughnut');
    case 'comparison':
      return renderComparisonChart(spec, colorScheme);
    case 'metrics':
      return renderMetricsChart(spec, colorScheme);
    case 'funnel':
      return renderFunnelChart(spec, colorScheme);
    default:
      return renderBarChart(spec, colorScheme); // Default to bar
  }
}

/**
 * Render bar chart SVG
 */
function renderBarChart(spec, colors) {
  const width = 600;
  const height = 400;
  const padding = { top: 60, right: 40, bottom: 80, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const data = spec.data || [];
  const maxValue = Math.max(...data.map((d) => d.value));
  const barWidth = Math.min(60, (chartWidth / data.length) * 0.7);
  const barGap = (chartWidth - barWidth * data.length) / (data.length + 1);

  let bars = '';
  let labels = '';
  let values = '';

  data.forEach((item, i) => {
    const x = padding.left + barGap + i * (barWidth + barGap);
    const barHeight = (item.value / maxValue) * chartHeight;
    const y = padding.top + chartHeight - barHeight;
    const color = colors[i % colors.length];

    bars += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="${color}" rx="4">
      <animate attributeName="height" from="0" to="${barHeight}" dur="0.5s" fill="freeze"/>
      <animate attributeName="y" from="${padding.top + chartHeight}" to="${y}" dur="0.5s" fill="freeze"/>
    </rect>`;

    // Value label
    values += `<text x="${x + barWidth / 2}" y="${y - 8}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="600" fill="#374151">${formatValue(item.value)}</text>`;

    // X-axis label
    const label = truncateText(item.label, 12);
    labels += `<text x="${x + barWidth / 2}" y="${height - padding.bottom + 20}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" fill="#6B7280">${label}</text>`;
  });

  // Y-axis
  const yAxisSteps = 4;
  let yAxis = '';
  for (let i = 0; i <= yAxisSteps; i++) {
    const y = padding.top + (i / yAxisSteps) * chartHeight;
    const value = maxValue * (1 - i / yAxisSteps);
    yAxis += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#E5E7EB" stroke-dasharray="4"/>`;
    yAxis += `<text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" font-family="system-ui, sans-serif" font-size="10" fill="#9CA3AF">${formatValue(value)}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#F9FAFB"/>
      <stop offset="100%" style="stop-color:#FFFFFF"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bgGrad)" rx="8"/>
  <text x="${width / 2}" y="35" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="600" fill="#111827">${escapeXml(spec.title)}</text>
  ${yAxis}
  ${bars}
  ${values}
  ${labels}
</svg>`;
}

/**
 * Render line chart SVG
 */
function renderLineChart(spec, colors) {
  const width = 600;
  const height = 400;
  const padding = { top: 60, right: 40, bottom: 80, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const data = spec.data || [];
  const maxValue = Math.max(...data.map((d) => d.value));
  const minValue = Math.min(0, ...data.map((d) => d.value));
  const valueRange = maxValue - minValue;

  const points = data.map((item, i) => {
    const x = padding.left + (i / (data.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - ((item.value - minValue) / valueRange) * chartHeight;
    return { x, y, ...item };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`;

  let dots = '';
  let labels = '';

  points.forEach((p, i) => {
    dots += `<circle cx="${p.x}" cy="${p.y}" r="5" fill="${colors[0]}" stroke="white" stroke-width="2"/>`;

    // Value label
    dots += `<text x="${p.x}" y="${p.y - 12}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" font-weight="500" fill="#374151">${formatValue(p.value)}</text>`;

    // X-axis label
    if (i === 0 || i === data.length - 1 || data.length <= 5 || i % 2 === 0) {
      labels += `<text x="${p.x}" y="${height - padding.bottom + 20}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="10" fill="#6B7280">${truncateText(p.label, 10)}</text>`;
    }
  });

  // Y-axis
  const yAxisSteps = 4;
  let yAxis = '';
  for (let i = 0; i <= yAxisSteps; i++) {
    const y = padding.top + (i / yAxisSteps) * chartHeight;
    const value = maxValue - (i / yAxisSteps) * valueRange;
    yAxis += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#E5E7EB" stroke-dasharray="4"/>`;
    yAxis += `<text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" font-family="system-ui, sans-serif" font-size="10" fill="#9CA3AF">${formatValue(value)}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#F9FAFB"/>
      <stop offset="100%" style="stop-color:#FFFFFF"/>
    </linearGradient>
    <linearGradient id="areaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${colors[0]};stop-opacity:0.3"/>
      <stop offset="100%" style="stop-color:${colors[0]};stop-opacity:0.05"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bgGrad)" rx="8"/>
  <text x="${width / 2}" y="35" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="600" fill="#111827">${escapeXml(spec.title)}</text>
  ${yAxis}
  <path d="${areaPath}" fill="url(#areaGrad)"/>
  <path d="${linePath}" fill="none" stroke="${colors[0]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  ${dots}
  ${labels}
</svg>`;
}

/**
 * Render pie/doughnut chart SVG
 */
function renderPieChart(spec, colors, isDoughnut = false) {
  const width = 600;
  const height = 400;
  const centerX = width / 2;
  const centerY = height / 2 + 10;
  const radius = 120;
  const innerRadius = isDoughnut ? radius * 0.6 : 0;

  const data = spec.data || [];
  const total = data.reduce((sum, d) => sum + d.value, 0);

  let startAngle = -Math.PI / 2;
  let slices = '';
  let labels = '';
  let legendItems = '';

  data.forEach((item, i) => {
    const sliceAngle = (item.value / total) * 2 * Math.PI;
    const endAngle = startAngle + sliceAngle;
    const midAngle = startAngle + sliceAngle / 2;

    const color = colors[i % colors.length];

    // Calculate arc path
    const x1 = centerX + radius * Math.cos(startAngle);
    const y1 = centerY + radius * Math.sin(startAngle);
    const x2 = centerX + radius * Math.cos(endAngle);
    const y2 = centerY + radius * Math.sin(endAngle);

    const largeArc = sliceAngle > Math.PI ? 1 : 0;

    let path;
    if (isDoughnut) {
      const ix1 = centerX + innerRadius * Math.cos(startAngle);
      const iy1 = centerY + innerRadius * Math.sin(startAngle);
      const ix2 = centerX + innerRadius * Math.cos(endAngle);
      const iy2 = centerY + innerRadius * Math.sin(endAngle);

      path = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix1} ${iy1} Z`;
    } else {
      path = `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    }

    slices += `<path d="${path}" fill="${color}" stroke="white" stroke-width="2"/>`;

    // Percentage label
    const labelRadius = isDoughnut ? (radius + innerRadius) / 2 : radius * 0.65;
    const labelX = centerX + labelRadius * Math.cos(midAngle);
    const labelY = centerY + labelRadius * Math.sin(midAngle);
    const percentage = Math.round((item.value / total) * 100);

    if (percentage >= 8) {
      labels += `<text x="${labelX}" y="${labelY}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="600" fill="white">${percentage}%</text>`;
    }

    // Legend
    const legendY = 60 + i * 22;
    legendItems += `<rect x="${width - 150}" y="${legendY - 8}" width="12" height="12" fill="${color}" rx="2"/>`;
    legendItems += `<text x="${width - 132}" y="${legendY}" font-family="system-ui, sans-serif" font-size="11" fill="#374151">${truncateText(item.label, 15)}</text>`;

    startAngle = endAngle;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#F9FAFB"/>
      <stop offset="100%" style="stop-color:#FFFFFF"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bgGrad)" rx="8"/>
  <text x="${width / 2}" y="35" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="600" fill="#111827">${escapeXml(spec.title)}</text>
  ${slices}
  ${labels}
  ${legendItems}
</svg>`;
}

/**
 * Render comparison chart SVG (before/after)
 */
function renderComparisonChart(spec, colors) {
  const width = 600;
  const height = 400;
  const padding = { top: 80, right: 60, bottom: 60, left: 60 };

  const before = spec.comparison?.before || { label: 'Before', value: 0 };
  const after = spec.comparison?.after || { label: 'After', value: 0 };
  const maxValue = Math.max(before.value, after.value);

  const barWidth = 120;
  const gap = 80;
  const startX = (width - (barWidth * 2 + gap)) / 2;
  const chartHeight = height - padding.top - padding.bottom;

  const beforeHeight = (before.value / maxValue) * chartHeight;
  const afterHeight = (after.value / maxValue) * chartHeight;

  const beforeY = padding.top + chartHeight - beforeHeight;
  const afterY = padding.top + chartHeight - afterHeight;

  const change = after.value - before.value;
  const changePercent = before.value > 0 ? Math.round((change / before.value) * 100) : 0;
  const changeColor = change >= 0 ? '#10B981' : '#EF4444';
  const changeSign = change >= 0 ? '+' : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#F9FAFB"/>
      <stop offset="100%" style="stop-color:#FFFFFF"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bgGrad)" rx="8"/>
  <text x="${width / 2}" y="35" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="600" fill="#111827">${escapeXml(spec.title)}</text>

  <!-- Before bar -->
  <rect x="${startX}" y="${beforeY}" width="${barWidth}" height="${beforeHeight}" fill="${colors[0]}" rx="6"/>
  <text x="${startX + barWidth / 2}" y="${beforeY - 10}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="18" font-weight="700" fill="#374151">${formatValue(before.value)}</text>
  <text x="${startX + barWidth / 2}" y="${height - padding.bottom + 25}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" fill="#6B7280">${before.label}</text>

  <!-- After bar -->
  <rect x="${startX + barWidth + gap}" y="${afterY}" width="${barWidth}" height="${afterHeight}" fill="${colors[1]}" rx="6"/>
  <text x="${startX + barWidth + gap + barWidth / 2}" y="${afterY - 10}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="18" font-weight="700" fill="#374151">${formatValue(after.value)}</text>
  <text x="${startX + barWidth + gap + barWidth / 2}" y="${height - padding.bottom + 25}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" fill="#6B7280">${after.label}</text>

  <!-- Change indicator -->
  <rect x="${width / 2 - 50}" y="50" width="100" height="28" fill="${changeColor}" rx="14"/>
  <text x="${width / 2}" y="68" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" font-weight="600" fill="white">${changeSign}${changePercent}%</text>

  <!-- Arrow -->
  <path d="M ${startX + barWidth + 15} ${(beforeY + afterY) / 2} L ${startX + barWidth + gap - 15} ${(beforeY + afterY) / 2}" stroke="${changeColor}" stroke-width="3" stroke-linecap="round" marker-end="url(#arrowhead)"/>
  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="${changeColor}"/>
    </marker>
  </defs>
</svg>`;
}

/**
 * Render metrics dashboard SVG
 */
function renderMetricsChart(spec, colors) {
  const width = 600;
  const height = 400;

  const metrics = spec.metrics || [];
  const cols = metrics.length <= 2 ? metrics.length : Math.min(metrics.length, 3);
  const rows = Math.ceil(metrics.length / cols);

  const cardWidth = (width - 80) / cols - 20;
  const cardHeight = (height - 120) / rows - 20;
  const startX = 50;
  const startY = 70;

  let cards = '';

  metrics.forEach((metric, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * (cardWidth + 20);
    const y = startY + row * (cardHeight + 20);
    const color = colors[i % colors.length];

    // Trend arrow
    let trendIcon = '';
    if (metric.trend === 'up') {
      trendIcon = `<path d="M ${x + cardWidth - 30} ${y + cardHeight - 25} L ${x + cardWidth - 20} ${y + cardHeight - 35} L ${x + cardWidth - 10} ${y + cardHeight - 25}" fill="none" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    } else if (metric.trend === 'down') {
      trendIcon = `<path d="M ${x + cardWidth - 30} ${y + cardHeight - 35} L ${x + cardWidth - 20} ${y + cardHeight - 25} L ${x + cardWidth - 10} ${y + cardHeight - 35}" fill="none" stroke="#EF4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    }

    cards += `
    <rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" fill="white" stroke="#E5E7EB" stroke-width="1" rx="12"/>
    <rect x="${x}" y="${y}" width="4" height="${cardHeight}" fill="${color}" rx="2"/>
    <text x="${x + 20}" y="${y + 30}" font-family="system-ui, sans-serif" font-size="12" fill="#6B7280">${truncateText(metric.label, 20)}</text>
    <text x="${x + 20}" y="${y + cardHeight - 25}" font-family="system-ui, sans-serif" font-size="24" font-weight="700" fill="#111827">${metric.value}</text>
    ${trendIcon}`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#F9FAFB"/>
      <stop offset="100%" style="stop-color:#FFFFFF"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bgGrad)" rx="8"/>
  <text x="${width / 2}" y="40" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="600" fill="#111827">${escapeXml(spec.title)}</text>
  ${cards}
</svg>`;
}

/**
 * Render funnel chart SVG
 */
function renderFunnelChart(spec, colors) {
  const width = 600;
  const height = 400;
  const padding = { top: 60, right: 100, bottom: 40, left: 100 };

  const data = spec.data || [];
  const maxValue = data[0]?.value || 100;
  const stageHeight = (height - padding.top - padding.bottom) / data.length;

  let stages = '';
  let labels = '';

  data.forEach((item, i) => {
    const widthRatio = item.value / maxValue;
    const topWidth = (width - padding.left - padding.right) * (i === 0 ? 1 : data[i - 1].value / maxValue);
    const bottomWidth = (width - padding.left - padding.right) * widthRatio;

    const y = padding.top + i * stageHeight;
    const topLeft = (width - topWidth) / 2;
    const topRight = topLeft + topWidth;
    const bottomLeft = (width - bottomWidth) / 2;
    const bottomRight = bottomLeft + bottomWidth;

    const color = colors[i % colors.length];

    stages += `<path d="M ${topLeft} ${y} L ${topRight} ${y} L ${bottomRight} ${y + stageHeight} L ${bottomLeft} ${y + stageHeight} Z" fill="${color}" stroke="white" stroke-width="2"/>`;

    // Label
    const labelY = y + stageHeight / 2;
    labels += `<text x="${width / 2}" y="${labelY}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="600" fill="white">${truncateText(item.label, 15)}</text>`;

    // Value on right
    const percentage = Math.round((item.value / maxValue) * 100);
    labels += `<text x="${bottomRight + 15}" y="${labelY}" dominant-baseline="middle" font-family="system-ui, sans-serif" font-size="11" fill="#6B7280">${formatValue(item.value)} (${percentage}%)</text>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#F9FAFB"/>
      <stop offset="100%" style="stop-color:#FFFFFF"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bgGrad)" rx="8"/>
  <text x="${width / 2}" y="35" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="600" fill="#111827">${escapeXml(spec.title)}</text>
  ${stages}
  ${labels}
</svg>`;
}

/**
 * Generate fallback chart when LLM fails
 */
async function generateFallbackChart(client, caseId, caseStudy) {
  console.log('  📊 Generating fallback chart...');

  // Determine theme based on case study content
  const theme = determineTheme(caseStudy);

  // Generate a simple branded illustration
  const svgContent = generateBrandedIllustration(caseStudy, theme);

  const fileName = `${caseId}/fallback-${Date.now()}.svg`;
  const svgBuffer = Buffer.from(svgContent, 'utf-8');

  const { error: uploadError } = await client.storage
    .from(STORAGE_BUCKET)
    .upload(fileName, svgBuffer, {
      contentType: 'image/svg+xml',
      upsert: true,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data: urlData } = client.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(fileName);

  return {
    id: `fallback-${Date.now()}`,
    type: 'illustration',
    title: caseStudy.title || 'Case Study',
    caption: 'Case study visualization',
    url: urlData.publicUrl,
    position: 'after_story',
    metadata: {
      generatedBy: 'fallback',
      chartType: 'illustration',
    },
  };
}

/**
 * Determine visual theme from case study content
 */
function determineTheme(caseStudy) {
  const content = `${caseStudy.title || ''} ${caseStudy.what_happened || ''} ${caseStudy.the_question || ''} ${caseStudy.image_prompt || ''}`.toLowerCase();

  if (content.includes('growth') || content.includes('increase') || content.includes('success') || content.includes('scale')) {
    return { primary: '#10B981', secondary: '#34D399', bg: '#ECFDF5', name: 'growth' };
  }
  if (content.includes('risk') || content.includes('crisis') || content.includes('challenge') || content.includes('decline')) {
    return { primary: '#EF4444', secondary: '#F87171', bg: '#FEF2F2', name: 'risk' };
  }
  if (content.includes('decision') || content.includes('choice') || content.includes('trade') || content.includes('strategy')) {
    return { primary: '#F59E0B', secondary: '#FBBF24', bg: '#FFFBEB', name: 'decision' };
  }
  if (content.includes('innovat') || content.includes('creative') || content.includes('new') || content.includes('disrupt')) {
    return { primary: '#8B5CF6', secondary: '#A78BFA', bg: '#F5F3FF', name: 'innovation' };
  }
  if (content.includes('data') || content.includes('metric') || content.includes('analy')) {
    return { primary: '#3B82F6', secondary: '#60A5FA', bg: '#EFF6FF', name: 'data' };
  }

  return { primary: '#4F46E5', secondary: '#818CF8', bg: '#EEF2FF', name: 'default' };
}

/**
 * Generate branded illustration SVG
 */
function generateBrandedIllustration(caseStudy, theme) {
  const width = 600;
  const height = 400;
  const title = caseStudy.title || 'Case Study';

  // Create a professional abstract illustration
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${theme.bg}"/>
      <stop offset="100%" style="stop-color:#FFFFFF"/>
    </linearGradient>
    <linearGradient id="circleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${theme.primary};stop-opacity:0.8"/>
      <stop offset="100%" style="stop-color:${theme.secondary};stop-opacity:0.6"/>
    </linearGradient>
  </defs>

  <rect width="${width}" height="${height}" fill="url(#bgGrad)" rx="8"/>

  <!-- Abstract shapes -->
  <circle cx="150" cy="200" r="80" fill="url(#circleGrad)" opacity="0.4"/>
  <circle cx="450" cy="180" r="100" fill="${theme.secondary}" opacity="0.2"/>
  <circle cx="300" cy="280" r="60" fill="${theme.primary}" opacity="0.3"/>

  <!-- Connecting lines -->
  <line x1="150" y1="200" x2="300" y2="280" stroke="${theme.primary}" stroke-width="2" opacity="0.3"/>
  <line x1="300" y1="280" x2="450" y2="180" stroke="${theme.secondary}" stroke-width="2" opacity="0.3"/>
  <line x1="150" y1="200" x2="450" y2="180" stroke="${theme.primary}" stroke-width="1" opacity="0.2" stroke-dasharray="8"/>

  <!-- Decorative elements -->
  <rect x="100" y="120" width="40" height="40" fill="${theme.primary}" opacity="0.2" rx="8" transform="rotate(15, 120, 140)"/>
  <rect x="460" y="250" width="30" height="30" fill="${theme.secondary}" opacity="0.25" rx="6" transform="rotate(-10, 475, 265)"/>

  <!-- Title -->
  <text x="${width / 2}" y="${height - 30}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" fill="#6B7280">${escapeXml(truncateText(title, 60))}</text>

  <!-- Brand mark -->
  <rect x="20" y="20" width="8" height="24" fill="${theme.primary}" rx="2"/>
  <text x="35" y="37" font-family="system-ui, sans-serif" font-size="11" font-weight="600" fill="${theme.primary}">PM Case Study</text>
</svg>`;
}

// Utility functions

function formatValue(value) {
  if (typeof value === 'string') return value;
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(1);
}

function truncateText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 1) + '…';
}

function escapeXml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Delete existing visuals for a case study
 */
export async function deleteExistingVisuals(caseId) {
  const result = { deleted: 0, errors: [] };

  try {
    const { data: files, error: listError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(caseId);

    if (listError) {
      result.errors.push(`Failed to list files: ${listError.message}`);
      return result;
    }

    if (!files || files.length === 0) {
      console.log(`  📂 No existing visuals found for case ${caseId}`);
      return result;
    }

    const filesToDelete = files.map((f) => `${caseId}/${f.name}`);
    const { error: deleteError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove(filesToDelete);

    if (deleteError) {
      result.errors.push(`Failed to delete files: ${deleteError.message}`);
    } else {
      result.deleted = filesToDelete.length;
      console.log(`  🗑️ Deleted ${result.deleted} existing visual(s)`);
    }
  } catch (error) {
    result.errors.push(`Unexpected error: ${error.message}`);
  }

  return result;
}

export default {
  generateIntelligentChart,
  deleteExistingVisuals,
};