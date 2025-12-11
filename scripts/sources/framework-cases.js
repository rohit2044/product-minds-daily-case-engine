/**
 * Framework Case Generator
 * 
 * Generates case studies that teach PM frameworks through application
 * rather than theory. Each case is designed to make one framework
 * the natural tool to use.
 */

// PM Frameworks with teaching scenarios
const FRAMEWORK_CASES = [
  // PRIORITIZATION FRAMEWORKS
  {
    framework: 'RICE',
    name: 'RICE Prioritization',
    description: 'Reach, Impact, Confidence, Effort scoring',
    scenario: {
      company: 'StreamFlow',
      industry: 'Streaming/Entertainment',
      situation: `StreamFlow is a mid-size video streaming service with 8M subscribers, competing against giants like Netflix and smaller niche players. The PM team has identified 12 potential features for Q2, but only has engineering capacity for 3-4. The CEO wants a defensible prioritization framework for the board meeting next week.

The feature candidates include:
- Social watching (watch with friends remotely)
- Download for offline viewing
- Improved recommendation algorithm
- 4K streaming support
- Parental controls overhaul
- Interactive content support
- Podcast integration
- Sports highlights clips
- Audio description expansion
- Multi-profile improvements
- Skip intro/recap automation
- Playback speed controls

The team has rough estimates on reach (what % of users would use it), engineering effort, and some user research on perceived value.`,
      challenge: 'Build a RICE-based prioritization for these features. But here is the twist: the CEO believes social watching is the future and wants it prioritized regardless of score. How do you handle framework results that conflict with executive intuition?',
    },
    hints: [
      'RICE scores are inputs to decisions, not the decision itself',
      'Consider segmenting by user cohort - what scores high for which users?',
      'Strategic alignment can be a multiplier, but be explicit about it',
    ],
    difficulty: 'beginner',
    tags: ['prioritization', 'roadmap', 'stakeholder-management'],
  },
  {
    framework: 'ICE',
    name: 'ICE Scoring',
    description: 'Impact, Confidence, Ease scoring for rapid prioritization',
    scenario: {
      company: 'GrowthLabs',
      industry: 'MarTech/SaaS',
      situation: `GrowthLabs is a marketing automation startup running a growth team experiment sprint. They have 2 weeks and a small engineering budget to test growth hypotheses before their Series A pitch.

The growth backlog has 20+ ideas ranging from:
- Landing page copy tests
- Pricing page redesigns
- Referral program tweaks
- Onboarding flow changes
- Email sequence optimizations
- Trial extension offers
- Feature gating experiments

Most have some data supporting them, but confidence levels vary wildly. The team argues about whether to bet on a few high-conviction ideas or spread bets across many.`,
      challenge: 'Design an ICE-based sprint prioritization. The catch: you have conflicting data sources - user interviews say one thing, analytics say another. How do you score Confidence when your data contradicts itself?',
    },
    hints: [
      'ICE works best for rapid iteration, not long-term planning',
      'Confidence should reflect YOUR confidence, not just data quality',
      'Consider time-boxing experiments to reduce commitment to low-confidence bets',
    ],
    difficulty: 'beginner',
    tags: ['prioritization', 'growth', 'experimentation'],
  },
  
  // STRATEGY FRAMEWORKS
  {
    framework: 'Jobs-to-be-Done',
    name: 'Jobs-to-be-Done',
    description: 'Understanding what job users hire products to do',
    scenario: {
      company: 'MealMate',
      industry: 'FoodTech',
      situation: `MealMate is a meal planning app with decent adoption but terrible retention. Users sign up enthusiastically, use it for 2-3 weeks, then churn. Exit surveys cite "too much effort" and "didn't fit my life."

The product team has been iterating on features: better recipes, easier shopping lists, integration with grocery delivery. Nothing moves retention.

A new PM joins and suggests the team has been solving the wrong problem. They commission JTBD interviews and discover:
- "Help me eat healthier" was the stated job
- But the functional job was actually "help me stop arguing with my spouse about dinner"
- The emotional job was "help me feel like I have my life together"
- The social job was "let me impress my friends with home cooking"

The feature roadmap built for "eat healthier" doesn't address these actual jobs.`,
      challenge: 'Redesign MealMate is product strategy using JTBD insights. What features get cut? What gets added? How do you pitch this pivot to a CEO who has been marketing "healthy eating" for 2 years?',
    },
    hints: [
      'Functional, emotional, and social jobs often conflict',
      'The competing alternatives might not be other apps',
      'Consider: what progress is the user trying to make in their life?',
    ],
    difficulty: 'intermediate',
    tags: ['strategy', 'user-research', 'retention', 'positioning'],
  },
  {
    framework: 'North Star Metric',
    name: 'North Star Metric',
    description: 'Single metric that captures customer value and predicts business success',
    scenario: {
      company: 'CodeCollab',
      industry: 'Developer Tools',
      situation: `CodeCollab is a collaborative coding platform (think Google Docs for code) that has grown to 500K monthly users. Leadership is debating what metric should be the North Star.

Candidates being discussed:
- Monthly Active Users (MAU)
- Weekly Active Teams (WAT)
- Lines of Code Edited (LCE)
- Collaboration Sessions per User
- Time Saved vs Solo Coding
- Net Promoter Score (NPS)

Each department champions a different metric. Growth wants MAU. Sales wants Enterprise Teams. Engineering wants technical engagement. Finance wants leading indicators of conversion.

Last quarter, the team optimized for MAU. Signups went up 40%, but paid conversion dropped 20% and the product got slower due to "engagement" features.`,
      challenge: 'Define CodeCollab is North Star Metric. But here is the real challenge: the metric you pick will change behavior. Model out how each metric would change team incentives and product decisions. Which creates the best long-term outcome?',
    },
    hints: [
      'A good North Star measures value delivered, not just usage',
      'Watch for metrics that can be gamed without improving the product',
      'Consider: does this metric correlate with both retention AND revenue?',
    ],
    difficulty: 'intermediate',
    tags: ['metrics', 'strategy', 'alignment', 'okrs'],
  },
  
  // ANALYTICS FRAMEWORKS
  {
    framework: 'AARRR',
    name: 'Pirate Metrics (AARRR)',
    description: 'Acquisition, Activation, Retention, Referral, Revenue funnel',
    scenario: {
      company: 'SkillUp',
      industry: 'EdTech',
      situation: `SkillUp is an online learning platform for professional skills. They have solid top-of-funnel (100K monthly signups) but the business is struggling.

Current metrics:
- Acquisition: 100K signups/month, $5 CAC (great!)
- Activation: 30% complete first lesson (okay)
- Retention: 8% still active at Day 30 (terrible)
- Referral: 0.3 viral coefficient (low)
- Revenue: 2% convert to paid (industry avg is 5%)

The board is pressuring for growth, so the team keeps pumping money into acquisition. "We'll fix retention later." But LTV/CAC is now below 1, and runway is 8 months.

The PM suspects they're optimizing the wrong part of the funnel but needs to make the case with data.`,
      challenge: 'Use AARRR analysis to identify where SkillUp should focus. Build the case for why fixing one part of the funnel matters more than others. Warning: the CEO loves the "100K signups" story - how do you tell them it is a vanity metric?',
    },
    hints: [
      'Leaky buckets downstream waste money spent upstream',
      'Calculate the impact of 10% improvement at each stage',
      'Activation often has the highest leverage for early-stage products',
    ],
    difficulty: 'beginner',
    tags: ['metrics', 'growth', 'funnel', 'analytics'],
  },
  {
    framework: 'Cohort Analysis',
    name: 'Cohort Analysis',
    description: 'Analyzing user behavior by when they joined',
    scenario: {
      company: 'FitTrack',
      industry: 'Health & Fitness',
      situation: `FitTrack is a fitness tracking app. Overall retention looks okay at 25% Month-2 retention. But something feels wrong - revenue is flat despite growing users.

When the PM digs into cohort analysis, they discover:
- Jan 2024 cohort: 35% M2 retention
- Mar 2024 cohort: 28% M2 retention
- Jun 2024 cohort: 18% M2 retention
- Sep 2024 cohort: 12% M2 retention

Newer cohorts are dramatically worse. The aggregate 25% number is only held up by the loyal January cohort.

Digging deeper, the PM finds:
- January launch had a killer onboarding flow
- March shipped a redesign that broke onboarding
- June added "engagement" features that annoyed users
- September scaled paid acquisition bringing lower-intent users

The company is celebrating "growth" while the core product is degrading.`,
      challenge: 'Build a cohort-based analysis presentation for the executive team. You need to deliver bad news (product is getting worse) while also proposing a path forward. How do you frame this constructively?',
    },
    hints: [
      'Aggregate metrics hide cohort-level problems',
      'Compare product changes to cohort performance changes',
      'Be careful not to blame-shift to marketing/acquisition quality without evidence',
    ],
    difficulty: 'intermediate',
    tags: ['analytics', 'retention', 'metrics', 'diagnosis'],
  },
  
  // EXPERIMENTATION
  {
    framework: 'A/B Testing',
    name: 'Experiment Design',
    description: 'Rigorous hypothesis testing for product decisions',
    scenario: {
      company: 'BookShelf',
      industry: 'E-commerce/Retail',
      situation: `BookShelf is an online bookstore. The PM wants to test a new checkout flow that shows personalized book recommendations in the cart (hypothesis: increases average order value).

Initial test results after 1 week (10K users per variant):
- Control: $42 AOV, 3.2% conversion
- Treatment: $48 AOV, 2.8% conversion

The CEO sees "$48 AOV!" and wants to ship immediately. But the PM notices:
- Conversion dropped
- The test isn't statistically significant yet
- There's a novelty effect concern
- Mobile and desktop show opposite results
- High-value customers hate it, low-value customers love it

The data tells different stories depending on how you slice it.`,
      challenge: 'Make the ship/don\'t ship decision. But more importantly, design the NEXT experiment to get clarity. What would you need to measure, for how long, with what segments, to actually know if this is a good change?',
    },
    hints: [
      'Statistical significance vs practical significance',
      'Consider long-term effects vs short-term metrics',
      'Segmentation can reveal hidden successes or failures',
    ],
    difficulty: 'advanced',
    tags: ['experimentation', 'statistics', 'decision-making', 'analytics'],
  },
  
  // MARKET ANALYSIS
  {
    framework: 'TAM/SAM/SOM',
    name: 'Market Sizing',
    description: 'Total, Serviceable, Obtainable market analysis',
    scenario: {
      company: 'PetPal',
      industry: 'Pet Tech',
      situation: `PetPal is pitching VCs for their Series A. They've built an AI-powered pet health monitoring collar. The VC asks the dreaded question: "What's your TAM?"

The founder shows:
- TAM: $250B global pet industry
- SAM: $15B pet wearables/tech
- SOM: $500M (first-year target)

The VC laughs. "Everyone claims $250B TAM. I've seen 47 decks this month, all with the same pet industry stat. Walk me through your REAL market."

The PM needs to build a bottom-up market analysis that's actually defensible. They know:
- 85M US pet-owning households
- 40% have dogs (their initial target)
- $300 average annual spend on pet health
- 5% adoption rate for pet tech in early markets

But they're also hearing competitors claim the same market with different numbers.`,
      challenge: 'Build a TAM/SAM/SOM analysis that a skeptical VC would respect. Include both top-down and bottom-up approaches. Identify the key assumptions that would make or break your numbers.',
    },
    hints: [
      'Bottom-up > Top-down for VC credibility',
      'Show how SAM expands as product matures',
      'Be explicit about what would make your assumptions wrong',
    ],
    difficulty: 'intermediate',
    tags: ['market-sizing', 'fundraising', 'strategy', 'business-case'],
  },
  
  // DISCOVERY
  {
    framework: 'Opportunity Solution Tree',
    name: 'Opportunity Solution Tree',
    description: 'Mapping opportunities to outcomes and solutions',
    scenario: {
      company: 'TeamSync',
      industry: 'Enterprise SaaS',
      situation: `TeamSync is a project management tool. The outcome they're targeting: "Increase user activation (first project created) from 30% to 50%."

The PM has done discovery and identified opportunities (problems/needs):
- Users don't know where to start
- Template selection is overwhelming
- Solo users have no one to collaborate with
- Import from other tools is broken
- Tutorial is too long
- Value isn't clear until project has data

Leadership wants to just "build a better onboarding wizard." But the PM suspects the real problem isn't onboarding, it's that the product requires collaboration to show value, and new users sign up solo.

They need a way to visualize the opportunity space and propose experiments without committing to a single solution.`,
      challenge: 'Build an Opportunity Solution Tree for TeamSync is activation problem. Show how multiple solutions could address the same opportunity, and how you would prioritize experiments.',
    },
    hints: [
      'Separate opportunities (problems) from solutions',
      'One outcome can have multiple valid paths',
      'Small experiments can validate opportunities before building solutions',
    ],
    difficulty: 'advanced',
    tags: ['discovery', 'product-strategy', 'hypothesis', 'research'],
  },
  
  // PRODUCT-MARKET FIT
  {
    framework: 'Sean Ellis Test',
    name: 'Product-Market Fit Survey',
    description: 'Measuring PMF via "very disappointed" benchmark',
    scenario: {
      company: 'CalendarAI',
      industry: 'Productivity/AI',
      situation: `CalendarAI is an AI scheduling assistant. They've been in market for 6 months with 20K users. Growth has stalled and the team debates if they have PMF.

Survey results from 500 users:
- Very disappointed if gone: 28%
- Somewhat disappointed: 45%
- Not disappointed: 27%

The 40% benchmark says they're not there yet. But:
- Power users (>10 meetings scheduled): 52% very disappointed
- Free users: 18% very disappointed
- Users who connected Google Calendar: 41% very disappointed
- Users who only connected Outlook: 22% very disappointed

The data suggests they have PMF for a segment, not the whole market.`,
      challenge: 'Use the Sean Ellis survey data to define CalendarAI is strategy. Should they go broad and try to improve the overall score? Or go narrow and double down on the segment where they have PMF? Build the case for your recommendation.',
    },
    hints: [
      'PMF can exist in a segment before the whole market',
      'The 40% threshold is a guideline, not a law',
      'Ask: what do the "very disappointed" users have in common?',
    ],
    difficulty: 'intermediate',
    tags: ['product-market-fit', 'strategy', 'segmentation', 'growth'],
  },
];

