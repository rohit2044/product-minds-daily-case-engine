import 'dotenv/config';
/**
 * Product Minds - Case Study Generator
 * 
 * Main orchestrator that:
 * 1. Determines which source to scrape based on day rotation
 * 2. Fetches raw content from the source
 * 3. Transforms it via Groq API (Llama) into a story-driven case study
 * 4. Checks for duplicates
 * 5. Stores in Supabase
 */

import Groq from 'groq-sdk';
import { createClient } from '@supabase/supabase-js';
import { fetchFromWikipedia } from './sources/wikipedia.js';
import { fetchFromTechCrunch } from './sources/techcrunch.js';
import { fetchFromHackerNews } from './sources/hackernews.js';
import { fetchFromCompanyBlogs } from './sources/company-blogs.js';
import { fetchFromSECEdgar } from './sources/sec-edgar.js';
import { fetchFromProductHunt } from './sources/producthunt.js';
import { fetchFromArchiveOrg } from './sources/archive-org.js';
import { generateFrameworkCase } from './sources/framework-cases.js';
import { STORYTELLING_PROMPT } from './prompts/storytelling-system-prompt.js';
import { checkDuplication, generateEmbedding } from './utils/deduplication.js';
import crypto from 'crypto';

// Initialize clients
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Model configuration
const MODEL_CONFIG = {
  model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  maxTokens: 1500,
  // Groq pricing for llama-3.3-70b-versatile
  pricing: {
    input: 0.00059,   // $0.59 per million input tokens
    output: 0.00079,  // $0.79 per million output tokens
  },
};

// Source rotation configuration
const SOURCE_ROTATION = {
  0: { type: 'framework_classic', fetcher: generateFrameworkCase, name: 'Framework Deep-dive' },
  1: { type: 'historical_wikipedia', fetcher: fetchFromWikipedia, name: 'Wikipedia Historical' },
  2: { type: 'historical_archive', fetcher: fetchFromArchiveOrg, name: 'Archive.org Historical' },
  3: { type: 'live_news_techcrunch', fetcher: fetchFromTechCrunch, name: 'TechCrunch News' },
  4: { type: 'live_news_hackernews', fetcher: fetchFromHackerNews, name: 'Hacker News' },
  5: { type: 'company_blog', fetcher: fetchFromCompanyBlogs, name: 'Company Blogs' },
  6: { type: 'company_sec_filing', fetcher: fetchFromSECEdgar, name: 'SEC Filings' },
};

/**
 * Main entry point - generates case studies for today
 */
