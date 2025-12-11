# Lovable Integration Guide

This guide explains how to integrate the Case Study Engine with your Lovable frontend.

## Prerequisites

1. Supabase project set up with the schema from `supabase/migrations/001_initial_schema.sql`
2. Edge function deployed (`get-todays-case`)
3. Initial seed completed (`npm run seed`)

## Step 1: Add Supabase to Lovable

In your Lovable project settings, add Supabase integration:

1. Go to Project Settings → Integrations
2. Click "Add Supabase"
3. Enter your Supabase URL and Anon Key (NOT the service key!)
4. Save

## Step 2: Create the Supabase Client

Create a new file `lib/supabase.ts` in your Lovable project:

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

## Step 3: Create the Case Study Component

Create a new component for displaying the daily case study:

```tsx
// components/DailyCaseStudy.tsx

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface CaseStudy {
  id: string;
  title: string;
  hook: string;
  story_content: string;
  challenge_prompt: string;
  hints: string[];
  source_type: string;
  source_url: string | null;
  company_name: string | null;
  industry: string | null;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  frameworks_applicable: string[];
  tags: string[];
}

export function DailyCaseStudy() {
  const [caseStudy, setCaseStudy] = useState<CaseStudy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHints, setShowHints] = useState(false);

  useEffect(() => {
    fetchTodaysCase();
  }, []);

  async function fetchTodaysCase() {
    try {
      // Option 1: Use Edge Function
      const { data, error } = await supabase.functions.invoke('get-todays-case');
      
      if (error) throw error;
      
      if (data.success) {
        setCaseStudy(data.data);
      } else if (data.fallback) {
        setCaseStudy(data.data);
      } else {
        setError('No case study available today');
      }
    } catch (err) {
      console.error('Failed to fetch case study:', err);
      setError('Failed to load case study');
    } finally {
      setLoading(false);
    }
  }

  // Alternative: Direct database query (simpler, no edge function needed)
  async function fetchTodaysCaseDirect() {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('case_studies')
        .select('*')
        .eq('scheduled_date', today)
        .eq('is_published', true)
        .single();
      
      if (error) throw error;
      setCaseStudy(data);
    } catch (err) {
      console.error('Failed to fetch case study:', err);
      setError('Failed to load case study');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse max-w-3xl mx-auto p-8">
        <div className="h-8 bg-gray-200 rounded w-3/4 mb-4"></div>
        <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-2/3"></div>
      </div>
    );
  }

  if (error || !caseStudy) {
    return (
      <div className="text-center py-8 max-w-3xl mx-auto">
        <div className="text-6xl mb-4">📚</div>
        <p className="text-gray-500">
          {error || "No case study available today. Check back tomorrow!"}
        </p>
      </div>
    );
  }

  const difficultyColors = {
    beginner: 'bg-green-100 text-green-700',
    intermediate: 'bg-yellow-100 text-yellow-700',
    advanced: 'bg-red-100 text-red-700',
  };

  return (
    <article className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-2 text-sm mb-3">
          <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">
            Today's Challenge
          </span>
          <span className={`px-3 py-1 rounded-full capitalize ${difficultyColors[caseStudy.difficulty]}`}>
            {caseStudy.difficulty}
          </span>
          {caseStudy.company_name && (
            <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full">
              {caseStudy.company_name}
            </span>
          )}
        </div>
        
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 leading-tight">
          {caseStudy.title}
        </h1>
        
        <p className="text-xl text-gray-600 italic leading-relaxed">
          "{caseStudy.hook}"
        </p>
      </header>

      {/* Story Content */}
      <div className="prose prose-lg max-w-none mb-8">
        {caseStudy.story_content.split('\n\n').map((paragraph, i) => (
          <p key={i} className="mb-4 text-gray-700 leading-relaxed text-lg">
            {paragraph}
          </p>
        ))}
      </div>

      {/* Challenge Box */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 p-6 rounded-r-lg mb-6">
        <h2 className="text-lg font-semibold text-blue-900 mb-3 flex items-center gap-2">
          <span>🎯</span> Your Challenge
        </h2>
        <p className="text-gray-700 leading-relaxed">
          {caseStudy.challenge_prompt}
        </p>
      </div>

      {/* Hints Section */}
      {caseStudy.hints && caseStudy.hints.length > 0 && (
        <div className="mb-8">
          <button
            onClick={() => setShowHints(!showHints)}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium transition-colors"
          >
            <span>{showHints ? '🙈' : '💡'}</span>
            {showHints ? 'Hide Hints' : 'Need a hint?'}
          </button>
          
          {showHints && (
            <ul className="mt-4 space-y-3 bg-yellow-50 p-4 rounded-lg">
              {caseStudy.hints.map((hint, i) => (
                <li key={i} className="flex items-start gap-3 text-gray-700">
                  <span className="text-yellow-500 flex-shrink-0">💡</span>
                  <span>{hint}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Metadata Footer */}
      <footer className="border-t pt-6 mt-8">
        {/* Frameworks */}
        {caseStudy.frameworks_applicable?.length > 0 && (
          <div className="mb-4">
            <span className="text-sm text-gray-500 font-medium">Relevant Frameworks: </span>
            <div className="flex flex-wrap gap-2 mt-2">
              {caseStudy.frameworks_applicable.map((fw) => (
                <span 
                  key={fw} 
                  className="px-3 py-1 bg-purple-100 text-purple-700 text-sm rounded-full"
                >
                  {fw}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {/* Additional Info */}
        <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-4">
          {caseStudy.industry && (
            <span>Industry: <strong>{caseStudy.industry}</strong></span>
          )}
          {caseStudy.source_url && (
            <a 
              href={caseStudy.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              View Original Source →
            </a>
          )}
        </div>

        {/* Tags */}
        {caseStudy.tags?.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {caseStudy.tags.map(tag => (
              <span 
                key={tag}
                className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </footer>

      {/* Premium CTA */}
      <div className="mt-10 p-8 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl text-white text-center">
        <h3 className="text-2xl font-bold mb-2">
          Want more case studies?
        </h3>
        <p className="mb-6 opacity-90 text-lg">
          Get unlimited access to 500+ PM case studies with Premium
        </p>
        <button className="px-8 py-3 bg-white text-purple-600 rounded-lg font-semibold hover:bg-gray-100 transition-colors shadow-lg">
          Upgrade to Premium
        </button>
      </div>
    </article>
  );
}

export default DailyCaseStudy;
```

