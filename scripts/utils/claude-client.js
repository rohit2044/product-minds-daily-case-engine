/**
 * Claude Client Utility
 * 
 * Centralized Anthropic Claude API client for case study generation.
 */

import Anthropic from '@anthropic-ai/sdk';

// Validate environment variable
const apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey) {
  throw new Error('Missing ANTHROPIC_API_KEY environment variable');
}

// Initialize Anthropic client
export const anthropic = new Anthropic({
  apiKey: apiKey,
});

// Model configuration
export const MODEL_CONFIG = {
  model: 'claude-sonnet-4-20250514',
  maxTokens: 2000,
  // Pricing per million tokens (as of 2024)
  pricing: {
    input: 0.003,   // $3 per million input tokens
    output: 0.015,  // $15 per million output tokens
  },
};

/**
 * Generate a case study from raw content
 */
export async function generateCaseStudy(rawContent, sourceType, systemPrompt) {
  const sourceTypePromptAdditions = {
    'historical_wikipedia': `This is a HISTORICAL case. Write as if the reader is facing the decision at the time it happened. Use dramatic irony - the reader might know how things turned out, but the challenge should capture the uncertainty of the moment.`,
    'historical_archive': `This is a HISTORICAL case from archived news. Emphasize the uncertainty that existed at the time and what information was and wasn't available.`,
    'live_news_techcrunch': `This is based on CURRENT NEWS. Frame it as a live scenario where the reader could actually influence the outcome. Connect it to broader industry trends.`,
    'live_news_hackernews': `This is based on CURRENT TECH NEWS. The situation may still be unfolding. Consider what competitors might be thinking.`,
    'live_news_producthunt': `This is about a NEW PRODUCT LAUNCH. Focus on go-to-market decisions, positioning, and early-stage product strategy.`,
    'company_blog': `This is from OFFICIAL COMPANY SOURCES. Find the interesting tension beneath the polished PR narrative. Consider what's NOT being said.`,
    'company_sec_filing': `This is from SEC FILINGS. Look for strategic decisions revealed in the financial data and risk factors.`,
    'framework_classic': `This is a CLASSIC PM FRAMEWORK case. Make it feel fresh by adding modern context while teaching the framework through application.`,
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

Generate a case study with the following structure. Respond ONLY with valid JSON, no markdown:

{
  "title": "A compelling, slightly provocative title (not generic)",
  "hook": "Opening 1-2 sentences that grab attention with tension or surprise",
  "story_content": "The main narrative (400-600 words, NO bullet points, prose only)",
  "challenge_prompt": "The question for the reader (50-100 words, specific and actionable)",
  "hints": ["hint1", "hint2", "hint3"],
  "difficulty": "beginner|intermediate|advanced",
  "frameworks_applicable": ["Framework1", "Framework2"],
  "industry": "Industry category",
  "tags": ["tag1", "tag2", "tag3"],
  "company_name": "Company name if identifiable"
}`;

  const startTime = Date.now();

  try {
    const response = await anthropic.messages.create({
      model: MODEL_CONFIG.model,
      max_tokens: MODEL_CONFIG.maxTokens,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        }
      ],
    });

    const duration = Date.now() - startTime;
    const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
    const costUsd = calculateCost(response.usage);

    // Parse the response
    const content = response.content[0].text;
    const caseStudy = parseJsonResponse(content);

    // Add metadata
    caseStudy._meta = {
      tokensUsed,
      costUsd,
      durationMs: duration,
      model: MODEL_CONFIG.model,
    };

    return caseStudy;

  } catch (error) {
    console.error('Claude API error:', error.message);
    throw error;
  }
}

/**
 * Parse JSON from Claude's response
 */
function parseJsonResponse(content) {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('No JSON found in response');
    }
  } catch (parseError) {
    console.error('Failed to parse Claude response:', content.substring(0, 500));
    throw new Error(`JSON parse failed: ${parseError.message}`);
  }
}

/**
 * Calculate cost based on token usage
 */
function calculateCost(usage) {
  const inputCost = (usage.input_tokens * MODEL_CONFIG.pricing.input) / 1000;
  const outputCost = (usage.output_tokens * MODEL_CONFIG.pricing.output) / 1000;
  return inputCost + outputCost;
}

/**
 * Simple completion for utility tasks
 */
export async function simpleCompletion(prompt, maxTokens = 500) {
  const response = await anthropic.messages.create({
    model: MODEL_CONFIG.model,
    max_tokens: maxTokens,
    messages: [
      {
        role: 'user',
        content: prompt,
      }
    ],
  });

  return response.content[0].text;
}

/**
 * Generate embeddings using Claude (text features extraction)
 * Note: This is a simplified approach. For production, consider using
 * OpenAI's embedding API or a dedicated embedding service.
 */
export async function generateTextFeatures(text) {
  const prompt = `Extract the key themes and concepts from this text as a comma-separated list of keywords (max 20):

${text.substring(0, 1000)}

Respond with ONLY the comma-separated keywords, nothing else.`;

  try {
    const response = await simpleCompletion(prompt, 100);
    return response.split(',').map(k => k.trim().toLowerCase());
  } catch (error) {
    console.error('Failed to generate text features:', error.message);
    return [];
  }
}

/**
 * Validate case study quality
 */
export function validateCaseStudy(caseStudy) {
  const errors = [];

  if (!caseStudy.title || caseStudy.title.length < 10) {
    errors.push('Title is too short or missing');
  }

  if (!caseStudy.hook || caseStudy.hook.length < 20) {
    errors.push('Hook is too short or missing');
  }

  if (!caseStudy.story_content || caseStudy.story_content.length < 500) {
    errors.push('Story content is too short (min 500 chars)');
  }

  if (caseStudy.story_content && caseStudy.story_content.length > 5000) {
    errors.push('Story content is too long (max 5000 chars)');
  }

  if (!caseStudy.challenge_prompt || caseStudy.challenge_prompt.length < 50) {
    errors.push('Challenge prompt is too short (min 50 chars)');
  }

  // Check for bullet points in story (we don't want them)
  if (caseStudy.story_content && /^[\s]*[-•*]\s/m.test(caseStudy.story_content)) {
    errors.push('Story content contains bullet points');
  }

  if (!caseStudy.difficulty || !['beginner', 'intermediate', 'advanced'].includes(caseStudy.difficulty)) {
    errors.push('Invalid or missing difficulty level');
  }

  if (!Array.isArray(caseStudy.frameworks_applicable) || caseStudy.frameworks_applicable.length === 0) {
    errors.push('Missing frameworks_applicable array');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export default anthropic;