export async function generateDailyCases(options = {}) {
  const {
    count = 1,           // Number of cases to generate
    forceSourceType,     // Override automatic source selection
    dryRun = false,      // Don't save to database
  } = options;

  const dayOfWeek = new Date().getDay();
  const sourceConfig = forceSourceType
    ? Object.values(SOURCE_ROTATION).find(s => s.type === forceSourceType)
    : SOURCE_ROTATION[dayOfWeek];

  console.log(`\n🚀 Starting case generation`);
  console.log(`📅 Day of week: ${dayOfWeek} (${sourceConfig.name})`);
  console.log(`🎯 Target cases: ${count}`);
  console.log(`🤖 Using model: ${MODEL_CONFIG.model}`);
  console.log(`${dryRun ? '🧪 DRY RUN MODE' : '💾 Will save to database'}\n`);

  const results = {
    generated: [],
    skipped: [],
    failed: [],
  };

  for (let i = 0; i < count; i++) {
    console.log(`\n--- Generating case ${i + 1}/${count} ---`);

    const logEntry = await createLogEntry(sourceConfig.type);

    try {
      // Step 1: Fetch raw content from source
      console.log(`📥 Fetching from ${sourceConfig.name}...`);
      const startFetch = Date.now();
      const rawContent = await sourceConfig.fetcher();
      const fetchDuration = Date.now() - startFetch;
      console.log(`✅ Fetched in ${fetchDuration}ms`);

      if (!rawContent || !rawContent.content) {
        throw new Error('No content returned from source');
      }

      // Update log with raw content
      await updateLogEntry(logEntry.id, {
        source_url: rawContent.sourceUrl,
        raw_content: rawContent.content.substring(0, 10000), // Limit storage
        scrape_duration_ms: fetchDuration,
      });

      // Step 2: Transform via Groq (Llama)
      console.log(`🤖 Transforming with ${MODEL_CONFIG.model}...`);
      const startTransform = Date.now();
      const caseStudy = await transformToCaseStudy(rawContent, sourceConfig.type);
      const transformDuration = Date.now() - startTransform;
      console.log(`✅ Transformed in ${transformDuration}ms`);

      // Step 3: Check for duplicates
      console.log(`🔍 Checking for duplicates...`);
      const embedding = await generateEmbedding(caseStudy.story_content);
      const duplicateCheck = await checkDuplication(
        supabase,
        embedding,
        caseStudy.company_name
      );

      if (duplicateCheck.isDuplicate) {
        console.log(`⚠️ Skipped - too similar to existing case (${duplicateCheck.similarity.toFixed(2)} similarity)`);

        await updateLogEntry(logEntry.id, {
          status: 'skipped_duplicate',
          similarity_score: duplicateCheck.similarity,
          similar_to_case_id: duplicateCheck.similarCaseId,
          transform_duration_ms: transformDuration,
        });

        results.skipped.push({
          reason: 'duplicate',
          similarity: duplicateCheck.similarity,
          similarTo: duplicateCheck.similarCaseId,
        });
        continue;
      }

      // Step 4: Save to database
      if (!dryRun) {
        console.log(`💾 Saving to database...`);
        const contentHash = crypto
          .createHash('md5')
          .update(caseStudy.story_content)
          .digest('hex');

        const { data: savedCase, error } = await supabase
          .from('case_studies')
          .insert({
            title: caseStudy.title,
            hook: caseStudy.hook,
            story_content: caseStudy.story_content,
            challenge_prompt: caseStudy.challenge_prompt,
            hints: caseStudy.hints,
            source_type: sourceConfig.type,
            source_url: rawContent.sourceUrl,
            source_title: rawContent.title,
            company_name: rawContent.companyName || caseStudy.company_name,
            industry: caseStudy.industry,
            difficulty: caseStudy.difficulty,
            question_type: caseStudy.question_type,
            seniority_level: caseStudy.seniority_level,
            frameworks_applicable: caseStudy.frameworks_applicable,
            tags: caseStudy.tags,
            content_embedding: embedding,
            content_hash: contentHash,
            generation_log_id: logEntry.id,
          })
          .select()
          .single();

        if (error) throw error;

        await updateLogEntry(logEntry.id, {
          status: 'completed',
          case_study_id: savedCase.id,
          transform_duration_ms: transformDuration,
          tokens_used: caseStudy._meta?.tokensUsed,
          cost_usd: caseStudy._meta?.costUsd,
        });

        console.log(`✅ Saved case: "${savedCase.title}" (${savedCase.id})`);
        results.generated.push(savedCase);
      } else {
        console.log(`🧪 [Dry run] Would save: "${caseStudy.title}"`);
        results.generated.push(caseStudy);
      }

    } catch (error) {
      console.error(`❌ Failed with full error:`, JSON.stringify(error, null, 2));
      console.error(`Error type:`, typeof error);
      console.error(`Error keys:`, Object.keys(error || {}));

      if (error?.response) {
        console.error(`Response status:`, error.response.status);
        console.error(`Response data:`, error.response.data);
      }

      if (error?.cause) {
        console.error(`Cause:`, error.cause);
      }

      await updateLogEntry(logEntry.id, {
        status: 'failed',
        error_message: JSON.stringify(error),
      });

      results.failed.push({
        error: JSON.stringify(error),
        logId: logEntry.id,
      });
    }
  }

  // Print summary
  console.log(`\n========== SUMMARY ==========`);
  console.log(`✅ Generated: ${results.generated.length}`);
  console.log(`⏭️ Skipped: ${results.skipped.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`==============================\n`);

  return results;
}

/**
 * Transform raw content into a case study using Groq (Llama)
 */
async function transformToCaseStudy(rawContent, sourceType) {
  const sourceTypePromptAdditions = {
    'historical_wikipedia': `This is a HISTORICAL case. Write as if the reader is facing the decision at the time it happened.`,
    'historical_archive': `This is a HISTORICAL case from archived news. Emphasize the uncertainty that existed at the time.`,
    'live_news_techcrunch': `This is based on CURRENT NEWS. Frame it as a live scenario.`,
    'live_news_hackernews': `This is based on CURRENT TECH NEWS. Connect it to broader industry trends.`,
    'live_news_producthunt': `This is about a NEW PRODUCT LAUNCH. Focus on go-to-market decisions.`,
    'company_blog': `This is from OFFICIAL COMPANY SOURCES. Find the interesting tension beneath the PR narrative.`,
    'company_sec_filing': `This is from SEC FILINGS. Look for strategic decisions revealed in the financial data.`,
    'framework_classic': `This is a CLASSIC PM FRAMEWORK case. Add a modern twist while teaching the framework.`,
  };

  const userPrompt = `Transform the following raw content into an engaging PM case study.

SOURCE TYPE: ${sourceType}
COMPANY/SUBJECT: ${rawContent.companyName || 'Unknown'}
ORIGINAL SOURCE: ${rawContent.sourceUrl || 'N/A'}
RAW CONTENT:
---
${rawContent.content}
---

${sourceTypePromptAdditions[sourceType] || ''}

Generate a case study with the following structure. Respond ONLY with valid JSON:

{
  "title": "A compelling, slightly provocative title",
  "hook": "Opening 1-2 sentences that grab attention",
  "story_content": "The main narrative (400-600 words, NO bullet points)",
  "challenge_prompt": "The question for the reader (50-100 words)",
  "hints": ["hint1", "hint2"],
  "difficulty": "beginner|intermediate|advanced",
  "question_type": "One of: Brainstorming, Strategy, Product Design, Product Improvement, Estimation, Metrics Definition, Root Cause Analysis, Execution, Technical Tradeoffs, Prioritization, Market Entry, Competitive Analysis, Pricing, Go-to-Market",
  "seniority_level": 0-3 (0=Entry-level/APM, 1=Mid-level PM, 2=Senior PM, 3=Lead/Principal/Director+),
  "frameworks_applicable": ["Framework1", "Framework2"],
  "industry": "Industry category",
  "tags": ["tag1", "tag2", "tag3"],
  "company_name": "Company name if identifiable"
}`;

  const startTime = Date.now();

  const response = await groq.chat.completions.create({
    model: MODEL_CONFIG.model,
    max_tokens: MODEL_CONFIG.maxTokens,
    messages: [
      {
        role: 'system',
        content: STORYTELLING_PROMPT,
      },
      {
        role: 'user',
        content: userPrompt,
      }
    ],
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  const duration = Date.now() - startTime;
  const promptTokens = response.usage?.prompt_tokens || 0;
  const completionTokens = response.usage?.completion_tokens || 0;
  const tokensUsed = promptTokens + completionTokens;

  // Calculate cost using Groq pricing
  const costUsd = (promptTokens * MODEL_CONFIG.pricing.input + completionTokens * MODEL_CONFIG.pricing.output) / 1000;

  // Parse the response
  const content = response.choices[0]?.message?.content;
  let caseStudy;

  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      caseStudy = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('No JSON found in response');
    }
  } catch (parseError) {
    console.error('Failed to parse LLM response:', content?.substring(0, 500));
    throw new Error(`JSON parse failed: ${parseError.message}`);
  }

  // Add metadata
  caseStudy._meta = {
    tokensUsed,
    costUsd,
    durationMs: duration,
    model: MODEL_CONFIG.model,
  };

  return caseStudy;
}

/**
 * Create a log entry for tracking
 */
async function createLogEntry(sourceType) {
  const { data, error } = await supabase
    .from('generation_logs')
    .insert({
      status: 'processing',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update a log entry
 */
async function updateLogEntry(id, updates) {
  const { error } = await supabase
    .from('generation_logs')
    .update(updates)
    .eq('id', id);

  if (error) console.error('Failed to update log:', error);
}

/**
 * Get buffer status
 */
export async function getBufferStatus() {
  const { data, error } = await supabase.rpc('get_buffer_status');
  if (error) throw error;
  return data[0];
}

/**
 * Schedule cases for upcoming days
 */
export async function scheduleUpcomingDays(daysAhead = 14) {
  const scheduled = [];

  for (let i = 0; i < daysAhead; i++) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + i);
    const dateStr = targetDate.toISOString().split('T')[0];

    // Check if already scheduled
    const { data: existing } = await supabase
      .from('case_studies')
      .select('id')
      .eq('scheduled_date', dateStr)
      .single();

    if (!existing) {
      const { data: caseId } = await supabase.rpc('schedule_next_case', {
        target_date: dateStr,
      });

      if (caseId) {
        scheduled.push({ date: dateStr, caseId });
        console.log(`📅 Scheduled case ${caseId} for ${dateStr}`);
      } else {
        console.log(`⚠️ No case available for ${dateStr}`);
      }
    }
  }

  return scheduled;
}

// Run if called directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const count = parseInt(args.find(a => a.startsWith('--count='))?.split('=')[1]) || 1;

  generateDailyCases({ count, dryRun })
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}