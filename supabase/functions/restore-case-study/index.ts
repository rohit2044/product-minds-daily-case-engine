/**
 * Restore Case Study Edge Function
 *
 * POST /restore-case-study
 *
 * Restores a soft-deleted case study.
 * Creates a version record for audit trail.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RestorePayload {
  caseId: string
  restoredBy?: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 405 }
    )
  }

  try {
    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request body
    const payload: RestorePayload = await req.json()
    const { caseId, restoredBy = 'api' } = payload

    if (!caseId) {
      return new Response(
        JSON.stringify({ success: false, error: 'caseId is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Check if case exists and IS deleted
    const { data: existingCase, error: fetchError } = await supabase
      .from('case_studies')
      .select('id, title, deleted_at, delete_reason')
      .eq('id', caseId)
      .single()

    if (fetchError || !existingCase) {
      return new Response(
        JSON.stringify({ success: false, error: 'Case study not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    if (!existingCase.deleted_at) {
      return new Response(
        JSON.stringify({ success: false, error: 'Case study is not deleted' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Use database function for atomic restore with version tracking
    const { data: success, error: restoreError } = await supabase.rpc('restore_case', {
      p_case_id: caseId,
      p_restored_by: restoredBy,
    })

    if (restoreError) {
      console.error('Restore failed:', restoreError)
      return new Response(
        JSON.stringify({ success: false, error: restoreError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    if (!success) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to restore case study' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Fetch the restored case
    const { data: restoredCase } = await supabase
      .from('case_studies')
      .select('id, title, is_published, scheduled_date')
      .eq('id', caseId)
      .single()

    return new Response(
      JSON.stringify({
        success: true,
        message: `Case study "${existingCase.title}" has been restored`,
        data: restoredCase,
        restoredBy,
        previousDeleteReason: existingCase.delete_reason,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (err) {
    console.error('Restore error:', err)
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
