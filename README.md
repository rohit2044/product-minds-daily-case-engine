# Product Minds - Autonomous Case Study Engine

A fully automated, config-driven system that scrapes, transforms, and serves daily PM interview case studies with engaging storytelling.

> For detailed technical documentation, see [DESIGN.md](./DESIGN.md)

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
                                                │  Frontend       │
                                                │  Application    │
                                                └─────────────────┘
```

## Key Features

- **Config-Driven**: All prompts, thresholds, and settings stored in database
- **Versioned**: Every case study change creates an audit trail
- **Soft Delete**: Cases are never hard-deleted, always recoverable
- **Bulk Operations**: APIs support single and batch updates
- **Image Generation**: Automatic themed SVG generation from text prompts
- **Propagation**: Config changes can propagate to all existing cases

## Components

### 1. Supabase Database

| Table | Purpose |
|-------|---------|
| `case_studies` | Main content table with all case study data |
| `configurations` | All system configs, prompts, thresholds |
| `case_study_versions` | Audit trail for all case changes |
| `config_propagation_logs` | Tracks config change propagation |
| `generation_logs` | Audit trail for generation attempts |
| `sources` | Configured content sources |

### 2. Edge Functions

| Function | Method | Purpose |
|----------|--------|---------|
| `get-todays-case` | GET | Fetch today's published case |
| `get-config` | GET | Fetch configuration values |
| `update-config` | PATCH | Update configs with propagation |
| `update-case-study` | PATCH | Update case studies (single/bulk) |
| `regenerate-visuals` | POST | Regenerate images (single/bulk) |
| `delete-case-study` | DELETE | Soft delete a case |
| `restore-case-study` | POST | Restore a soft-deleted case |

### 3. GitHub Actions

- **Daily Generator** (`generate-case-studies.yml`) - Runs at midnight UTC
- Scrapes content from rotating sources
- Transforms via Groq API (Llama) into story-driven cases
- Stores in Supabase with deduplication checks

### 4. Content Sources

| Day | Source Type | Source |
|-----|-------------|--------|
| Sunday | `framework_classic` | Classic PM Cases |
| Monday | `historical_wikipedia` | Wikipedia Historical |
| Tuesday | `historical_archive` | Archive.org |
| Wednesday | `live_news_techcrunch` | TechCrunch |
| Thursday | `live_news_hackernews` | HackerNews |
| Friday | `company_blog` | Company Blogs |
| Saturday | `company_sec_filing` | SEC Filings |

## Setup Instructions

### Step 1: Supabase Setup

1. Create a new Supabase project at https://supabase.com
2. Run the migrations in order:
   ```bash
   # Run in Supabase SQL Editor or via CLI
   psql -f supabase/migrations/001_initial_schema.sql
   psql -f supabase/migrations/002_add_question_type_and_seniority_level.sql
   psql -f supabase/migrations/003_consolidated_schema.sql
   ```
3. Deploy all edge functions from `supabase/functions/`
4. Note your project URL and service role key

### Step 2: Groq API Setup

1. Create a Groq account at https://console.groq.com
2. Generate an API key from the API Keys section
3. Note your API key for the GitHub secrets setup

### Step 3: GitHub Repository Setup

1. Create a new private repository
2. Copy all files to your repository
3. Add these repository secrets (Settings > Secrets and variables > Actions):

| Secret | Description |
|--------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Service role key (not anon!) |
| `GROQ_API_KEY` | Your Groq API key |

4. (Optional) Add repository variable:
   - `GROQ_MODEL` - Default: `llama-3.3-70b-versatile`

### Step 4: Initial Seed

Run the seed script to generate initial cases:

```bash
# Install dependencies
npm install

# Create .env file
cat > .env << EOF
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
GROQ_API_KEY=your-groq-api-key
EOF

# Run seed (generates ~15 cases)
npm run seed
```

### Step 5: Frontend Integration

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Fetch today's case study
const { data } = await supabase.functions.invoke('get-todays-case');

if (data.success) {
  console.log(data.data); // Today's case
} else if (data.fallback) {
  console.log(data.data); // Fallback case when none scheduled
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key |
| `GROQ_API_KEY` | Yes | Groq API key for Llama models |
| `GROQ_MODEL` | No | Model to use (default: `llama-3.3-70b-versatile`) |

## File Structure

```
product-minds-case-engine/
├── README.md                           # This file
├── DESIGN.md                           # Detailed technical documentation
├── package.json
├── .env.example
│
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql      # Base tables
│   │   ├── 002_add_question_type...    # Early additions
│   │   └── 003_consolidated_schema.sql # All new features
│   └── functions/
│       ├── get-todays-case/            # Daily case API
│       ├── get-config/                 # Config fetch API
│       ├── update-config/              # Config update with propagation
│       ├── update-case-study/          # Case update (single/bulk)
│       ├── regenerate-visuals/         # Image regeneration
│       ├── delete-case-study/          # Soft delete
│       └── restore-case-study/         # Restore deleted
│
├── .github/
│   └── workflows/
│       └── generate-case-studies.yml   # Daily cron job
│
└── scripts/
    ├── case-generator.js               # Main generation orchestrator
    ├── run-generator.js                # CLI runner
    ├── seed-initial-cases.js           # Initial seeding
    ├── check-buffer.js                 # Buffer status check
    ├── schedule-cases.js               # Case scheduling
    ├── report-status.js                # Status reporting
    │
    ├── config/
    │   ├── config-loader.js            # Config loading with cache
    │   └── config-updater.js           # Programmatic config updates
    │
    ├── prompts/
    │   └── prompt-assembler.js         # Assembles prompt from DB sections
    │
    ├── sources/
    │   ├── wikipedia.js
    │   ├── archive-org.js
    │   ├── techcrunch.js
    │   ├── hackernews.js
    │   ├── company-blogs.js
    │   ├── sec-edgar.js
    │   ├── producthunt.js
    │   └── framework-cases.js
    │
    └── utils/
        ├── chart-generator.js          # Image generation from prompts
        ├── deduplication.js            # Vector similarity checks
        ├── version-tracker.js          # Version tracking utilities
        ├── groq-client.js              # Groq API wrapper
        └── supabase-client.js          # Supabase client instance
