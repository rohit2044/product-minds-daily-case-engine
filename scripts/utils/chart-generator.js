/**
 * Chart & Visual Generator
 *
 * Generates images from text prompts as themed SVGs.
 * Uploads generated visuals to Supabase Storage and returns URLs.
 */

import { createClient } from '@supabase/supabase-js';

// Validate required environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing required environment variables: SUPABASE_URL and/or SUPABASE_SERVICE_KEY');
}

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

const QUICKCHART_BASE_URL = 'https://quickchart.io/chart';
const STORAGE_BUCKET = 'case-study-charts';

// Color palettes for charts
const CHART_PALETTES = {
  default: ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'],
  cool: ['#3B82F6', '#06B6D4', '#8B5CF6', '#6366F1', '#0EA5E9', '#7C3AED'],
  warm: ['#F59E0B', '#EF4444', '#EC4899', '#F97316', '#DC2626', '#DB2777'],
  business: ['#1E40AF', '#047857', '#B45309', '#7C2D12', '#5B21B6', '#BE185D'],
};

// Illustration color themes
const ILLUSTRATION_THEMES = {
  strategy: { primary: '#4F46E5', secondary: '#818CF8', accent: '#C7D2FE', bg: '#EEF2FF' },
  growth: { primary: '#10B981', secondary: '#34D399', accent: '#A7F3D0', bg: '#ECFDF5' },
  disruption: { primary: '#EF4444', secondary: '#F87171', accent: '#FECACA', bg: '#FEF2F2' },
  innovation: { primary: '#8B5CF6', secondary: '#A78BFA', accent: '#DDD6FE', bg: '#F5F3FF' },
  decision: { primary: '#F59E0B', secondary: '#FBBF24', accent: '#FDE68A', bg: '#FFFBEB' },
};

/**
 * Map chart types to Chart.js types
 */
function mapChartType(chartType) {
  const mapping = {
    'bar': 'bar',
    'line': 'line',
    'doughnut': 'doughnut',
    'pie': 'pie',
    'horizontalBar': 'horizontalBar',
    'radar': 'radar',
    'funnel': 'horizontalBar',
  };
  return mapping[chartType] || 'bar';
}

/**
 * Get background colors based on chart type
 */
function getBackgroundColors(chartType, colors, datasetIndex, dataLength) {
  if (['doughnut', 'pie'].includes(chartType)) {
    return colors.slice(0, dataLength);
  }
  const color = colors[datasetIndex % colors.length];
  return chartType === 'bar' ? color : `${color}33`;
}

/**
 * Simple hash function for deterministic randomness
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Pseudo-random number generator with seed
 */
function pseudoRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/**
 * Delete all existing visuals for a case study
 * Used for delete-and-replace update strategy
 * @param {string} caseId - The case study ID
 * @returns {Promise<{deleted: number, errors: string[]}>}
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
      console.log(`  🗑️ Deleted ${result.deleted} existing visual(s) for case ${caseId}`);
    }
  } catch (error) {
    result.errors.push(`Unexpected error: ${error.message}`);
  }

  return result;
}

/**
 * Generate a QuickChart URL directly (for quick chart generation without storage)
 * @param {Object} spec - Chart specification
 * @returns {string} QuickChart URL
 */
export function getQuickChartUrl(spec) {
  const colors = spec.colors || CHART_PALETTES.default;

  const chartConfig = {
    type: mapChartType(spec.chart_type),
    data: {
      labels: spec.labels || [],
      datasets: (spec.datasets || []).map((ds, idx) => ({
        label: ds.label,
        data: ds.data,
        backgroundColor: getBackgroundColors(spec.chart_type, colors, idx, ds.data?.length),
        borderColor: colors[idx % colors.length],
        borderWidth: 1,
      })),
    },
    options: {
      plugins: {
        title: { display: true, text: spec.title },
      },
    },
  };

  return `${QUICKCHART_BASE_URL}?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=600&h=400&bkg=white`;
}

/**
 * Generate an image from a text prompt
 * Creates a themed SVG based on prompt keywords
 *
 * @param {Object} supabaseClient - Supabase client instance
 * @param {string} caseId - The case study ID for storage path
 * @param {string} imagePrompt - The text prompt describing the image
 * @param {string} title - The case study title
 * @returns {Promise<Object|null>} - Generated visual object with URL, or null on failure
 */
