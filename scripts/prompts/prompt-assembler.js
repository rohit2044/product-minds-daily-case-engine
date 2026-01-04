/**
 * Prompt Assembler
 *
 * Assembles the system prompt from database-stored sections.
 * Supports section overrides and generates a version hash for tracking.
 *
 * NOTE: No longer uses hardcoded fallback prompt.
 * If DB is unavailable, throws an error to prevent generation with outdated prompts.
 */

import { getPromptSections, getConfig } from '../config/config-loader.js';
import { supabase } from '../utils/supabase-client.js';
import crypto from 'crypto';

// Required prompt sections
const REQUIRED_SECTIONS = [
  'prompt_system_intro',
  'prompt_output_schema',
  'prompt_question_types',
  'prompt_mental_models',
  'prompt_answer_structure',
  'prompt_evaluation_criteria',
  'prompt_image_generation',
  'prompt_source_customization',
];

/**
 * Assemble the system prompt from database sections
 * @param {Object} options - Assembly options
 * @param {Object} options.overrides - Section key -> content overrides
 * @param {string[]} options.excludeSections - Section keys to exclude
 * @param {boolean} options.throwOnError - If true, throw error instead of returning partial result
 * @returns {Promise<{prompt: string, versionHash: string, sections: string[]}>}
 */
export async function assembleSystemPrompt(options = {}) {
  const {
    overrides = {},
    excludeSections = [],
    throwOnError = true,
  } = options;

  try {
    // Fetch all prompt sections from database
    const sections = await getPromptSections();

    if (!sections || sections.length === 0) {
      const error = new Error('No prompt sections found in database. Please run migrations to seed configurations.');
      if (throwOnError) throw error;
      console.error(error.message);
      return {
        prompt: '',
        versionHash: '',
        sections: [],
        error: error.message,
      };
    }

    // Validate required sections exist
    const existingKeys = sections.map(s => s.config_key);
    const missingSections = REQUIRED_SECTIONS.filter(k => !existingKeys.includes(k));

    if (missingSections.length > 0) {
      const error = new Error(`Missing required prompt sections: ${missingSections.join(', ')}`);
      if (throwOnError) throw error;
      console.warn(error.message);
    }

    // Build the prompt from sections
    const promptParts = [];
    const includedSections = [];

    for (const section of sections) {
      const key = section.config_key;

      // Skip excluded sections
      if (excludeSections.includes(key)) {
        continue;
      }

      // Use override if provided, otherwise use DB content
      let content;
      if (overrides[key]) {
        content = overrides[key];
      } else {
        content = section.config_value?.content || '';
      }

      if (content) {
        promptParts.push(content);
        includedSections.push(key);
      }
    }

    const prompt = promptParts.join('\n\n');
    const versionHash = generateHash(prompt);

    return {
      prompt,
      versionHash,
      sections: includedSections,
      isFallback: false,
    };
  } catch (error) {
    console.error('Error assembling prompt:', error.message);

    if (throwOnError) {
      throw error;
    }

    return {
      prompt: '',
      versionHash: '',
      sections: [],
      error: error.message,
    };
  }
}

/**
 * Get the assembled prompt using database function (more efficient)
 * @returns {Promise<{prompt: string, versionHash: string}>}
 */
export async function getAssembledPromptFromDB() {
  try {
    const { data, error } = await supabase.rpc('get_assembled_prompt');

    if (error) throw error;

    const prompt = data || '';
    return {
      prompt,
      versionHash: generateHash(prompt),
    };
  } catch (error) {
    console.error('Error getting prompt from DB function:', error.message);
    // Fall back to client-side assembly
    return assembleSystemPrompt({ throwOnError: false });
  }
}

/**
 * Get the current prompt version hash
 * @returns {Promise<string>}
 */
export async function getPromptVersionHash() {
  try {
    const { data, error } = await supabase.rpc('get_prompt_version_hash');

    if (error) throw error;

    return data;
  } catch (error) {
    // Calculate client-side
    const { versionHash } = await assembleSystemPrompt({ throwOnError: false });
    return versionHash;
  }
}

/**
 * Generate MD5 hash of content
 * @param {string} content - Content to hash
 * @returns {string} MD5 hash
 */
