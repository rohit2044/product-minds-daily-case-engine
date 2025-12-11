/**
 * Product Hunt Fetcher
 * 
 * Fetches recent product launches that could make interesting
 * go-to-market and early-stage product case studies.
 */

// Product Hunt's public feed (no API key needed for basic access)
const PH_UPCOMING_FEED = 'https://www.producthunt.com/feed';

// Categories that tend to have interesting PM stories
const INTERESTING_CATEGORIES = [
  'saas', 'productivity', 'developer-tools', 'fintech', 'health',
  'marketing', 'design-tools', 'ai', 'no-code', 'analytics'
];

export async function fetchFromProductHunt() {
  console.log('  Fetching from Product Hunt...');
  
  // Fetch the RSS feed
  const response = await fetch(PH_UPCOMING_FEED);
  const text = await response.text();
  
  // Parse RSS manually (simple approach)
  const items = parseRssFeed(text);
  
  if (items.length === 0) {
    throw new Error('No items found in Product Hunt feed');
  }
  
  // Score and filter
  const scoredItems = items
    .map(item => ({
      ...item,
      relevanceScore: scoreProduct(item),
    }))
    .filter(i => i.relevanceScore > 1)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
  
  // Pick from top 5
  const top = scoredItems.slice(0, 5);
  const selected = top[Math.floor(Math.random() * top.length)];
  
  console.log(`  Selected: "${selected.title}"`);
  
  // Create rich content for case study generation
  const content = `
PRODUCT HUNT LAUNCH ANALYSIS
============================

PRODUCT: ${selected.title}
TAGLINE: ${selected.description || 'N/A'}
LAUNCH URL: ${selected.link}

This is a RECENTLY LAUNCHED PRODUCT on Product Hunt.

CONTEXT FOR CASE STUDY:
Product Hunt launches represent real go-to-market decisions made by founders and PMs.
Consider these angles:
1. What problem is this product solving? Is the positioning clear?
2. Who is the target user? How would you validate PMF?
3. What would a growth strategy look like for this type of product?
4. What competitive dynamics might they face?
5. How would you prioritize the first year roadmap?

Create a case study that puts the reader in the position of:
- A PM at this company deciding on launch strategy
- A competing PM who sees this launch and needs to respond
- An investor evaluating this product's potential
- A PM who needs to identify if their company should build this

Make it feel like a real strategic moment, not a generic exercise.
  `.trim();
  
  return {
    title: selected.title,
    content: content,
    sourceUrl: selected.link,
    companyName: selected.title.split(' ')[0], // Use first word as company name
    description: selected.description,
    industry: 'Startup/Tech',
  };
}

function parseRssFeed(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemContent = match[1];
    
    const title = extractTag(itemContent, 'title');
    const link = extractTag(itemContent, 'link');
    const description = extractTag(itemContent, 'description');
    const pubDate = extractTag(itemContent, 'pubDate');
    
    if (title && link) {
      items.push({
        title: cleanHtml(title),
        link,
        description: cleanHtml(description),
        pubDate,
      });
    }
  }
  
  return items;
}

function extractTag(content, tagName) {
  const regex = new RegExp(`<${tagName}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tagName}>|<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = content.match(regex);
  return match ? (match[1] || match[2]) : null;
}

function cleanHtml(text) {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function scoreProduct(item) {
  let score = 0;
  const title = item.title?.toLowerCase() || '';
  const desc = item.description?.toLowerCase() || '';
  const text = `${title} ${desc}`;
  
  // Interesting product types
  if (text.includes('ai') || text.includes('artificial intelligence')) score += 2;
  if (text.includes('saas') || text.includes('platform')) score += 1;
  if (text.includes('api')) score += 1;
  if (text.includes('no-code') || text.includes('nocode')) score += 1;
  if (text.includes('analytics') || text.includes('insights')) score += 1;
  
  // Business model indicators
  if (text.includes('free') || text.includes('freemium')) score += 1;
  if (text.includes('teams') || text.includes('enterprise')) score += 1;
  
  // Problem indicators
  if (text.includes('automate') || text.includes('save time')) score += 1;
  if (text.includes('replace') || text.includes('alternative')) score += 2;
  
  // Penalty for certain types
  if (text.includes('nft') || text.includes('crypto') || text.includes('web3')) score -= 2;
  if (text.includes('game') && !text.includes('gamif')) score -= 1;
  
  return score;
}
