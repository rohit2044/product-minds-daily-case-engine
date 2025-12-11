/**
 * Archive.org Historical News Fetcher
 * 
 * Fetches archived tech news from the Wayback Machine
 * for historical case studies with hindsight perspective.
 */

const WAYBACK_API = 'https://archive.org/wayback/available';

// Historical moments that make great case studies (with known archived URLs)
const HISTORICAL_MOMENTS = [
  {
    title: 'iPhone Launch Announcement',
    date: '2007-01-09',
    url: 'https://www.apple.com/pr/library/2007/01/09Apple-Reinvents-the-Phone-with-iPhone.html',
    company: 'Apple',
    context: 'Apple announces the iPhone, combining phone, iPod, and internet device. Competitors dismissed it.',
  },
  {
    title: 'Netflix Streaming Launch',
    date: '2007-01-16',
    url: 'https://techcrunch.com/2007/01/16/netflix-to-offer-movie-downloads/',
    company: 'Netflix',
    context: 'Netflix announces streaming as a "bonus" feature. DVD by mail was still the core business.',
  },
  {
    title: 'Airbnb Seed Round Story',
    date: '2009-01-01',
    url: 'https://techcrunch.com/2008/08/11/airbed-and-breakfast-takes-bed-and-breakfast-concept-to-the-masses/',
    company: 'Airbnb',
    context: 'Airbnb (then AirBed & Breakfast) was rejected by investors. They sold cereal boxes to stay alive.',
  },
  {
    title: 'Twitter Turns Down Facebook Acquisition',
    date: '2008-11-24',
    url: 'https://techcrunch.com/2008/11/24/facebook-wanted-to-buy-twitter-for-500-million/',
    company: 'Twitter',
    context: 'Twitter reportedly turned down a $500 million acquisition offer from Facebook.',
  },
  {
    title: 'Instagram Acquisition by Facebook',
    date: '2012-04-09',
    url: 'https://techcrunch.com/2012/04/09/facebook-to-acquire-instagram-for-1-billion/',
    company: 'Instagram',
    context: 'Facebook acquires Instagram for $1B, a 13-person company with no revenue. Controversial at the time.',
  },
  {
    title: 'Slack Pivot from Game to Enterprise',
    date: '2014-02-12',
    url: 'https://techcrunch.com/2014/02/12/slack-blows-past-its-initial-8000-strong-beta-waitlist/',
    company: 'Slack',
    context: 'Slack, originally internal tool for a failed game company, launches publicly to massive demand.',
  },
  {
    title: 'Uber and Lyft Launch War',
    date: '2014-08-12',
    url: 'https://techcrunch.com/2014/08/12/uber-lyft-recruiter/',
    company: 'Uber',
    context: 'Peak competition between Uber and Lyft with aggressive tactics and driver poaching.',
  },
  {
    title: 'Microsoft Acquires LinkedIn',
    date: '2016-06-13',
    url: 'https://techcrunch.com/2016/06/13/microsoft-to-buy-linkedin-for-26b-in-cash/',
    company: 'Microsoft',
    context: 'Microsoft pays $26.2B for LinkedIn, its largest acquisition. Many questioned the fit.',
  },
  {
    title: 'Snapchat Rejects Facebook Offer',
    date: '2013-11-13',
    url: 'https://techcrunch.com/2013/11/13/facebook-reportedly-offered-3-billion-to-buy-snapchat/',
    company: 'Snapchat',
    context: 'Snapchat turns down $3 billion offer from Facebook. Evan Spiegel was 23 years old.',
  },
  {
    title: 'WeWork IPO Filing',
    date: '2019-08-14',
    url: 'https://techcrunch.com/2019/08/14/softbank-backed-wework-files-confidentially-for-ipo/',
    company: 'WeWork',
    context: 'WeWork files for IPO at $47B valuation. The S-1 revealed governance issues that crashed the deal.',
  },
  {
    title: 'Zoom IPO During Video Conferencing Rise',
    date: '2019-04-18',
    url: 'https://techcrunch.com/2019/04/18/zoom-closes-up-72-in-first-day-of-trading/',
    company: 'Zoom',
    context: 'Zoom IPOs at $16B, up 72% first day. A year later, pandemic would make it essential.',
  },
  {
    title: 'TikTok Becomes Most Downloaded App',
    date: '2018-10-01',
    url: 'https://techcrunch.com/2018/11/02/tiktok-surpassed-facebook-instagram-youtube-snapchat/',
    company: 'TikTok',
    context: 'TikTok (via Musical.ly acquisition) surpasses all major apps in downloads. Algorithm-first approach wins.',
  },
  {
    title: 'Amazon Prime Day Introduction',
    date: '2015-07-15',
    url: 'https://techcrunch.com/2015/07/09/amazon-to-hold-prime-day-on-july-15th-with-deals-bigger-than-black-friday/',
    company: 'Amazon',
    context: 'Amazon invents a shopping holiday. Critics called it a gimmick. It became bigger than Black Friday.',
  },
  {
    title: 'Apple Removes Headphone Jack',
    date: '2016-09-07',
    url: 'https://techcrunch.com/2016/09/07/apple-removes-the-headphone-jack/',
    company: 'Apple',
    context: 'Apple removes the 3.5mm jack from iPhone 7. Called "courage" - mocked at the time, normalized within 2 years.',
  },
  {
    title: 'Spotify Direct Listing',
    date: '2018-04-03',
    url: 'https://techcrunch.com/2018/04/03/spotify-closes-at-149-01/',
    company: 'Spotify',
    context: 'Spotify goes public via direct listing instead of traditional IPO. Pioneered a new path to public markets.',
  },
];

