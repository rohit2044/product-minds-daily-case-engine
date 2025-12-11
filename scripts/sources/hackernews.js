/**
 * Hacker News API Fetcher
 * 
 * Fetches top stories from Hacker News that are relevant for PM case studies.
 * Focuses on startup stories, product discussions, and business strategy.
 */

const HN_API_BASE = 'https://hacker-news.firebaseio.com/v0';

// Keywords that indicate PM-relevant content
const RELEVANT_KEYWORDS = [
  'startup', 'product', 'launch', 'pivot', 'growth', 'users',
  'retention', 'churn', 'monetization', 'pricing', 'feature',
  'strategy', 'market', 'competition', 'scale', 'acquisition',
  'shutdown', 'postmortem', 'lessons', 'mistake', 'success',
  'failed', 'billion', 'million', 'series', 'funding', 'ipo'
];

// Domains that tend to have good PM content
const PRIORITY_DOMAINS = [
  'stratechery.com', 'producthabits.com', 'lennysnewsletter.com',
  'firstround.com', 'a16z.com', 'sequoiacap.com', 'ycombinator.com',
  'intercom.com', 'amplitude.com', 'mixpanel.com', 'segment.com',
  'blog.google', 'engineering.fb.com', 'netflixtechblog.com',
  'uber.com/blog', 'airbnb.io', 'stripe.com/blog', 'spotify.design',
  'medium.com', 'substack.com'
];

export async function fetchFromHackerNews() {
  console.log('  Fetching Hacker News top stories...');
  
  // Get top story IDs
  const response = await fetch(`${HN_API_BASE}/topstories.json`);
  const storyIds = await response.json();
  
  // Fetch details for top 50 stories
  const stories = await Promise.all(
    storyIds.slice(0, 50).map(id => fetchStory(id))
  );
  
  // Filter and score stories
  const scoredStories = stories
    .filter(s => s && s.url && s.type === 'story')
    .map(story => ({
      ...story,
      relevanceScore: scoreStory(story),
    }))
    .filter(s => s.relevanceScore > 2)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);

  if (scoredStories.length === 0) {
    throw new Error('No relevant stories found on Hacker News');
  }

  // Pick from top 5 for variety
  const topStories = scoredStories.slice(0, 5);
  const selected = topStories[Math.floor(Math.random() * topStories.length)];

  console.log(`  Selected: "${selected.title}" (score: ${selected.relevanceScore})`);

  // Fetch the actual article content
  const articleContent = await fetchArticleContent(selected.url);
  
  // Extract company name
  const companyName = extractCompanyName(selected.title, selected.url);

  return {
    title: selected.title,
    content: articleContent,
    sourceUrl: selected.url,
    companyName,
    hnUrl: `https://news.ycombinator.com/item?id=${selected.id}`,
    score: selected.score,
    comments: selected.descendants,
  };
}

async function fetchStory(id) {
  try {
    const response = await fetch(`${HN_API_BASE}/item/${id}.json`);
    return await response.json();
  } catch {
    return null;
  }
}

function scoreStory(story) {
  let score = 0;
  const title = story.title.toLowerCase();
  const url = story.url || '';
  
  // Check for relevant keywords in title
  for (const keyword of RELEVANT_KEYWORDS) {
    if (title.includes(keyword)) score += 1.5;
  }
  
  // Check domain
  for (const domain of PRIORITY_DOMAINS) {
    if (url.includes(domain)) {
      score += 3;
      break;
    }
  }
  
  // HN score indicates community interest
  if (story.score > 500) score += 3;
  else if (story.score > 200) score += 2;
  else if (story.score > 100) score += 1;
  
  // Comments indicate discussion-worthy content
  if (story.descendants > 200) score += 2;
  else if (story.descendants > 100) score += 1;
  
  // Bonus for specific patterns
  if (title.includes('how we') || title.includes('how i')) score += 2;
  if (title.includes('postmortem') || title.includes('lessons')) score += 3;
  if (title.includes('why we')) score += 2;
  if (title.match(/\$\d+[mb]/i)) score += 2; // Dollar amounts
  
  // Penalty for certain content types
  if (title.includes('show hn:')) score -= 1;
  if (title.includes('ask hn:')) score -= 2;
  if (url.includes('github.com') && !title.includes('startup')) score -= 2;
  if (url.includes('arxiv.org')) score -= 2;
  
  return score;
}

async function fetchArticleContent(url) {
  try {
    // Use a simple fetch - in production you might use a service like 
    // Mercury Parser or Diffbot for better extraction
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ProductMindsBot/1.0)',
      },
      timeout: 10000,
    });
    
    if (!response.ok) {
      return `[Could not fetch article content. URL: ${url}]`;
    }
    
    const html = await response.text();
    
    // Basic content extraction
    // In production, use a proper readability library
    const content = extractMainContent(html);
    
    return content || `[Article content could not be extracted. URL: ${url}]`;
  } catch (error) {
    return `[Fetch error: ${error.message}. URL: ${url}]`;
  }
}

function extractMainContent(html) {
  // Remove scripts, styles, nav, footer, etc.
  let content = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '');
  
  // Try to find article or main content
  const articleMatch = content.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = content.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  
  if (articleMatch) content = articleMatch[1];
  else if (mainMatch) content = mainMatch[1];
  
  // Strip remaining HTML tags
  content = content
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  
  // Return first ~3000 characters (enough for context)
  return content.substring(0, 3000);
}

function extractCompanyName(title, url) {
  // Try to extract from title
  const patterns = [
    /^(?:How|Why|What)\s+([A-Z][a-zA-Z0-9]+)\s/,
    /^([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)?)\s*[:']/,
    /^([A-Z][a-zA-Z0-9]+)\s+(?:is|was|raised|launched|shut|pivoted)/,
  ];
  
  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) return match[1];
  }
  
  // Try to extract from URL
  try {
    const hostname = new URL(url).hostname;
    const domain = hostname.replace('www.', '').split('.')[0];
    if (domain.length > 2 && !['medium', 'substack', 'github'].includes(domain)) {
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    }
  } catch {}
  
  return null;
}
