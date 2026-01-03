/**
 * Chart & Visual Generator
 *
 * Generates charts using QuickChart.io API and abstract illustrations as SVG.
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
 * Generate visuals from visual specs
 * @param {Array} visualSpecs - Array of visual specifications from LLM
 * @param {string} caseId - The case study ID for storage path
 * @returns {Array} - Array of generated visual objects with URLs
 */
export async function generateVisuals(visualSpecs, caseId) {
  if (!visualSpecs || !Array.isArray(visualSpecs) || visualSpecs.length === 0) {
    console.log('  📊 No visual specs provided, skipping visual generation');
    return [];
  }

  const generatedVisuals = [];

  for (let i = 0; i < visualSpecs.length; i++) {
    const spec = visualSpecs[i];
    console.log(`  📊 Generating visual ${i + 1}/${visualSpecs.length}: ${spec.title}`);

    try {
      let visualData;
      let fileExtension;
      let contentType;

      if (spec.visual_type === 'chart') {
        // Generate chart using QuickChart
        visualData = await generateChart(spec);
        fileExtension = 'png';
        contentType = 'image/png';
      } else {
        // Generate illustration as SVG
        visualData = generateIllustration(spec);
        fileExtension = 'svg';
        contentType = 'image/svg+xml';
      }

      // Upload to Supabase Storage
      const fileName = `${caseId}/visual-${i + 1}-${Date.now()}.${fileExtension}`;
      const url = await uploadToStorage(fileName, visualData, contentType);

      generatedVisuals.push({
        id: `visual-${i + 1}`,
        type: spec.visual_type,
        chart_type: spec.chart_type || null,
        illustration_type: spec.illustration_type || null,
        title: spec.title,
        caption: spec.caption,
        url: url,
        position: spec.position || 'after_story',
      });

      console.log(`  ✅ Visual ${i + 1} generated and uploaded`);
    } catch (error) {
      console.error(`  ❌ Failed to generate visual ${i + 1}:`, error.message);
      // Continue with other visuals even if one fails
    }
  }

  return generatedVisuals;
}

/**
 * Generate a chart using QuickChart.io API
 */
