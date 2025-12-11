# Product Minds - Autonomous Case Study Engine

A fully automated system that scrapes, transforms, and serves daily PM interview case studies with engaging storytelling.

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Content        │     │  GitHub         │     │  Supabase       │
│  Sources        │────▶│  Actions        │────▶│  Database       │
│  (RSS, APIs)    │     │  (Daily Cron)   │     │  + Edge Funcs   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                                ┌─────────────────┐
                                                │  Lovable        │
                                                │  Frontend       │
                                                └─────────────────┘
```

## Components

### 1. Supabase Database
- `case_studies` - Main table storing all generated case studies
- `generation_logs` - Audit trail for debugging
- `sources` - Configured content sources
- Vector embeddings for deduplication

### 2. GitHub Actions
- **Daily Generator** (`generate-case-studies.yml`) - Runs at midnight UTC
- Scrapes content from rotating sources
- Transforms via Claude API into story-driven cases
- Stores in Supabase with quality checks

### 3. Edge Functions
- `get-todays-case` - Returns today's scheduled case study
- `get-random-case` - Premium feature: random case from pool
- `get-archive` - Premium feature: paginated history

### 4. Content Sources (Legally Safe)
| Source | Type | Schedule |
|--------|------|----------|
| Wikipedia Product Launches | Historical | Mon |
| Archive.org Tech News | Historical | Tue |
| TechCrunch RSS | Live News | Wed |
| Hacker News API | Live News | Thu |
| Company Blogs/Newsrooms | Company | Fri |
| SEC Edgar Filings | Company | Sat |
| PM Framework Deep-dives | Framework | Sun |

## Setup Instructions

### Step 1: Supabase Setup

1. Create a new Supabase project at https://supabase.com
2. Run the migration in `supabase/migrations/001_initial_schema.sql`
3. Deploy the edge function from `supabase/functions/`
4. Note your project URL and anon key

### Step 2: GitHub Repository Setup

1. Create a new private repository
2. Copy the `.github/workflows/` folder
3. Add these repository secrets:
   - `SUPABASE_URL` - Your Supabase project URL
   - `SUPABASE_SERVICE_KEY` - Service role key (not anon!)
   - `ANTHROPIC_API_KEY` - Your Claude API key

### Step 3: Initial Seed

Run the seed script to generate initial 30 cases:
```bash
npm install
node scripts/seed-initial-cases.js
```

### Step 4: Lovable Integration

Add this to your Lovable frontend:
```javascript
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Fetch today's case study
const { data: todaysCase } = await supabase
  .functions.invoke('get-todays-case');
```

## Cost Estimate

| Service | Monthly Cost |
|---------|-------------|
| Supabase | $0 (free tier) |
| GitHub Actions | $0 (free tier) |
| Claude API | ~$3-5 (30 cases/month) |
| **Total** | **~$3-5/month** |

## File Structure

```
product-minds-case-engine/
├── README.md
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   └── functions/
│       └── get-todays-case/
│           └── index.ts
├── github-actions/
│   └── generate-case-studies.yml
├── scripts/
│   ├── seed-initial-cases.js
│   ├── case-generator.js
│   ├── sources/
│   │   ├── wikipedia.js
│   │   ├── techcrunch.js
│   │   ├── hackernews.js
│   │   ├── company-blogs.js
│   │   └── sec-edgar.js
│   └── utils/
│       ├── claude-client.js
│       ├── supabase-client.js
│       └── deduplication.js
├── prompts/
│   └── storytelling-prompt.md
└── docs/
    └── lovable-integration.md
```
