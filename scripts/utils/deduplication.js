/**
 * Deduplication Utility
 * 
 * Uses embeddings to detect semantically similar case studies
 * and prevent repetitive content.
 */

// Similarity threshold - cases above this are considered duplicates
const SIMILARITY_THRESHOLD = 0.85;

// Minimum days before same company can appear again
const COMPANY_COOLDOWN_DAYS = 60;

/**
 * Generate embedding for content
 * Note: This uses a feature-based approach. For production, consider using
 * a dedicated embedding service like OpenAI's text-embedding-3-small or
 * a local model.
 */
export async function generateEmbedding(content) {
  // This is a feature-based approach that creates a pseudo-embedding from content features
  // For better accuracy, consider integrating with an embedding API
  const features = extractFeatures(content);
  return features;
}

/**
 * Extract feature vector from content (placeholder for real embeddings)
 */
function extractFeatures(content) {
  const text = content.toLowerCase();

  // Extract key signals (this is a simplified approach)
  const features = [];

  // Company/brand mentions
  const companies = [
    'apple', 'google', 'amazon', 'meta', 'facebook', 'microsoft', 'netflix',
    'spotify', 'uber', 'airbnb', 'slack', 'zoom', 'shopify', 'stripe',
    'twitter', 'instagram', 'tiktok', 'snapchat', 'linkedin', 'pinterest'
  ];
  companies.forEach(c => features.push(text.includes(c) ? 1 : 0));

  // Topic signals
  const topics = [
    'growth', 'retention', 'churn', 'pricing', 'monetization', 'launch',
    'pivot', 'acquisition', 'competition', 'platform', 'marketplace',
    'subscription', 'freemium', 'enterprise', 'consumer', 'mobile',
    'ai', 'machine learning', 'algorithm', 'data', 'privacy',
    'regulation', 'expansion', 'international', 'partnership'
  ];
  topics.forEach(t => features.push(text.includes(t) ? 1 : 0));

  // Framework mentions
  const frameworks = [
    'rice', 'ice', 'jobs to be done', 'jtbd', 'north star', 'aarrr',
    'pirate metrics', 'okr', 'kpi', 'a/b test', 'cohort', 'funnel',
    'tam', 'sam', 'som', 'pmf', 'product market fit'
  ];
  frameworks.forEach(f => features.push(text.includes(f) ? 1 : 0));

  // Normalize to 1536 dimensions (standard embedding size)
  // Pad with zeros
  while (features.length < 1536) {
    features.push(0);
  }

  return features;
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Check if content is a duplicate of existing cases
 */
export async function checkDuplication(supabase, embedding, companyName) {
  // Check 1: Company cooldown
  if (companyName) {
    const { data: recentCompanyCases } = await supabase
      .from('case_studies')
      .select('id, title, created_at')
      .eq('company_name', companyName)
      .gte('created_at', new Date(Date.now() - COMPANY_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString())
      .limit(1);

    if (recentCompanyCases && recentCompanyCases.length > 0) {
      return {
        isDuplicate: true,
        reason: 'company_cooldown',
        similarity: 1.0,
        similarCaseId: recentCompanyCases[0].id,
        message: `Company "${companyName}" was used ${COMPANY_COOLDOWN_DAYS} days ago`,
      };
    }
  }

  // Check 2: Content similarity via embeddings
  // Note: This uses Supabase's vector similarity search
  // If your Supabase doesn't have pgvector, use the fallback approach
  try {
    const { data: similarCases, error } = await supabase.rpc('find_similar_cases', {
      query_embedding: embedding,
      similarity_threshold: SIMILARITY_THRESHOLD,
      company: null,
      days_lookback: 90,
    });

    if (!error && similarCases && similarCases.length > 0) {
      const mostSimilar = similarCases[0];
      return {
        isDuplicate: true,
        reason: 'content_similarity',
        similarity: mostSimilar.similarity,
        similarCaseId: mostSimilar.case_id,
        message: `Too similar to "${mostSimilar.title}" (${(mostSimilar.similarity * 100).toFixed(1)}% match)`,
      };
    }
  } catch (error) {
    // Fallback: Simple text-based deduplication
    console.log('  Vector search not available, using fallback dedup');
    return await fallbackDeduplication(supabase, embedding, companyName);
  }

  return {
    isDuplicate: false,
    reason: null,
    similarity: 0,
    similarCaseId: null,
  };
}

/**
 * Fallback deduplication without vector database
 */
async function fallbackDeduplication(supabase, features, companyName) {
  // Get recent cases
  const { data: recentCases } = await supabase
    .from('case_studies')
    .select('id, title, story_content, company_name')
    .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
    .limit(100);

  if (!recentCases || recentCases.length === 0) {
    return { isDuplicate: false, reason: null, similarity: 0 };
  }

  // Compare features
  for (const existingCase of recentCases) {
    const existingFeatures = extractFeatures(existingCase.story_content);
    const similarity = cosineSimilarity(features, existingFeatures);

    if (similarity > SIMILARITY_THRESHOLD) {
      return {
        isDuplicate: true,
        reason: 'content_similarity',
        similarity,
        similarCaseId: existingCase.id,
        message: `Too similar to "${existingCase.title}" (${(similarity * 100).toFixed(1)}% match)`,
      };
    }
  }

  return { isDuplicate: false, reason: null, similarity: 0 };
}

/**
 * Get deduplication stats
 */
export async function getDeduplicationStats(supabase) {
  const { data: logs } = await supabase
    .from('generation_logs')
    .select('status, similarity_score')
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  if (!logs) return null;

  const total = logs.length;
  const duplicates = logs.filter(l => l.status === 'skipped_duplicate').length;
  const avgSimilarity = duplicates > 0
    ? logs.filter(l => l.status === 'skipped_duplicate')
        .reduce((sum, l) => sum + (l.similarity_score || 0), 0) / duplicates
    : 0;

  return {
    totalAttempts: total,
    duplicatesSkipped: duplicates,
    duplicateRate: total > 0 ? (duplicates / total * 100).toFixed(1) + '%' : '0%',
    avgSimilarityOfDuplicates: (avgSimilarity * 100).toFixed(1) + '%',
  };
}