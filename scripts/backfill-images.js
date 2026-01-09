#!/usr/bin/env node
import 'dotenv/config';
/**
 * Backfill Images Script
 *
 * Regenerates images for existing case studies using the intelligent chart generator.
 * Uses Groq LLM to create contextually relevant charts based on case study content.
 *
 * Usage:
 *   npm run backfill-images                    # Regenerate all pending/failed
 *   npm run backfill-images -- --all           # Regenerate all cases
 *   npm run backfill-images -- --failed        # Only failed cases
 *   npm run backfill-images -- --pending       # Only pending cases
 *   npm run backfill-images -- --limit=10      # Limit to N cases
 *   npm run backfill-images -- --case=UUID     # Single case by ID
 *   npm run backfill-images -- --dry-run       # Preview without changes
 *   npm run backfill-images -- --force         # Force regenerate even if completed
 */

import { createClient } from '@supabase/supabase-js';
import { generateIntelligentChart, deleteExistingVisuals } from './utils/intelligent-chart-generator.js';

// Validate required environment variables
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'GROQ_API_KEY'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Configuration
const CONFIG = {
  batchSize: 5,              // Process N cases at a time
  delayBetweenCases: 2000,   // 2 seconds between cases to respect rate limits
  delayBetweenBatches: 5000, // 5 seconds between batches
  maxRetries: 2,             // Max retries per case on failure
};

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    all: false,
    failed: false,
    pending: false,
    limit: null,
    caseId: null,
    dryRun: false,
    force: false,
  };

  for (const arg of args) {
    if (arg === '--all') options.all = true;
    else if (arg === '--failed') options.failed = true;
    else if (arg === '--pending') options.pending = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--force') options.force = true;
    else if (arg.startsWith('--limit=')) {
      const val = parseInt(arg.split('=')[1], 10);
      if (!isNaN(val) && val > 0) options.limit = val;
    }
    else if (arg.startsWith('--case=')) {
      options.caseId = arg.split('=')[1];
    }
  }

  // Default to pending + failed if no specific filter
  if (!options.all && !options.failed && !options.pending && !options.caseId) {
    options.pending = true;
    options.failed = true;
  }

  return options;
}

/**
 * Fetch case studies that need image regeneration
 */
async function fetchCasesToProcess(options) {
  console.log('\n📋 Fetching case studies to process...\n');

  let query = supabase
    .from('case_studies')
    .select(`
      id,
      title,
      company_name,
      industry,
      question_type,
      the_question,
      what_happened,
      mental_model,
      summary,
      tags,
      image_prompt,
      charts,
      image_generation_status
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  // Apply filters
  if (options.caseId) {
    query = query.eq('id', options.caseId);
  } else if (!options.all && !options.force) {
    const statusFilters = [];
    if (options.pending) statusFilters.push('pending');
    if (options.failed) statusFilters.push('failed');

    if (statusFilters.length > 0) {
      query = query.in('image_generation_status', statusFilters);
    }
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data: cases, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch cases: ${error.message}`);
  }

  return cases || [];
}

/**
 * Process a single case study
 */
