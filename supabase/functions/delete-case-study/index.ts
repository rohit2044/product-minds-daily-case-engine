/**
 * Delete Case Study Edge Function
 *
 * DELETE /delete-case-study
 *
 * Soft deletes a case study (sets deleted_at timestamp).
 * Creates a version record for audit trail.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DeletePayload {
  caseId: string
  reason?: string
  deletedBy?: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'DELETE' && req.method !== 'POST') {
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
    const payload: DeletePayload = await req.json()
    const { caseId, reason = null, deletedBy = 'api' } = payload

    if (!caseId) {
      return new Response(
        JSON.stringify({ success: false, error: 'caseId is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Check if case exists and is not already deleted
    const { data: existingCase, error: fetchError } = await supabase
      .from('case_studies')
      .select('id, title, is_published, scheduled_date, deleted_at')
      .eq('id', caseId)
      .single()

    if (fetchError || !existingCase) {
      return new Response(
        JSON.stringify({ success: false, error: 'Case study not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    if (existingCase.deleted_at) {
      return new Response(
        JSON.stringify({ success: false, error: 'Case study is already deleted' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Use database function for atomic soft delete with version tracking
    const { data: success, error: deleteError } = await supabase.rpc('soft_delete_case', {
      p_case_id: caseId,
      p_reason: reason,
      p_deleted_by: deletedBy,
    })

    if (deleteError) {
      console.error('Soft delete failed:', deleteError)
      return new Response(
        JSON.stringify({ success: false, error: deleteError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    if (!success) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to delete case study' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Case study "${existingCase.title}" has been soft deleted`,
        caseId,
        deletedAt: new Date().toISOString(),
        deletedBy,
        reason,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (err) {
    console.error('Delete error:', err)
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