```

## Configuration System

All prompts and settings are stored in the `configurations` table and can be updated via API.

### Prompt Sections

| Config Key | Purpose |
|------------|---------|
| `prompt_system_intro` | System role definition |
| `prompt_output_schema` | JSON output structure |
| `prompt_question_types` | Available question types |
| `prompt_mental_models` | Mental model patterns |
| `prompt_answer_structure` | Seniority/difficulty definitions |
| `prompt_evaluation_criteria` | Company interview matching |
| `prompt_image_generation` | Image prompt instructions |
| `prompt_source_customization` | Writing style constraints |

### System Configs

| Config Key | Default | Purpose |
|------------|---------|---------|
| `similarity_threshold` | 0.85 | Duplicate detection threshold |
| `company_cooldown_days` | 60 | Days before same company reappears |
| `buffer_target_days` | 14 | Target days of scheduled content |
| `max_generation_per_run` | 3 | Max cases per workflow run |
| `groq_model` | `llama-3.3-70b-versatile` | LLM model |
| `groq_max_tokens` | 4000 | Max tokens per generation |

### Updating Configs via API

```bash
# Update a single config
curl -X PATCH 'https://your-project.supabase.co/functions/v1/update-config' \
  -H 'Authorization: Bearer SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "configKey": "similarity_threshold",
    "configValue": { "value": 0.90 },
    "propagate": false
  }'

# Update multiple configs with propagation
curl -X PATCH 'https://your-project.supabase.co/functions/v1/update-config' \
  -H 'Authorization: Bearer SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "configs": [
      { "configKey": "prompt_image_generation", "configValue": { "content": "..." } }
    ],
    "propagate": true
  }'
```

## Local Development

```bash
# Clone and install
git clone <your-repo>
cd product-minds-case-engine
npm install

# Create .env file
cp .env.example .env
# Edit .env with your credentials

# Test single case generation (dry run)
node scripts/case-generator.js --count=1 --dry-run

# Generate and save to database
node scripts/case-generator.js --count=1

# Check buffer status
node scripts/check-buffer.js

# Schedule unscheduled cases
node scripts/schedule-cases.js
```

## API Examples

### Get Today's Case

```bash
curl 'https://your-project.supabase.co/functions/v1/get-todays-case'
```

### Update a Case Study

```bash
curl -X PATCH 'https://your-project.supabase.co/functions/v1/update-case-study' \
  -H 'Authorization: Bearer SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "caseId": "uuid",
    "updates": {
      "difficulty": "advanced",
      "tags": ["strategy", "growth"]
    },
    "changeReason": "Recategorized difficulty"
  }'
```

### Bulk Update Cases

```bash
curl -X PATCH 'https://your-project.supabase.co/functions/v1/update-case-study' \
  -H 'Authorization: Bearer SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "bulk": true,
    "caseIds": ["uuid1", "uuid2"],
    "updates": { "difficulty": "intermediate" }
  }'
```

### Regenerate Images

```bash
# Single case
curl -X POST 'https://your-project.supabase.co/functions/v1/regenerate-visuals' \
  -H 'Authorization: Bearer SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "caseId": "uuid",
    "imagePrompt": "A minimalist illustration showing growth metrics..."
  }'

# Bulk regeneration
curl -X POST 'https://your-project.supabase.co/functions/v1/regenerate-visuals' \
  -H 'Authorization: Bearer SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "bulk": true,
    "filter": { "hasNoImage": true }
  }'
```

### Soft Delete and Restore

```bash
# Delete
curl -X DELETE 'https://your-project.supabase.co/functions/v1/delete-case-study' \
  -H 'Authorization: Bearer SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{ "caseId": "uuid", "reason": "Outdated" }'

# Restore
curl -X POST 'https://your-project.supabase.co/functions/v1/restore-case-study' \
  -H 'Authorization: Bearer SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{ "caseId": "uuid" }'
```

## Cost Estimate

| Service | Monthly Cost |
|---------|-------------|
| Supabase | $0 (free tier) |
| GitHub Actions | $0 (free tier) |
| Groq API | ~$0.05-0.10 (30 cases/month) |
| **Total** | **~$0.10/month** |

## Troubleshooting

### "No prompt sections found in database"

Run the migrations to seed the configurations:
```bash
psql -f supabase/migrations/003_consolidated_schema.sql
```

### Rate limiting errors

Groq has rate limits on the free tier. The seeding script includes 3-second delays. If you hit limits, increase the delay or wait before retrying.

### JSON parsing errors

The LLM sometimes returns malformed JSON. If it consistently fails:
1. Check the prompt configuration in the database
2. Try reducing raw content length
3. Use a different model via `groq_model` config

### Images not generating

1. Check that `image_prompt` is being generated by the LLM
2. Verify the Supabase storage bucket `case-study-charts` exists
3. Check `image_generation_status` on the case study

## Available Models

| Model | Speed | Quality | Use Case |
|-------|-------|---------|----------|
| `llama-3.3-70b-versatile` | Medium | Best | Default - best storytelling |
| `llama-3.1-8b-instant` | Fast | Good | Quick iterations, lower cost |
| `llama3-70b-8192` | Medium | Very Good | Alternative stable option |

## License

MIT