## Step 4: Add to Your Welcome Screen

In your free plan welcome screen, import and use the component:

```tsx
// pages/Welcome.tsx or App.tsx

import DailyCaseStudy from '@/components/DailyCaseStudy';

export default function WelcomePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Your header/nav here */}
      
      <main className="py-8">
        <DailyCaseStudy />
      </main>
      
      {/* Your footer here */}
    </div>
  );
}
```

## Step 5: Environment Variables

Add these to your Lovable environment settings:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## Alternative: Using the Edge Function

If you deployed the `get-todays-case` edge function, it provides:
- A fallback case if nothing is scheduled
- Better error handling
- Consistent API response format

Deploy with:
```bash
supabase functions deploy get-todays-case
```

## Styling Notes

The component uses Tailwind CSS classes. If you're using a different styling solution:

1. Replace the Tailwind classes with your CSS framework equivalents
2. Or add Tailwind to your Lovable project

## Testing

To test the integration:

1. Make sure you have at least one case scheduled for today
2. Check the Supabase table: `SELECT * FROM case_studies WHERE scheduled_date = CURRENT_DATE`
3. Load your welcome page
4. You should see the case study rendered

## Troubleshooting

**"No case study available"**
- Check if there's a case scheduled for today in Supabase
- Run `npm run schedule` in the engine to schedule cases

**"Failed to load case study"**
- Check browser console for errors
- Verify your Supabase URL and anon key
- Check RLS policies allow reading published cases

**Styles not applying**
- Ensure Tailwind is configured
- Check for CSS conflicts