export async function generateImageFromPrompt(supabaseClient, caseId, imagePrompt, title) {
  if (!imagePrompt || typeof imagePrompt !== 'string') {
    console.log('  📊 No image prompt provided, skipping image generation');
    return null;
  }

  console.log(`  📊 Generating image from prompt for case ${caseId}`);

  try {
    const svgContent = generateThemedSVGFromPrompt(imagePrompt, title);
    const svgBuffer = Buffer.from(svgContent, 'utf-8');

    const client = supabaseClient || supabase;

    const fileName = `${caseId}/image-${Date.now()}.svg`;
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
        if (bucketError) {
          throw new Error(`Failed to create storage bucket: ${bucketError.message}`);
        }
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

    console.log(`  ✅ Image generated and uploaded from prompt`);

    return {
      id: 'image-1',
      type: 'illustration',
      title: title,
      caption: imagePrompt.substring(0, 100) + (imagePrompt.length > 100 ? '...' : ''),
      url: urlData.publicUrl,
      position: 'after_story',
    };
  } catch (error) {
    console.error(`  ❌ Failed to generate image from prompt:`, error.message);
    return null;
  }
}

/**
 * Generate a themed SVG based on the image prompt
 * @param {string} imagePrompt - The text prompt
 * @param {string} title - The case study title for seed
 * @returns {string} SVG content
 */
function generateThemedSVGFromPrompt(imagePrompt, title) {
  const promptLower = imagePrompt.toLowerCase();

  // Determine theme based on prompt keywords
  let theme;
  if (promptLower.includes('growth') || promptLower.includes('increase') || promptLower.includes('success') || promptLower.includes('scale')) {
    theme = ILLUSTRATION_THEMES.growth;
  } else if (promptLower.includes('disrupt') || promptLower.includes('crisis') || promptLower.includes('challenge') || promptLower.includes('risk')) {
    theme = ILLUSTRATION_THEMES.disruption;
  } else if (promptLower.includes('innovat') || promptLower.includes('creative') || promptLower.includes('new') || promptLower.includes('idea')) {
    theme = ILLUSTRATION_THEMES.innovation;
  } else if (promptLower.includes('decision') || promptLower.includes('choice') || promptLower.includes('trade') || promptLower.includes('path')) {
    theme = ILLUSTRATION_THEMES.decision;
  } else {
    theme = ILLUSTRATION_THEMES.strategy;
  }

  const seed = hashString(title + imagePrompt);
  const shapes = [];

  // Generate random geometric shapes
  for (let i = 0; i < 8; i++) {
    const x = pseudoRandom(seed + i * 100) * 500 + 50;
    const y = pseudoRandom(seed + i * 200) * 300 + 50;
    const size = pseudoRandom(seed + i * 300) * 80 + 30;
    const opacity = pseudoRandom(seed + i * 400) * 0.4 + 0.2;
    const shapeType = Math.floor(pseudoRandom(seed + i * 500) * 3);

    const color = i % 2 === 0 ? theme.primary : theme.secondary;

    if (shapeType === 0) {
      shapes.push(`<circle cx="${x}" cy="${y}" r="${size}" fill="${color}" opacity="${opacity}"/>`);
    } else if (shapeType === 1) {
      shapes.push(`<rect x="${x - size/2}" y="${y - size/2}" width="${size}" height="${size}" fill="${color}" opacity="${opacity}" rx="8"/>`);
    } else {
      const points = `${x},${y - size} ${x + size * 0.866},${y + size/2} ${x - size * 0.866},${y + size/2}`;
      shapes.push(`<polygon points="${points}" fill="${color}" opacity="${opacity}"/>`);
    }
  }

  // Add connecting lines
  for (let i = 0; i < 5; i++) {
    const x1 = pseudoRandom(seed + i * 600) * 500 + 50;
    const y1 = pseudoRandom(seed + i * 700) * 300 + 50;
    const x2 = pseudoRandom(seed + i * 800) * 500 + 50;
    const y2 = pseudoRandom(seed + i * 900) * 300 + 50;
    shapes.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${theme.accent}" stroke-width="2" opacity="0.5"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${theme.bg}"/>
      <stop offset="100%" style="stop-color:white"/>
    </linearGradient>
  </defs>
  <rect width="600" height="400" fill="url(#bgGrad)"/>
  ${shapes.join('\n  ')}
  <text x="300" y="380" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" fill="#6B7280">${title.substring(0, 50)}${title.length > 50 ? '...' : ''}</text>
</svg>`;
}