let recentlyUsed = new Set();

export async function fetchFromArchiveOrg() {
  console.log('  Selecting historical moment...');
  
  // Filter available moments
  const available = HISTORICAL_MOMENTS.filter(m => !recentlyUsed.has(m.title));
  if (available.length < 5) {
    recentlyUsed.clear();
  }
  
  // Random selection
  const moment = available[Math.floor(Math.random() * available.length)];
  recentlyUsed.add(moment.title);
  
  console.log(`  Selected: ${moment.title} (${moment.date})`);
  
  // Try to get archived version
  let archivedContent = null;
  try {
    archivedContent = await fetchArchivedPage(moment.url, moment.date);
  } catch (error) {
    console.log(`  Could not fetch archived page: ${error.message}`);
  }
  
  // Generate rich context for case study
  const content = `
HISTORICAL TECH MOMENT
======================

EVENT: ${moment.title}
DATE: ${moment.date}
COMPANY: ${moment.company}

WHAT HAPPENED:
${moment.context}

HINDSIGHT CONTEXT:
Looking back from today, we know how this decision played out. But at the time,
the outcome was far from certain. Many observers and experts predicted differently.

${archivedContent ? `
CONTEMPORARY COVERAGE:
${archivedContent.substring(0, 2000)}
` : ''}

CASE STUDY DIRECTION:
Create a case study that puts the reader AT THE MOMENT of this decision, BEFORE
the outcome was known. Use dramatic irony - the reader may know how it turned out,
but the case should capture the uncertainty and stakes of the decision.

Consider:
1. What information was available vs. unknown at the time?
2. What were the arguments FOR and AGAINST the decision?
3. What risks seemed most significant then vs. what actually mattered?
4. What can PMs learn from this decision-making process?

Make the reader feel the weight of the decision as if they were there.
  `.trim();
  
  return {
    title: moment.title,
    content: content,
    sourceUrl: moment.url,
    companyName: moment.company,
    year: parseInt(moment.date.split('-')[0]),
    originalDate: moment.date,
    industry: 'Technology',
  };
}

async function fetchArchivedPage(url, date) {
  try {
    // Check Wayback Machine for archived version
    const timestamp = date.replace(/-/g, '');
    const waybackUrl = `https://web.archive.org/web/${timestamp}/${url}`;
    
    const response = await fetch(waybackUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ProductMindsBot/1.0)',
      },
      timeout: 10000,
    });
    
    if (!response.ok) return null;
    
    const html = await response.text();
    
    // Extract main content
    return extractMainContent(html);
  } catch (error) {
    return null;
  }
}

function extractMainContent(html) {
  // Remove scripts, styles, navigation
  let content = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
  
  // Try to find article content
  const articleMatch = content.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch) content = articleMatch[1];
  
  // Strip HTML tags
  content = content
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  
  return content;
}

// Export for reference
export { HISTORICAL_MOMENTS };