// Track recently used frameworks
let recentlyUsed = new Set();

export async function generateFrameworkCase() {
  console.log('  Selecting PM framework case...');
  
  // Filter available frameworks
  const available = FRAMEWORK_CASES.filter(f => !recentlyUsed.has(f.framework));
  if (available.length < 3) {
    recentlyUsed.clear();
  }
  
  // Random selection
  const selected = available[Math.floor(Math.random() * available.length)];
  recentlyUsed.add(selected.framework);
  
  console.log(`  Selected framework: ${selected.framework}`);
  
  // Generate content
  const content = `
PM FRAMEWORK CASE STUDY
=======================

FRAMEWORK: ${selected.framework} - ${selected.name}
FRAMEWORK DESCRIPTION: ${selected.description}

COMPANY: ${selected.scenario.company}
INDUSTRY: ${selected.scenario.industry}

SITUATION:
${selected.scenario.situation}

CORE CHALLENGE:
${selected.scenario.challenge}

FRAMEWORK APPLICATION HINTS:
${selected.hints.map((h, i) => `${i + 1}. ${h}`).join('\n')}

TEACHING OBJECTIVE:
This case is designed to teach ${selected.framework} through application.
The case should show both the POWER and LIMITATIONS of this framework.
Don't just explain how to use it - show when it works and when it doesn't.

DIFFICULTY: ${selected.difficulty}
TAGS: ${selected.tags.join(', ')}
  `.trim();
  
  return {
    title: `${selected.scenario.company}: A ${selected.framework} Case Study`,
    content: content,
    sourceUrl: null, // These are original cases
    companyName: selected.scenario.company,
    industry: selected.scenario.industry,
    framework: selected.framework,
    difficulty: selected.difficulty,
    tags: selected.tags,
    hints: selected.hints,
  };
}

// Export for seeding
export { FRAMEWORK_CASES };
