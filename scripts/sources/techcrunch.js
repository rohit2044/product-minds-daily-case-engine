/**
 * TechCrunch RSS Feed Fetcher
 * 
 * Fetches recent startup/product news from TechCrunch RSS feed.
 * Focuses on product launches, pivots, and company strategy articles.
 */

import Parser from 'rss-parser';

const RSS_URL = 'https://techcrunch.com/feed/';

// Keywords that indicate PM-relevant content
const RELEVANT_KEYWORDS = [
  'launch', 'pivot', 'growth', 'retention', 'users', 'product',
  'feature', 'strategy', 'funding', 'acquisition', 'metric',
  'churn', 'engagement', 'monetization', 'pricing', 'freemium',
  'expansion', 'market', 'competition', 'startup', 'scale'
];

// Categories to prioritize
const PRIORITY_CATEGORIES = [
  'startups', 'apps', 'enterprise', 'fintech', 'health',
  'transportation', 'ecommerce'
];

export async function fetchFromTechCrunch() {
  const parser = new Parser({
    customFields: {
      item: ['content:encoded', 'dc:creator']
    }
  });

  console.log('  Fetching TechCrunch RSS...');
  const feed = await parser.parseURL(RSS_URL);
  
  // Score and filter articles
  const scoredArticles = feed.items
    .slice(0, 30) // Only check recent 30
    .map(item => ({
      ...item,
      relevanceScore: scoreArticle(item),
    }))
    .filter(item => item.relevanceScore > 2)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);

  if (scoredArticles.length === 0) {
    throw new Error('No relevant articles found in TechCrunch feed');
  }

  // Pick a random one from top 5 to add variety
  const topArticles = scoredArticles.slice(0, 5);
  const selected = topArticles[Math.floor(Math.random() * topArticles.length)];

  console.log(`  Selected: "${selected.title}" (score: ${selected.relevanceScore})`);

  // Extract company name from title if possible
  const companyName = extractCompanyName(selected.title);

  // Get full content
  const content = selected['content:encoded'] || selected.contentSnippet || selected.content;
  
  // Clean HTML
  const cleanContent = stripHtml(content);

  return {
    title: selected.title,
    content: cleanContent,
    sourceUrl: selected.link,
    companyName,
    publishedAt: selected.pubDate,
    author: selected['dc:creator'] || selected.creator,
  };
}

function scoreArticle(item) {
  let score = 0;
  const text = `${item.title} ${item.contentSnippet || ''}`.toLowerCase();
  
  // Check for relevant keywords
  for (const keyword of RELEVANT_KEYWORDS) {
    if (text.includes(keyword)) score += 1;
  }
  
  // Check categories
  const categories = item.categories || [];
  for (const cat of categories) {
    if (PRIORITY_CATEGORIES.some(p => cat.toLowerCase().includes(p))) {
      score += 2;
    }
  }
  
  // Bonus for specific PM-relevant patterns
  if (text.includes('million users') || text.includes('billion')) score += 2;
  if (text.includes('raised') && text.includes('series')) score += 1;
  if (text.includes('shutting down') || text.includes('pivot')) score += 3;
  if (text.includes('acqui')) score += 2;
  
  // Penalty for listicles and non-substantive content
  if (item.title.match(/^\d+ /)) score -= 2; // "10 things..."
  if (text.includes('techcrunch+')) score -= 1; // Paywalled
  
  return score;
}

function extractCompanyName(title) {
  // Common patterns: "Company raises...", "Company launches...", "Company's new..."
  const patterns = [
    /^([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)?)\s+(?:raises|launches|announces|unveils|introduces|expands|pivots|acquires|is|has|gets)/,
    /^([A-Z][a-zA-Z0-9]+(?:\.[a-z]+)?)\s*[,:']/,
    /^(?:How|Why|What)\s+([A-Z][a-zA-Z0-9]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) return match[1];
  }
  
  return null;
}

function stripHtml(html) {
  if (!html) return '';
  
  return html
    // Remove scripts and styles
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Remove HTML tags
    .replace(/<[^>]+>/g, ' ')
    // Decode common HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Clean up whitespace
    .replace(/\s+/g, ' ')
    .trim();
}
