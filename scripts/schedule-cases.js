/**
 * Schedule Cases - Assigns unscheduled cases to upcoming dates
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function main() {
  console.log('📅 Scheduling cases for upcoming days...');
  
  const daysToSchedule = 14;
  let scheduled = 0;
  
  for (let i = 0; i < daysToSchedule; i++) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + i);
    const dateStr = targetDate.toISOString().split('T')[0];
    
    // Check if already scheduled
    const { data: existing } = await supabase
      .from('case_studies')
      .select('id')
      .eq('scheduled_date', dateStr)
      .single();
    
    if (existing) {
      continue; // Already scheduled
    }
    
    // Try to schedule
    const { data: caseId, error } = await supabase.rpc('schedule_next_case', {
      target_date: dateStr,
    });
    
    if (caseId) {
      console.log(`   ✅ Scheduled case for ${dateStr}`);
      scheduled++;
    } else if (!error) {
      console.log(`   ⚠️ No case available for ${dateStr}`);
    }
  }
  
  console.log(`\n📊 Scheduled ${scheduled} new cases`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