function generateHash(content) {
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Get a specific prompt section by key
 * @param {string} key - The section key
 * @returns {Promise<string|null>} The section content
 */
export async function getPromptSection(key) {
  // Validate key
  if (!REQUIRED_SECTIONS.includes(key) && !key.startsWith('prompt_')) {
    console.warn(`Warning: '${key}' is not a known prompt section key`);
  }

  const config = await getConfig(key, { bypassCache: false });

  if (!config) return null;

  // Handle both formats (direct content or wrapped in content property)
  if (typeof config === 'string') return config;
  if (config.content) return config.content;

  return null;
}

/**
 * Preview the assembled prompt (for debugging/admin)
 * @returns {Promise<Object>} Detailed prompt breakdown
 */
export async function previewPrompt() {
  const sections = await getPromptSections();

  const preview = {
    totalSections: sections.length,
    sections: [],
    assembledLength: 0,
    versionHash: '',
    requiredSections: REQUIRED_SECTIONS,
    missingSections: [],
  };

  let fullPrompt = '';
  const existingKeys = [];

  for (const section of sections) {
    const content = section.config_value?.content || '';
    existingKeys.push(section.config_key);
    preview.sections.push({
      key: section.config_key,
      order: section.display_order,
      contentLength: content.length,
      preview: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
    });
    fullPrompt += content + '\n\n';
  }

  preview.missingSections = REQUIRED_SECTIONS.filter(k => !existingKeys.includes(k));
  preview.assembledLength = fullPrompt.length;
  preview.versionHash = generateHash(fullPrompt);

  return preview;
}

/**
 * Validate that all required sections exist
 * @returns {Promise<{valid: boolean, missing: string[], extra: string[]}>}
 */
export async function validatePromptSections() {
  const sections = await getPromptSections();
  const existingKeys = sections.map((s) => s.config_key);

  const missing = REQUIRED_SECTIONS.filter((k) => !existingKeys.includes(k));
  const extra = existingKeys.filter((k) => !REQUIRED_SECTIONS.includes(k));

  return {
    valid: missing.length === 0,
    missing,
    extra,
    existing: existingKeys,
    required: REQUIRED_SECTIONS,
  };
}

/**
 * Get prompt with source-specific customization
 * @param {string} sourceType - The source type for customization
 * @returns {Promise<{prompt: string, versionHash: string}>}
 */
export async function getPromptForSource(sourceType) {
  // Get base prompt
  const { prompt: basePrompt, versionHash, sections } = await assembleSystemPrompt();

  // Add source-specific context
  const sourceContext = getSourceContext(sourceType);

  const fullPrompt = `${basePrompt}\n\n## SOURCE CONTEXT\n${sourceContext}`;

  return {
    prompt: fullPrompt,
    versionHash: generateHash(fullPrompt),
    sourceType,
    sections: [...sections, 'source_context'],
  };
}

/**
 * Get source-specific context instructions
 * @param {string} sourceType - The source type
 * @returns {string}
 */
function getSourceContext(sourceType) {
  const contexts = {
    historical_wikipedia: 'This is a historical case. Emphasize the uncertainty and context of the time period. What did decision-makers know then vs. now?',
    historical_archive: 'This is from archived news. Frame it as a historical lesson with hindsight.',
    live_news_techcrunch: 'This is current news. Frame it as an active scenario the reader might face.',
    live_news_hackernews: 'This comes from tech community discussion. Capture the technical and business tension.',
    live_news_producthunt: 'This is a product launch. Focus on go-to-market strategy and initial traction.',
    company_blog: 'This is from a company blog. Look for the tension beneath the PR narrative.',
    company_earnings: 'This is from earnings/financial data. Extract strategic decisions from the numbers.',
    company_sec_filing: 'This is from SEC filings. Find the strategic decisions hidden in financial disclosure.',
    framework_classic: 'This is a classic framework case. Teach the framework while adding modern relevance.',
    framework_book: 'This is from a business book. Extract the core teaching while making it interview-ready.',
  };

  return contexts[sourceType] || 'Use the source content to create an engaging interview case study.';
}

export default {
  assembleSystemPrompt,
  getAssembledPromptFromDB,
  getPromptVersionHash,
  getPromptSection,
  previewPrompt,
  validatePromptSections,
  getPromptForSource,
  REQUIRED_SECTIONS,
};