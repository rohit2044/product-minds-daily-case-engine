// Supabase Edge Function: get-today's-case
//
// Returns today's scheduled case study for the frontend
// Deploy with: supabase functions deploy get-today's-case

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get today's date in UTC
    const today = new Date().toISOString().split('T')[0]

    // Fetch today's case study with new template structure
    // Filter out soft-deleted cases with deleted_at IS NULL
    const { data: caseStudy, error } = await supabase
      .from('case_studies')
      .select(`
        id,
        title,
        the_question,
        read_time_minutes,
        what_happened,
        mental_model,
        answer_approach,
        pushback_scenarios,
        summary,
        interviewer_evaluation,
        common_mistakes,
        practice,
        source_type,
        source_url,
        company_name,
        industry,
        difficulty,
        question_type,
        seniority_level,
        frameworks_applicable,
        tags,
        asked_in_company,
        charts,
        scheduled_date,
        current_version
      `)
      .eq('scheduled_date', today)
      .eq('is_published', true)
      .is('deleted_at', null)
      .single()

    if (error || !caseStudy) {
      // No case for today - return a fallback
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No case study available for today',
          fallback: true,
          data: getFallbackCase(),
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200, // Still 200 so frontend can handle gracefully
        }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: caseStudy,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})

// Fallback case if nothing is scheduled - using new template structure
function getFallbackCase() {
  return {
    id: 'fallback',
    title: "Root Cause Analysis: Best Buy's $300 Million Button",
    the_question: "You're a PM consultant in 2009. A major e-commerce retailer's checkout page shows 45% abandonment at the registration wall. They want to know: should they remove the mandatory registration? How do you investigate and make a recommendation?",
    read_time_minutes: 3,
    what_happened: "Jared Spool's team discovered that a mandatory registration form was causing 45% cart abandonment. Users who tried to register often couldn't recover forgotten passwords (75% first-attempt failure). They replaced mandatory registration with guest checkout and an optional 'save info' prompt, resulting in $300M additional annual revenue.",
    mental_model: {
      flow: "Clarify → Scope → Decompose → Diagnose → Theorize → Validate → Solve",
      intro: "Before diving in, here's how to think about Root Cause Analysis problems:",
      steps: [
        "Clarify the problem statement and success metrics",
        "Scope the investigation boundaries",
        "Decompose the funnel into measurable stages",
        "Diagnose where the biggest drop-offs occur",
        "Theorize potential causes for each drop-off",
        "Validate theories with data and user research",
        "Solve with targeted interventions"
      ],
      disclaimer: "This isn't a rigid script—it's how strong PMs naturally think through problems. Now let's see it in action."
    },
    answer_approach: [
      {
        part_number: 1,
        title: "Clarify the Problem",
        time_estimate: "1 min",
        what_you_say: "Before I dive in, I'd like to understand a few things. When you say 45% abandonment, is that measured from cart page load to registration attempt, or from registration page load to completion?",
        questions_to_ask: ["What's the current conversion rate?", "How is abandonment measured?", "What's the business impact in revenue?"],
        thinking: "Cart abandonment → could be UX, could be pricing, could be trust → need to isolate the registration step specifically"
      },
      {
        part_number: 2,
        title: "Scope the Investigation",
        time_estimate: "1 min",
        what_you_say: "I want to focus specifically on the registration-to-payment transition since that's where the 45% drop occurs. I'll look at: user behavior data, error rates, and qualitative feedback.",
        questions_to_ask: ["Do we have session recordings?", "What does support hear from frustrated users?"],
        thinking: "Need to balance speed with thoroughness → focus on highest-impact stage first"
      },
      {
        part_number: 3,
        title: "Decompose the Funnel",
        time_estimate: "1 min",
        what_you_say: "Let me break down the registration step: New users attempting registration, existing users logging in, and password recovery flows. Each might have different failure modes.",
        questions_to_ask: ["What % are new vs returning?", "What's the password reset rate?"],
        thinking: "Registration → new user signup + returning user login + password recovery → each is a different problem"
      },
      {
        part_number: 4,
        title: "Diagnose Drop-off Points",
        time_estimate: "1 min",
        what_you_say: "Looking at the data: 60% of users who attempt registration are using previously registered emails, and 75% fail their first login attempt. This suggests password friction is the core issue.",
        questions_to_ask: [],
        thinking: "High password failure → users forget they registered → forced to recover → too much friction → abandon"
      },
      {
        part_number: 5,
        title: "Theorize Root Causes",
        time_estimate: "1 min",
        what_you_say: "I see three potential root causes: Users don't remember registering before, password recovery is too cumbersome, and the value exchange isn't clear—they just want to buy, not start a relationship.",
        questions_to_ask: [],
        thinking: "Mandatory registration = forced relationship → users want transactional, we're asking for commitment"
      },
      {
        part_number: 6,
        title: "Validate with Data",
        time_estimate: "1 min",
        what_you_say: "To validate, I'd look at: conversion rates of guest checkout on competitor sites, LTV of 'forced' registrations vs organic signups, and email engagement rates of checkout-captured emails.",
        questions_to_ask: ["What's the email open rate from checkout signups?"],
        thinking: "If forced registrations have low LTV anyway → we're losing sales for low-value email captures"
      },
      {
        part_number: 7,
        title: "Recommend Solution",
        time_estimate: "1 min",
        what_you_say: "My recommendation: Replace mandatory registration with guest checkout, add a soft prompt at confirmation ('Save info for faster checkout next time'). Track: conversion rate, optional signup rate, and 90-day repurchase rate.",
        questions_to_ask: [],
        thinking: "Guest checkout removes friction → optional signup captures willing users → better quality relationships"
      }
    ],
    pushback_scenarios: [
      {
        if_they_say: "But we'll lose email captures for marketing!",
        you_say: "Let's look at what those captures are worth. If 45% abandon and never buy, and forced signups have lower engagement anyway, we may be optimizing for a vanity metric. I'd rather have 55% of customers buying than 100% of emails with low engagement."
      },
      {
        if_they_say: "How do we know this will actually increase revenue?",
        you_say: "I'd propose an A/B test: 50% see current mandatory registration, 50% see guest checkout. Primary metric is completed purchases. We can also track optional signup rate to see if we still capture emails from willing users."
      },
      {
        if_they_say: "What about duplicate customer records?",
        you_say: "That's a valid operational concern. We can match by email at the optional signup step, or implement email lookup before checkout. The database complexity is manageable compared to $300M in lost revenue."
      }
    ],
    summary: {
      approach: ["Clarify", "Scope", "Decompose", "Diagnose", "Theorize", "Validate", "Solve"],
      key_insight: "Forced registration optimizes for email capture at the cost of completed sales—guest checkout with optional signup captures both willing customers and willing email subscribers."
    },
    interviewer_evaluation: [
      "Structured approach to breaking down the funnel",
      "Data-driven diagnosis of the core problem",
      "Consideration of business stakeholder concerns",
      "Clear articulation of trade-offs",
      "Specific, measurable success metrics",
      "Practical implementation recommendation",
      "Anticipation of objections with data-backed responses"
    ],
    common_mistakes: [
      "Jumping to solutions without understanding the data",
      "Ignoring stakeholder concerns (marketing's email needs)",
      "Not quantifying the business impact",
      "Proposing changes without a test plan",
      "Missing the 'forced vs earned' relationship insight",
      "Over-engineering when a simple solution works"
    ],
    practice: {
      question: "A SaaS product has 30% drop-off at the credit card entry step, even for a free trial. How would you investigate and solve this?",
      guidance: "Apply the same Clarify → Scope → Decompose → Diagnose → Theorize → Validate → Solve flow. Consider: Why is a credit card required for a free trial? What signals trust? What's the competitor landscape?"
    },
    source_type: "framework_classic",
    source_url: null,
    company_name: "Best Buy",
    industry: "E-commerce",
    difficulty: "intermediate",
    question_type: "Root Cause Analysis (RCA)",
    seniority_level: 1,
    frameworks_applicable: ["Funnel Analysis", "Customer Lifetime Value", "A/B Testing"],
    tags: ["conversion", "UX", "checkout", "growth"],
    asked_in_company: "Amazon",
    charts: [],
    scheduled_date: new Date().toISOString().split('T')[0],
  }
}