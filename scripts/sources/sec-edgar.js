/**
 * SEC Edgar Fetcher
 * 
 * Fetches interesting tidbits from SEC filings (10-K, 10-Q, 8-K)
 * that reveal product strategy, business model changes, and risk factors.
 */

const SEC_API_BASE = 'https://data.sec.gov';

// Companies with interesting product/strategy stories in their filings
const INTERESTING_COMPANIES = [
  { cik: '0001018724', name: 'Amazon', ticker: 'AMZN', industry: 'E-commerce/Cloud' },
  { cik: '0000320193', name: 'Apple', ticker: 'AAPL', industry: 'Consumer Electronics' },
  { cik: '0001652044', name: 'Alphabet/Google', ticker: 'GOOGL', industry: 'Technology/Advertising' },
  { cik: '0001326801', name: 'Meta/Facebook', ticker: 'META', industry: 'Social Media' },
  { cik: '0000789019', name: 'Microsoft', ticker: 'MSFT', industry: 'Software/Cloud' },
  { cik: '0001065280', name: 'Netflix', ticker: 'NFLX', industry: 'Streaming' },
  { cik: '0001639920', name: 'Uber', ticker: 'UBER', industry: 'Transportation' },
  { cik: '0001559720', name: 'Airbnb', ticker: 'ABNB', industry: 'Travel/Marketplace' },
  { cik: '0001564408', name: 'Shopify', ticker: 'SHOP', industry: 'E-commerce Platform' },
  { cik: '0001467858', name: 'Twilio', ticker: 'TWLO', industry: 'Communications API' },
  { cik: '0001477333', name: 'Snap', ticker: 'SNAP', industry: 'Social Media' },
  { cik: '0001792789', name: 'DoorDash', ticker: 'DASH', industry: 'Delivery/Marketplace' },
  { cik: '0001585521', name: 'Dropbox', ticker: 'DBX', industry: 'Cloud Storage' },
  { cik: '0001403161', name: 'Pinterest', ticker: 'PINS', industry: 'Social Media' },
  { cik: '0001730168', name: 'Zoom', ticker: 'ZM', industry: 'Video Communications' },
  { cik: '0001318605', name: 'Tesla', ticker: 'TSLA', industry: 'Automotive/Energy' },
];

let recentlyUsedCompanies = new Set();