async function processCase(caseStudy, options, retryCount = 0) {
  const caseId = caseStudy.id;
  const title = caseStudy.title || 'Untitled';

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📝 Processing: ${title.substring(0, 50)}${title.length > 50 ? '...' : ''}`);
  console.log(`   ID: ${caseId}`);
  console.log(`   Status: ${caseStudy.image_generation_status || 'unknown'}`);
  console.log(`   Company: ${caseStudy.company_name || 'Unknown'}`);
  console.log(`   Industry: ${caseStudy.industry || 'Unknown'}`);

  if (options.dryRun) {
    console.log(`   🧪 [DRY RUN] Would regenerate chart for this case`);
    return { success: true, dryRun: true };
  }

  try {
    // Step 1: Update status to 'generating'
    await supabase
      .from('case_studies')
      .update({ image_generation_status: 'generating' })
      .eq('id', caseId);

    // Step 2: Delete existing visuals
    console.log(`   🗑️ Cleaning up existing visuals...`);
    await deleteExistingVisuals(caseId);

    // Step 3: Generate new intelligent chart
    console.log(`   🧠 Generating intelligent chart...`);
    const chart = await generateIntelligentChart(supabase, caseId, caseStudy);

    if (!chart) {
      throw new Error('Chart generation returned null');
    }

    // Step 4: Update case study with new chart
    const { error: updateError } = await supabase
      .from('case_studies')
      .update({
        charts: [chart],
        image_generation_status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', caseId);

    if (updateError) {
      throw new Error(`Database update failed: ${updateError.message}`);
    }

    console.log(`   ✅ Successfully generated chart: ${chart.type}`);
    console.log(`   📊 Title: ${chart.title}`);
    console.log(`   🔗 URL: ${chart.url}`);

    return {
      success: true,
      caseId,
      chartType: chart.type,
      chartTitle: chart.title,
      url: chart.url,
    };

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);

    // Retry logic
    if (retryCount < CONFIG.maxRetries) {
      console.log(`   🔄 Retrying (${retryCount + 1}/${CONFIG.maxRetries})...`);
      await sleep(CONFIG.delayBetweenCases);
      return processCase(caseStudy, options, retryCount + 1);
    }

    // Mark as failed after retries exhausted
    await supabase
      .from('case_studies')
      .update({
        image_generation_status: 'failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', caseId);

    return {
      success: false,
      caseId,
      error: error.message,
    };
  }
}

/**
 * Process all cases in batches
 */
async function processCases(cases, options) {
  const results = {
    total: cases.length,
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    details: [],
  };

  if (cases.length === 0) {
    console.log('\n✅ No cases found matching the criteria.');
    return results;
  }

  console.log(`\n🚀 Starting backfill for ${cases.length} case(s)...`);
  console.log(`   Batch size: ${CONFIG.batchSize}`);
  console.log(`   Delay between cases: ${CONFIG.delayBetweenCases}ms`);
  console.log(`   Dry run: ${options.dryRun ? 'Yes' : 'No'}`);

  const startTime = Date.now();

  // Process in batches
  for (let i = 0; i < cases.length; i += CONFIG.batchSize) {
    const batch = cases.slice(i, i + CONFIG.batchSize);
    const batchNum = Math.floor(i / CONFIG.batchSize) + 1;
    const totalBatches = Math.ceil(cases.length / CONFIG.batchSize);

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📦 BATCH ${batchNum}/${totalBatches} (${batch.length} cases)`);
    console.log(`${'═'.repeat(60)}`);

    for (let j = 0; j < batch.length; j++) {
      const caseStudy = batch[j];

      // Skip if already completed and not forcing
      if (caseStudy.image_generation_status === 'completed' && !options.force) {
        console.log(`\n⏭️ Skipping completed case: ${caseStudy.title?.substring(0, 40)}...`);
        results.skipped++;
        results.details.push({
          caseId: caseStudy.id,
          status: 'skipped',
          reason: 'already completed',
        });
        continue;
      }

      const result = await processCase(caseStudy, options);
      results.processed++;
      results.details.push(result);

      if (result.success) {
        results.succeeded++;
      } else {
        results.failed++;
      }

      // Delay between cases (except for last in batch)
      if (j < batch.length - 1) {
        await sleep(CONFIG.delayBetweenCases);
      }
    }

    // Delay between batches (except for last batch)
    if (i + CONFIG.batchSize < cases.length) {
      console.log(`\n⏳ Waiting ${CONFIG.delayBetweenBatches / 1000}s before next batch...`);
      await sleep(CONFIG.delayBetweenBatches);
    }
  }

  const duration = Date.now() - startTime;
  return { ...results, durationMs: duration };
}

/**
 * Print summary report
 */
function printSummary(results) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 BACKFILL SUMMARY`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`   Total cases:     ${results.total}`);
  console.log(`   Processed:       ${results.processed}`);
  console.log(`   ✅ Succeeded:    ${results.succeeded}`);
  console.log(`   ❌ Failed:       ${results.failed}`);
  console.log(`   ⏭️ Skipped:      ${results.skipped}`);
  console.log(`   ⏱️ Duration:     ${(results.durationMs / 1000).toFixed(1)}s`);
  console.log(`${'═'.repeat(60)}\n`);

  if (results.failed > 0) {
    console.log(`❌ Failed cases:`);
    results.details
      .filter(d => !d.success && d.error)
      .forEach(d => {
        console.log(`   - ${d.caseId}: ${d.error}`);
      });
    console.log('');
  }

  if (results.succeeded > 0) {
    console.log(`✅ Successfully processed cases:`);
    results.details
      .filter(d => d.success && !d.dryRun)
      .slice(0, 10) // Show first 10
      .forEach(d => {
        console.log(`   - ${d.caseId}: ${d.chartType} - ${d.chartTitle}`);
      });
    if (results.succeeded > 10) {
      console.log(`   ... and ${results.succeeded - 10} more`);
    }
    console.log('');
  }
}

/**
 * Helper sleep function
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main entry point
 */
async function main() {
  console.log(`
${'═'.repeat(60)}
🖼️  PRODUCT MINDS - IMAGE BACKFILL UTILITY
${'═'.repeat(60)}
`);

  try {
    // Parse arguments
    const options = parseArgs();

    console.log('📋 Options:');
    console.log(`   All cases: ${options.all}`);
    console.log(`   Failed only: ${options.failed}`);
    console.log(`   Pending only: ${options.pending}`);
    console.log(`   Limit: ${options.limit || 'none'}`);
    console.log(`   Case ID: ${options.caseId || 'none'}`);
    console.log(`   Dry run: ${options.dryRun}`);
    console.log(`   Force: ${options.force}`);

    // Fetch cases
    const cases = await fetchCasesToProcess(options);
    console.log(`\n📦 Found ${cases.length} case(s) to process`);

    if (cases.length === 0) {
      console.log('\n✅ No cases need processing. All images are up to date!');
      process.exit(0);
    }

    // Process cases
    const results = await processCases(cases, options);

    // Print summary
    printSummary(results);

    // Exit with error code if any failures
    process.exit(results.failed > 0 ? 1 : 0);

  } catch (error) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
main();

export { fetchCasesToProcess, processCase, processCases };