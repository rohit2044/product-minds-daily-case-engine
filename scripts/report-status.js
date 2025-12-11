/**
 * Report Status - Generates markdown report for GitHub Actions summary
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function main() {
  // Get buffer status
  const { data: bufferData } = await supabase.rpc('get_buffer_status');
  const buffer = bufferData?.[0] || {};
  
  // Get recent generation stats
  const { data: recentLogs } = await supabase
    .from('generation_logs')
    .select('status, created_at')
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
  
  const stats = {
    total: recentLogs?.length || 0,
    completed: recentLogs?.filter(l => l.status === 'completed').length || 0,
    failed: recentLogs?.filter(l => l.status === 'failed').length || 0,
    skipped: recentLogs?.filter(l => l.status === 'skipped_duplicate').length || 0,
  };
  
  // Get today's case
  const { data: todaysCase } = await supabase
    .from('case_studies')
    .select('title, company_name, source_type')
    .eq('scheduled_date', new Date().toISOString().split('T')[0])
    .single();
  
  // Output markdown
  console.log(`
### Buffer Status
| Metric | Value |
|--------|-------|
| Days of content ready | ${buffer.days_of_buffer || 0} |
| Total unpublished cases | ${buffer.total_unpublished || 0} |
| Next empty date | ${buffer.next_empty_date || 'N/A'} |

### Last 7 Days Generation
| Status | Count |
|--------|-------|
| ✅ Completed | ${stats.completed} |
| ⏭️ Skipped (duplicate) | ${stats.skipped} |
| ❌ Failed | ${stats.failed} |
| **Total** | **${stats.total}** |

### Today's Case
${todaysCase ? `
**${todaysCase.title}**
- Company: ${todaysCase.company_name || 'N/A'}
- Source: ${todaysCase.source_type}
` : '⚠️ No case scheduled for today'}
  `.trim());
}

main().catch(err => {
  console.error('Error generating report:', err.message);
});