export async function fetchFromSECEdgar() {
  console.log('  Selecting company for SEC filing analysis...');
  
  // Filter available companies
  const available = INTERESTING_COMPANIES.filter(c => !recentlyUsedCompanies.has(c.cik));
  if (available.length < 5) {
    recentlyUsedCompanies.clear();
  }
  
  // Random selection
  const company = available[Math.floor(Math.random() * available.length)];
  recentlyUsedCompanies.add(company.cik);
  
  console.log(`  Selected: ${company.name} (${company.ticker})`);
  
  // Fetch recent filings
  const filings = await fetchCompanyFilings(company.cik);
  
  if (!filings || filings.length === 0) {
    throw new Error(`No filings found for ${company.name}`);
  }
  
  // Prefer 10-K (annual) over 10-Q (quarterly)
  const tenK = filings.find(f => f.form === '10-K');
  const selectedFiling = tenK || filings[0];
  
  console.log(`  Found filing: ${selectedFiling.form} from ${selectedFiling.filingDate}`);
  
  // Generate context for Claude
  const content = generateFilingContext(company, selectedFiling);
  
  return {
    title: `${company.name} ${selectedFiling.form} Filing Analysis`,
    content: content,
    sourceUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${company.cik}&type=${selectedFiling.form}`,
    companyName: company.name,
    industry: company.industry,
    filingType: selectedFiling.form,
    filingDate: selectedFiling.filingDate,
    ticker: company.ticker,
  };
}

async function fetchCompanyFilings(cik) {
  try {
    const response = await fetch(`${SEC_API_BASE}/submissions/CIK${cik.padStart(10, '0')}.json`, {
      headers: {
        'User-Agent': 'ProductMinds Educational contact@productminds.com',
        'Accept-Encoding': 'gzip, deflate',
      }
    });
    
    if (!response.ok) {
      throw new Error(`SEC API returned ${response.status}`);
    }
    
    const data = await response.json();
    const filings = data.filings?.recent;
    
    if (!filings) return null;
    
    const relevantFilings = [];
    for (let i = 0; i < Math.min(filings.form.length, 20); i++) {
      if (['10-K', '10-Q', '8-K'].includes(filings.form[i])) {
        relevantFilings.push({
          form: filings.form[i],
          filingDate: filings.filingDate[i],
          accessionNumber: filings.accessionNumber[i],
        });
      }
    }
    
    return relevantFilings;
  } catch (error) {
    console.error(`  Error fetching SEC filings: ${error.message}`);
    return null;
  }
}

function generateFilingContext(company, filing) {
  const filingTypeContext = {
    '10-K': `Annual Report containing complete business description, risk factors, management discussion of financial performance, strategic direction, and competitive landscape analysis. Often reveals strategic decisions and business model evolution not discussed in earnings calls.`,
    '10-Q': `Quarterly Report with updates on financial performance, risk factors, and near-term strategic initiatives. Often reveals short-term pivots and tactical responses to market changes.`,
    '8-K': `Current Report disclosing material events like acquisitions, leadership changes, or strategic shifts. Often reveals sudden strategic decisions.`,
  };

  return `
SEC FILING ANALYSIS CONTEXT
===========================

COMPANY: ${company.name} (${company.ticker})
INDUSTRY: ${company.industry}
FILING TYPE: ${filing.form}
FILING DATE: ${filing.filingDate}

ABOUT THIS FILING:
${filingTypeContext[filing.form] || 'SEC regulatory filing with business and financial disclosures.'}

COMPANY CONTEXT:
${getCompanyContext(company)}

CASE STUDY DIRECTION:
Based on this company's business and this filing type, create a case study exploring one of these angles:
1. A strategic decision the company had to make in their core business
2. A competitive challenge they faced and how they responded
3. A business model evolution or platform expansion decision
4. A risk factor that became a product opportunity
5. A market expansion or new product launch decision

Focus on realistic scenarios that a PM at this company might face.
Use the company's actual business context to ground the narrative.
  `.trim();
}

function getCompanyContext(company) {
  const contexts = {
    'Amazon': 'E-commerce giant that expanded into cloud (AWS), streaming, devices, and logistics. Known for customer obsession and long-term thinking.',
    'Apple': 'Premium consumer electronics company with tight hardware-software integration. Focus on user experience and ecosystem lock-in.',
    'Alphabet/Google': 'Search and advertising giant expanding into cloud, AI, and hardware. Balances innovation with core ad business.',
    'Meta/Facebook': 'Social media company pivoting toward metaverse and AI. Navigating privacy changes and competition from TikTok.',
    'Microsoft': 'Enterprise software giant that successfully pivoted to cloud with Azure. Growing in AI with OpenAI partnership.',
    'Netflix': 'Streaming pioneer facing increased competition. Introduced ads tier and cracked down on password sharing.',
    'Uber': 'Ridesharing marketplace expanding into delivery and freight. Balancing growth with profitability.',
    'Airbnb': 'Travel marketplace that survived pandemic pivot. Balancing host and guest needs.',
    'Shopify': 'E-commerce platform for merchants. Expanding beyond software into fulfillment and payments.',
    'Snap': 'Camera and AR company competing with TikTok and Instagram. Pioneer in ephemeral content.',
    'DoorDash': 'Food delivery marketplace with expansion into convenience and grocery.',
    'Zoom': 'Video communications company that exploded during pandemic, now facing normalization.',
    'Tesla': 'Electric vehicle and energy company with direct sales model and AI/autonomy focus.',
  };
  
  return contexts[company.name] || `${company.industry} company with various strategic opportunities and challenges.`;
}

export { INTERESTING_COMPANIES };
