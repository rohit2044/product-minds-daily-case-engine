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
- Transforms via Groq API (Llama) into story-driven cases
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

### Step 2: Groq API Setup

1. Create a Groq account at https://console.groq.com
2. Generate an API key from the API Keys section
3. Note your API key for the GitHub secrets setup

### Step 3: GitHub Repository Setup

1. Create a new private repository
2. Copy the `.github/workflows/` folder
3. Add these repository secrets (Settings → Secrets and variables → Actions):
   - `SUPABASE_URL` - Your Supabase project URL
   - `SUPABASE_SERVICE_KEY` - Service role key (not anon!)
   - `GROQ_API_KEY` - Your Groq API key

4. (Optional) Add repository variable for model selection:
   - `GROQ_MODEL` - Default: `llama-3.3-70b-versatile`
   - Other options: `llama-3.1-8b-instant`, `llama3-70b-8192`

### Step 4: Initial Seed

Run the seed script to generate initial 30 cases:
```bash
npm install
node scripts/seed-initial-cases.js
```

### Step 5: Lovable Integration

Add this to your Lovable frontend:
```javascript
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Fetch today's case study
const { data: todaysCase } = await supabase
  .functions.invoke('get-todays-case');
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key |
| `GROQ_API_KEY` | Yes | Groq API key for Llama models |
| `GROQ_MODEL` | No | Model to use (default: `llama-3.3-70b-versatile`) |

## Cost Estimate

| Service | Monthly Cost |
|---------|-------------|
| Supabase | $0 (free tier) |
| GitHub Actions | $0 (free tier) |
| Groq API | ~$0.05-0.10 (30 cases/month)* |
| **Total** | **~$0.10/month** |

*Groq offers generous free tier and extremely low pricing for Llama models.

## Available Models

| Model | Speed | Quality | Use Case |
|-------|-------|---------|----------|
| `llama-3.3-70b-versatile` | Medium | Best | Default - best storytelling |
| `llama-3.1-8b-instant` | Fast | Good | Quick iterations, lower cost |
| `llama3-70b-8192` | Medium | Very Good | Alternative stable option |

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
├── .github/
│   └── workflows/
│       └── generate-case-studies.yml
├── scripts/
│   ├── seed-initial-cases.js
│   ├── case-generator.js
│   ├── run-generator.js
│   ├── check-buffer.js
│   ├── schedule-cases.js
│   ├── report-status.js
│   ├── test-sources.js
│   ├── sources/
│   │   ├── wikipedia.js
│   │   ├── archive-org.js
│   │   ├── techcrunch.js
│   │   ├── hackernews.js
│   │   ├── company-blogs.js
│   │   ├── sec-edgar.js
│   │   ├── producthunt.js
│   │   └── framework-cases.js
│   ├── prompts/
│   │   └── storytelling-system-prompt.js
│   └── utils/
│       ├── groq-client.js
│       ├── supabase-client.js
│       └── deduplication.js
├── docs/
│   ├── lovable-integration.md
│   └── storytelling-prompt.md
└── package.json
```

## Local Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_KEY=your-service-key
   GROQ_API_KEY=your-groq-api-key
   GROQ_MODEL=llama-3.3-70b-versatile
   ```

4. Test a single case generation:
   ```bash
   node scripts/case-generator.js --count=1 --dry-run
   ```

5. Test all content sources:
   ```bash
   npm run test:sources
   ```

## Troubleshooting

### "Missing GROQ_API_KEY environment variable"
Ensure your `.env` file contains the `GROQ_API_KEY` or the GitHub secret is properly set.

### Rate limiting errors
Groq has rate limits on the free tier. The seeding script includes 3-second delays between calls. If you hit limits, increase the delay or wait before retrying.

### JSON parsing errors
The LLM sometimes returns malformed JSON. The code attempts to extract JSON from the response, but if it consistently fails, try:
1. Reducing the raw content length
2. Simplifying the prompt
3. Using a different model

## Migration from Claude to Groq

If you're migrating from the Claude-based version:

1. Replace `ANTHROPIC_API_KEY` with `GROQ_API_KEY` in:
   - GitHub repository secrets
   - Local `.env` file

2. Update package.json dependencies:
   ```bash
   npm uninstall @anthropic-ai/sdk
   npm install groq-sdk
   ```

3. The API response format is slightly different, but the updated code handles this automatically.