async function generateChart(spec) {
  const colors = spec.colors || CHART_PALETTES.default;

  // Build Chart.js configuration
  const chartConfig = {
    type: mapChartType(spec.chart_type),
    data: {
      labels: spec.labels || [],
      datasets: (spec.datasets || []).map((ds, idx) => ({
        label: ds.label,
        data: ds.data,
        backgroundColor: getBackgroundColors(spec.chart_type, colors, idx, ds.data?.length),
        borderColor: colors[idx % colors.length],
        borderWidth: spec.chart_type === 'line' ? 2 : 1,
        fill: spec.chart_type === 'line' ? false : undefined,
        tension: spec.chart_type === 'line' ? 0.3 : undefined,
      })),
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: spec.title,
          font: { size: 16, weight: 'bold' },
        },
        legend: {
          display: spec.datasets?.length > 1,
          position: 'bottom',
        },
      },
      scales: needsScales(spec.chart_type) ? {
        y: {
          beginAtZero: true,
          grid: { color: '#E5E7EB' },
        },
        x: {
          grid: { display: false },
        },
      } : undefined,
    },
  };

  // Special handling for funnel charts (using horizontal bar)
  if (spec.chart_type === 'funnel') {
    chartConfig.type = 'horizontalBar';
    chartConfig.options.indexAxis = 'y';
  }

  const configJson = JSON.stringify(chartConfig);
  let response;

  // Use POST for large configurations to avoid URL length limits
  if (configJson.length > 1500) {
    response = await fetch(QUICKCHART_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chart: chartConfig,
        width: 600,
        height: 400,
        backgroundColor: 'white',
        format: 'png',
      }),
    });
  } else {
    const chartUrl = `${QUICKCHART_BASE_URL}?c=${encodeURIComponent(configJson)}&w=600&h=400&bkg=white&f=png`;
    response = await fetch(chartUrl);
  }

  if (!response.ok) {
    throw new Error(`QuickChart API error: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Map our chart types to Chart.js types
 */
function mapChartType(chartType) {
  const mapping = {
    'bar': 'bar',
    'line': 'line',
    'doughnut': 'doughnut',
    'pie': 'pie',
    'horizontalBar': 'horizontalBar',
    'radar': 'radar',
    'funnel': 'horizontalBar', // Funnel is simulated with horizontal bar
  };
  return mapping[chartType] || 'bar';
}

/**
 * Check if chart type needs scales
 */
function needsScales(chartType) {
  return ['bar', 'line', 'horizontalBar', 'funnel'].includes(chartType);
}

/**
 * Get background colors based on chart type
 */
function getBackgroundColors(chartType, colors, datasetIndex, dataLength) {
  if (['doughnut', 'pie'].includes(chartType)) {
    // For pie/doughnut, each segment needs a different color
    return colors.slice(0, dataLength);
  }
  // For other charts, use single color with transparency for fills
  const color = colors[datasetIndex % colors.length];
  return chartType === 'bar' ? color : `${color}33`;
}

/**
 * Generate an abstract illustration as SVG
 */
function generateIllustration(spec) {
  const illustrationType = spec.illustration_type || 'abstract';
  const theme = selectTheme(spec.description);

  let svg;
  switch (illustrationType) {
    case 'abstract':
      svg = generateAbstractSVG(theme, spec.title);
      break;
    case 'icon_composition':
      svg = generateIconCompositionSVG(theme, spec.title);
      break;
    case 'gradient_scene':
      svg = generateGradientSceneSVG(theme, spec.title);
      break;
    default:
      svg = generateAbstractSVG(theme, spec.title);
  }

  return Buffer.from(svg, 'utf-8');
}

/**
 * Select theme based on description keywords
 */
function selectTheme(description = '') {
  const desc = description.toLowerCase();
  if (desc.includes('growth') || desc.includes('increase') || desc.includes('success')) {
    return ILLUSTRATION_THEMES.growth;
  }
  if (desc.includes('disrupt') || desc.includes('crisis') || desc.includes('challenge')) {
    return ILLUSTRATION_THEMES.disruption;
  }
  if (desc.includes('innovat') || desc.includes('creative') || desc.includes('new')) {
    return ILLUSTRATION_THEMES.innovation;
  }
  if (desc.includes('decision') || desc.includes('choice') || desc.includes('trade')) {
    return ILLUSTRATION_THEMES.decision;
  }
  return ILLUSTRATION_THEMES.strategy;
}

/**
 * Generate abstract geometric SVG
 */
function generateAbstractSVG(theme, title) {
  const seed = hashString(title);
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
  <rect width="600" height="400" fill="${theme.bg}"/>
  ${shapes.join('\n  ')}
</svg>`;
}

/**
 * Generate icon composition SVG
 */
function generateIconCompositionSVG(theme, title) {
  const seed = hashString(title);
  const icons = [];

  // Simple icon shapes representing business/tech concepts
  const iconPaths = [
    // Lightbulb (innovation)
    'M12 2C8.13 2 5 5.13 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.87-3.13-7-7-7zm0 2c2.76 0 5 2.24 5 5 0 1.63-.79 3.09-2 4v2H9v-2c-1.21-.91-2-2.37-2-4 0-2.76 2.24-5 5-5z',
    // Chart (metrics)
    'M3 3v18h18v-2H5V3H3zm4 14h2v-4H7v4zm4 0h2V7h-2v10zm4 0h2v-6h-2v6z',
    // Users (team)
    'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
    // Gear (process)
    'M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
    // Target (goal)
    'M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
  ];

  for (let i = 0; i < 6; i++) {
    const x = pseudoRandom(seed + i * 100) * 400 + 100;
    const y = pseudoRandom(seed + i * 200) * 250 + 75;
    const scale = pseudoRandom(seed + i * 300) * 1.5 + 1;
    const iconIndex = Math.floor(pseudoRandom(seed + i * 400) * iconPaths.length);
    const color = i % 3 === 0 ? theme.primary : (i % 3 === 1 ? theme.secondary : theme.accent);
    const opacity = pseudoRandom(seed + i * 500) * 0.5 + 0.5;

    icons.push(`<g transform="translate(${x}, ${y}) scale(${scale})" opacity="${opacity}">
      <path d="${iconPaths[iconIndex]}" fill="${color}"/>
    </g>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400">
  <rect width="600" height="400" fill="${theme.bg}"/>
  ${icons.join('\n  ')}
</svg>`;
}

/**
 * Generate gradient scene SVG
 */
function generateGradientSceneSVG(theme, title) {
  const seed = hashString(title);

  // Create flowing curves
  const curves = [];
  for (let i = 0; i < 4; i++) {
    const startY = 100 + i * 80;
    const cp1x = pseudoRandom(seed + i * 100) * 200 + 100;
    const cp1y = pseudoRandom(seed + i * 200) * 100 + startY - 50;
    const cp2x = pseudoRandom(seed + i * 300) * 200 + 300;
    const cp2y = pseudoRandom(seed + i * 400) * 100 + startY + 50;
    const endY = startY + pseudoRandom(seed + i * 500) * 40 - 20;

    const opacity = 0.3 - i * 0.05;
    curves.push(`<path d="M0 ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, 600 ${endY} L600 400 L0 400 Z" fill="url(#grad${i})" opacity="${opacity}"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400">
  <defs>
    <linearGradient id="grad0" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${theme.primary};stop-opacity:1"/>
      <stop offset="100%" style="stop-color:${theme.secondary};stop-opacity:1"/>
    </linearGradient>
    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${theme.secondary};stop-opacity:1"/>
      <stop offset="100%" style="stop-color:${theme.accent};stop-opacity:1"/>
    </linearGradient>
    <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${theme.accent};stop-opacity:1"/>
      <stop offset="100%" style="stop-color:${theme.primary};stop-opacity:1"/>
    </linearGradient>
    <linearGradient id="grad3" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${theme.primary};stop-opacity:0.5"/>
      <stop offset="100%" style="stop-color:${theme.secondary};stop-opacity:0.5"/>
    </linearGradient>
  </defs>
  <rect width="600" height="400" fill="${theme.bg}"/>
  ${curves.join('\n  ')}
</svg>`;
}

/**
 * Upload visual to Supabase Storage
 */
async function uploadToStorage(fileName, data, contentType) {
  // Ensure bucket exists (this would normally be done once during setup)
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(fileName, data, {
      contentType: contentType,
      upsert: true,
    });

  if (uploadError) {
    // If bucket doesn't exist, try to create it
    if (uploadError.message?.includes('Bucket not found')) {
      console.log('  📦 Creating storage bucket...');
      const { error: bucketError } = await supabase.storage.createBucket(STORAGE_BUCKET, {
        public: true,
        fileSizeLimit: 5 * 1024 * 1024, // 5MB
      });
      if (bucketError) {
        throw new Error(`Failed to create storage bucket: ${bucketError.message}`);
      }
      // Retry upload
      const { error: retryError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(fileName, data, {
          contentType: contentType,
          upsert: true,
        });
      if (retryError) throw retryError;
    } else {
      throw uploadError;
    }
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(fileName);

  return urlData.publicUrl;
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
 * Generate visuals directly from chart URL (for quick chart generation without storage)
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