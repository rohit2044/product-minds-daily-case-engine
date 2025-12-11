/**
 * Wikipedia Fetcher for Historical Product Cases
 * 
 * Fetches content about historical product launches, company pivots,
 * and business decisions from Wikipedia.
 */

const WIKIPEDIA_API = 'https://en.wikipedia.org/api/rest_v1';

// Curated list of historically significant product/company events
// These are known to have good Wikipedia coverage
const HISTORICAL_TOPICS = [
  // Iconic product launches
  { title: 'iPod', company: 'Apple', year: 2001, tags: ['hardware', 'consumer', 'disruption'] },
  { title: 'iPhone', company: 'Apple', year: 2007, tags: ['mobile', 'platform', 'disruption'] },
  { title: 'App_Store_(iOS)', company: 'Apple', year: 2008, tags: ['platform', 'marketplace', 'ecosystem'] },
  { title: 'Gmail', company: 'Google', year: 2004, tags: ['email', 'freemium', 'storage'] },
  { title: 'Google_Maps', company: 'Google', year: 2005, tags: ['maps', 'acquisition', 'platform'] },
  { title: 'Amazon_Prime', company: 'Amazon', year: 2005, tags: ['subscription', 'loyalty', 'logistics'] },
  { title: 'Kindle', company: 'Amazon', year: 2007, tags: ['hardware', 'ecosystem', 'publishing'] },
  { title: 'Netflix', company: 'Netflix', year: 1997, tags: ['streaming', 'pivot', 'disruption'] },
  { title: 'Spotify', company: 'Spotify', year: 2008, tags: ['streaming', 'freemium', 'music'] },
  { title: 'Uber', company: 'Uber', year: 2009, tags: ['marketplace', 'ridesharing', 'disruption'] },
  { title: 'Airbnb', company: 'Airbnb', year: 2008, tags: ['marketplace', 'sharing_economy', 'trust'] },
  { title: 'Slack_(software)', company: 'Slack', year: 2013, tags: ['enterprise', 'pivot', 'communication'] },
  { title: 'Zoom_Video_Communications', company: 'Zoom', year: 2011, tags: ['video', 'enterprise', 'growth'] },
  { title: 'TikTok', company: 'ByteDance', year: 2016, tags: ['social', 'algorithm', 'growth'] },
  
  // Pivots and transformations
  { title: 'Instagram', company: 'Instagram', year: 2010, tags: ['pivot', 'social', 'mobile'] },
  { title: 'YouTube', company: 'Google', year: 2005, tags: ['video', 'ugc', 'acquisition'] },
  { title: 'Twitter', company: 'Twitter', year: 2006, tags: ['social', 'pivot', 'microblogging'] },
  { title: 'PayPal', company: 'PayPal', year: 1998, tags: ['fintech', 'pivot', 'payments'] },
  { title: 'Shopify', company: 'Shopify', year: 2006, tags: ['ecommerce', 'platform', 'pivot'] },
  
  // Famous failures and shutdowns
  { title: 'Google_Reader', company: 'Google', year: 2013, tags: ['shutdown', 'rss', 'engagement'] },
  { title: 'Vine_(service)', company: 'Twitter', year: 2016, tags: ['shutdown', 'video', 'competition'] },
  { title: 'Google_Plus', company: 'Google', year: 2019, tags: ['shutdown', 'social', 'strategy'] },
  { title: 'Windows_Phone', company: 'Microsoft', year: 2017, tags: ['shutdown', 'mobile', 'platform'] },
  { title: 'Fire_Phone', company: 'Amazon', year: 2015, tags: ['failure', 'hardware', 'mobile'] },
  { title: 'Quibi', company: 'Quibi', year: 2020, tags: ['failure', 'streaming', 'mobile'] },
  
  // Acquisitions
  { title: 'Acquisition_of_Instagram_by_Facebook', company: 'Meta', year: 2012, tags: ['acquisition', 'social', 'strategy'] },
  { title: 'Acquisition_of_WhatsApp_by_Facebook', company: 'Meta', year: 2014, tags: ['acquisition', 'messaging', 'strategy'] },
  { title: 'Acquisition_of_LinkedIn_by_Microsoft', company: 'Microsoft', year: 2016, tags: ['acquisition', 'enterprise', 'social'] },
  { title: 'Acquisition_of_GitHub_by_Microsoft', company: 'Microsoft', year: 2018, tags: ['acquisition', 'developer', 'platform'] },
  
  // Classic business cases
  { title: 'Coca-Cola_formula', company: 'Coca-Cola', year: 1985, tags: ['branding', 'failure', 'new_coke'] },
  { title: 'Blockbuster_LLC', company: 'Blockbuster', year: 2010, tags: ['disruption', 'failure', 'retail'] },
  { title: 'Kodak', company: 'Kodak', year: 2012, tags: ['disruption', 'failure', 'digital'] },
  { title: 'Nokia', company: 'Nokia', year: 2014, tags: ['disruption', 'failure', 'mobile'] },
  { title: 'Blackberry', company: 'Blackberry', year: 2016, tags: ['disruption', 'failure', 'mobile'] },
];

