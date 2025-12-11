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

    // Fetch today's case study
    const { data: caseStudy, error } = await supabase
      .from('case_studies')
      .select(`
        id,
        title,
        hook,
        story_content,
        challenge_prompt,
        hints,
        source_type,
        source_url,
        company_name,
        industry,
        difficulty,
        frameworks_applicable,
        tags,
        scheduled_date
      `)
      .eq('scheduled_date', today)
      .eq('is_published', true)
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

// Fallback case if nothing is scheduled
function getFallbackCase() {
  return {
    id: 'fallback',
    title: "The $300 Million Button",
    hook: "In 2009, a single form field was costing one company $300 million per year. The fix took less than a day.",
    story_content: `Jared Spool had seen countless checkout flows in his career as a UX consultant, but the one he examined in early 2009 puzzled him. A major e-commerce retailer—one processing over $25 billion in annual transactions—had hired his team to investigate their climbing cart abandonment rate.

The culprit wasn't hard to find. Right there, between the shopping cart and payment, sat an innocent-looking form: "Register or Login to continue."

The retailer's logic seemed sound. Registered users returned more often. They had higher lifetime value. The marketing team could email them promotions. Every best practice document said to capture that email address.

But Spool's team ran the numbers differently. They tracked users who hit that registration wall. 45% abandoned immediately. Of those who attempted to register, 60% used an email they'd forgotten the password for, got frustrated with recovery, and left. The "returning customer" login had a 75% failure rate on the first attempt.

"People just wanted to buy a TV," one team member noted during the debrief. "We were asking them to enter a relationship."

The proposed solution was radical for its time: remove the registration requirement entirely. Let people check out as guests. Add a soft prompt at the end: "Want to save your information for next time?"

The pushback was immediate. Marketing protested losing email captures. The database team warned about duplicate customer records. The CEO questioned whether this was really worth the risk.

Spool had the data, but data doesn't always win arguments. He needed to frame this as more than a UX fix—it was a business model question. What was more valuable: a forced registration that 45% of users abandoned, or a completed sale with an optional relationship?

The meeting with the executive team was scheduled for Monday morning.`,
    challenge_prompt: "You're Jared, about to present to skeptical executives. Marketing wants emails, the CEO wants ROI math, and you have one shot to make your case. How do you structure your argument? What metrics do you propose tracking to prove the change works? And how do you address the legitimate concern about losing customer data?",
    hints: [
      "Consider the difference between forced value exchange and earned trust",
      "What's the actual conversion rate of those 'captured' emails into repeat purchases?",
      "Think about the lifetime value calculation differently—what's the LTV of a customer who never completed their first purchase?"
    ],
    source_type: "framework_classic",
    source_url: null,
    company_name: "Best Buy",
    industry: "E-commerce",
    difficulty: "intermediate",
    frameworks_applicable: ["Funnel Analysis", "Customer Lifetime Value", "A/B Testing"],
    tags: ["conversion", "UX", "checkout", "growth"],
    scheduled_date: new Date().toISOString().split('T')[0],
  }
}
