/**
 * Company Engineering/Product Blogs Fetcher
 * 
 * Fetches content from official company blogs that discuss
 * product decisions, engineering challenges, and business strategy.
 */

import Parser from 'rss-parser';

// Curated list of company blogs with PM-relevant content
const COMPANY_BLOGS = [
  // Big Tech
  {
    name: 'Spotify Engineering',
    company: 'Spotify',
    rssUrl: 'https://engineering.atspotify.com/feed/',
    industry: 'Music/Streaming',
  },
  {
    name: 'Netflix Tech Blog',
    company: 'Netflix',
    rssUrl: 'https://netflixtechblog.com/feed',
    industry: 'Entertainment/Streaming',
  },
  {
    name: 'Airbnb Engineering',
    company: 'Airbnb',
    rssUrl: 'https://medium.com/feed/airbnb-engineering',
    industry: 'Travel/Marketplace',
  },
  {
    name: 'Uber Engineering',
    company: 'Uber',
    rssUrl: 'https://www.uber.com/blog/engineering/rss/',
    industry: 'Transportation/Marketplace',
  },
  {
    name: 'Stripe Blog',
    company: 'Stripe',
    rssUrl: 'https://stripe.com/blog/feed.rss',
    industry: 'Fintech/Payments',
  },
  {
    name: 'Shopify Engineering',
    company: 'Shopify',
    rssUrl: 'https://shopify.engineering/feed',
    industry: 'E-commerce/Platform',
  },
  {
    name: 'Slack Engineering',
    company: 'Slack',
    rssUrl: 'https://slack.engineering/feed/',
    industry: 'Enterprise/Communication',
  },
  {
    name: 'Discord Blog',
    company: 'Discord',
    rssUrl: 'https://discord.com/blog/rss.xml',
    industry: 'Communication/Gaming',
  },
  {
    name: 'Figma Blog',
    company: 'Figma',
    rssUrl: 'https://www.figma.com/blog/feed/',
    industry: 'Design/SaaS',
  },
  {
    name: 'Notion Blog',
    company: 'Notion',
    rssUrl: 'https://www.notion.so/blog/rss',
    industry: 'Productivity/SaaS',
  },
  {
    name: 'Linear Blog',
    company: 'Linear',
    rssUrl: 'https://linear.app/blog/rss',
    industry: 'Developer Tools/SaaS',
  },
  {
    name: 'Vercel Blog',
    company: 'Vercel',
    rssUrl: 'https://vercel.com/atom',
    industry: 'Developer Tools/Platform',
  },
  
  // Newsletters/Industry Blogs (often have company case studies)
  {
    name: 'First Round Review',
    company: null,
    rssUrl: 'https://review.firstround.com/feed.xml',
    industry: 'Venture/Strategy',
    isIndustryBlog: true,
  },
  {
    name: 'Lenny\'s Newsletter',
    company: null,
    rssUrl: 'https://www.lennysnewsletter.com/feed',
    industry: 'Product Management',
    isIndustryBlog: true,
  },
];

// Keywords that indicate PM-relevant content
const RELEVANT_KEYWORDS = [
  'product', 'launch', 'growth', 'scale', 'decision', 'strategy',
  'user', 'customer', 'metric', 'experiment', 'a/b test',
  'feature', 'roadmap', 'prioritization', 'tradeoff', 'migration',
  'redesign', 'pivot', 'challenge', 'lesson', 'learned',
  'how we', 'why we', 'building', 'shipping'
];

// Track recently used sources
let recentlyUsedBlogs = new Set();

export async function fetchFromCompanyBlogs() {
  const parser = new Parser({
    customFields: {
      item: ['content:encoded', 'dc:creator']
    }
  });

  console.log('  Scanning company blogs...');
  
  // Shuffle and filter available blogs
  const availableBlogs = COMPANY_BLOGS
    .filter(b => !recentlyUsedBlogs.has(b.name))
    .sort(() => Math.random() - 0.5);
  
  if (availableBlogs.length < 3) {
    recentlyUsedBlogs.clear();
  }
  
  // Try each blog until we find good content
  for (const blog of availableBlogs.slice(0, 5)) {
    try {
      console.log(`  Trying: ${blog.name}...`);
      const feed = await parser.parseURL(blog.rssUrl);
      
      // Score and filter articles
      const scoredArticles = feed.items
        .slice(0, 15)
        .map(item => ({
          ...item,
          blog,
          relevanceScore: scoreArticle(item),
        }))
        .filter(item => item.relevanceScore > 2)
        .sort((a, b) => b.relevanceScore - a.relevanceScore);
      
      if (scoredArticles.length > 0) {
        // Pick from top 3
        const topArticles = scoredArticles.slice(0, 3);
        const selected = topArticles[Math.floor(Math.random() * topArticles.length)];
        
        recentlyUsedBlogs.add(blog.name);
        console.log(`  Selected: "${selected.title}" from ${blog.name}`);
        
        // Get full content
        const content = selected['content:encoded'] || selected.content || selected.contentSnippet;
        const cleanContent = stripHtml(content);
        
        return {
          title: selected.title,
          content: cleanContent,
          sourceUrl: selected.link,
          companyName: blog.company,
          industry: blog.industry,
          blogName: blog.name,
          publishedAt: selected.pubDate,
          author: selected['dc:creator'] || selected.creator,
        };
      }
    } catch (error) {
      console.log(`  Failed to fetch ${blog.name}: ${error.message}`);
      continue;
    }
  }
  
  throw new Error('Could not find relevant content from any company blog');
}

function scoreArticle(item) {
  let score = 0;
  const title = item.title?.toLowerCase() || '';
  const content = item.contentSnippet?.toLowerCase() || '';
  const text = `${title} ${content}`;
  
  // Check for relevant keywords
  for (const keyword of RELEVANT_KEYWORDS) {
    if (text.includes(keyword)) score += 1;
  }
  
  // Bonus for specific patterns
  if (title.includes('how we')) score += 3;
  if (title.includes('why we')) score += 3;
  if (title.includes('building')) score += 2;
  if (title.includes('scaling')) score += 2;
  if (title.includes('lessons')) score += 2;
  if (title.includes('behind')) score += 2;
  if (text.includes('million') || text.includes('billion')) score += 2;
  if (text.includes('%')) score += 1; // Has metrics
  
  // Penalty for purely technical content
  if (title.includes('api') && !title.includes('product')) score -= 1;
  if (title.includes('infrastructure') && !text.includes('decision')) score -= 1;
  if (title.includes('kubernetes') || title.includes('terraform')) score -= 2;
  
  // Penalty for hiring/culture posts
  if (title.includes('hiring') || title.includes('joining')) score -= 2;
  if (title.includes('culture') && !text.includes('product')) score -= 1;
  
  // Recency bonus (posts are usually sorted by date, but check anyway)
  const pubDate = new Date(item.pubDate);
  const daysSincePublished = (Date.now() - pubDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSincePublished < 30) score += 1;
  if (daysSincePublished < 7) score += 1;
  
  return score;
}

function stripHtml(html) {
  if (!html) return '';
  
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 5000); // Limit for Claude context
}

// Export blog list for reference
export { COMPANY_BLOGS };