// Track recently used topics to avoid repetition
let recentlyUsed = new Set();

export async function fetchFromWikipedia() {
  console.log('  Selecting historical topic...');
  
  // Filter out recently used topics
  const available = HISTORICAL_TOPICS.filter(t => !recentlyUsed.has(t.title));
  
  // Reset if we've used too many
  if (available.length < 5) {
    recentlyUsed.clear();
  }
  
  // Random selection
  const selected = available[Math.floor(Math.random() * available.length)];
  recentlyUsed.add(selected.title);
  
  console.log(`  Selected topic: ${selected.title} (${selected.company}, ${selected.year})`);
  
  // Fetch Wikipedia content
  const content = await fetchWikipediaArticle(selected.title);
  
  if (!content) {
    throw new Error(`Failed to fetch Wikipedia article: ${selected.title}`);
  }
  
  return {
    title: selected.title.replace(/_/g, ' '),
    content: content,
    sourceUrl: `https://en.wikipedia.org/wiki/${selected.title}`,
    companyName: selected.company,
    year: selected.year,
    tags: selected.tags,
  };
}

async function fetchWikipediaArticle(title) {
  try {
    // Fetch the article summary and extract
    const summaryUrl = `${WIKIPEDIA_API}/page/summary/${encodeURIComponent(title)}`;
    const summaryResponse = await fetch(summaryUrl);
    const summaryData = await summaryResponse.json();
    
    // Fetch full article content
    const contentUrl = `${WIKIPEDIA_API}/page/html/${encodeURIComponent(title)}`;
    const contentResponse = await fetch(contentUrl);
    const htmlContent = await contentResponse.text();
    
    // Extract and clean content
    const cleanedContent = extractWikipediaContent(htmlContent);
    
    // Combine summary and relevant sections
    const fullContent = `
SUMMARY:
${summaryData.extract || ''}

FULL CONTENT:
${cleanedContent}
    `.trim();
    
    return fullContent;
    
  } catch (error) {
    console.error(`  Error fetching Wikipedia: ${error.message}`);
    return null;
  }
}

function extractWikipediaContent(html) {
  // Remove references, navigation, etc.
  let content = html
    // Remove reference markers
    .replace(/<sup[^>]*class="[^"]*reference[^"]*"[^>]*>[\s\S]*?<\/sup>/gi, '')
    // Remove edit links
    .replace(/<span[^>]*class="[^"]*mw-editsection[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '')
    // Remove navigation boxes
    .replace(/<div[^>]*class="[^"]*navbox[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
    // Remove info boxes (keep the text but remove the box)
    .replace(/<table[^>]*class="[^"]*infobox[^"]*"[^>]*>[\s\S]*?<\/table>/gi, '')
    // Remove citation needed
    .replace(/\[citation needed\]/gi, '')
    // Remove style tags
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Extract section content
  const sections = [];
  
  // Get introduction (before first heading)
  const introMatch = content.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (introMatch) {
    sections.push(stripHtmlTags(introMatch[1]));
  }
  
  // Get History section
  const historyMatch = content.match(/<h2[^>]*>[\s\S]*?History[\s\S]*?<\/h2>([\s\S]*?)(?=<h2|$)/i);
  if (historyMatch) {
    sections.push('HISTORY:\n' + extractParagraphs(historyMatch[1]));
  }
  
  // Get Products/Services section
  const productsMatch = content.match(/<h2[^>]*>[\s\S]*?(?:Products|Services|Platform)[\s\S]*?<\/h2>([\s\S]*?)(?=<h2|$)/i);
  if (productsMatch) {
    sections.push('PRODUCTS/SERVICES:\n' + extractParagraphs(productsMatch[1]));
  }
  
  // Get Business model section
  const businessMatch = content.match(/<h2[^>]*>[\s\S]*?(?:Business|Revenue|Model)[\s\S]*?<\/h2>([\s\S]*?)(?=<h2|$)/i);
  if (businessMatch) {
    sections.push('BUSINESS MODEL:\n' + extractParagraphs(businessMatch[1]));
  }
  
  // Get Controversies/Criticism if exists
  const controversyMatch = content.match(/<h2[^>]*>[\s\S]*?(?:Controversy|Criticism|Reception)[\s\S]*?<\/h2>([\s\S]*?)(?=<h2|$)/i);
  if (controversyMatch) {
    sections.push('CHALLENGES/CRITICISM:\n' + extractParagraphs(controversyMatch[1]));
  }
  
  // Combine and limit content
  const combined = sections.join('\n\n');
  return combined.substring(0, 5000); // Limit for Claude context
}

function extractParagraphs(html) {
  const paragraphs = [];
  const regex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  
  while ((match = regex.exec(html)) !== null && paragraphs.length < 5) {
    const text = stripHtmlTags(match[1]).trim();
    if (text.length > 50) { // Skip very short paragraphs
      paragraphs.push(text);
    }
  }
  
  return paragraphs.join('\n\n');
}

function stripHtmlTags(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Export topics for seeding
export { HISTORICAL_TOPICS };
