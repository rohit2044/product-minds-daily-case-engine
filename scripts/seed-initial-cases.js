import 'dotenv/config';
/**
 * Seed Initial Cases
 * 
 * Generates the first ~15 case studies to create a smaller buffer before launch.
 * Run this once during initial setup.
 * 
 * Usage: npm run seed
 */

import { generateDailyCases } from './case-generator.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const SOURCE_TYPES = [
  'historical_wikipedia',
  'historical_archive', 
  'live_news_techcrunch',
  'live_news_hackernews',
  'company_blog',
  'company_sec_filing',
  'framework_classic',
];

async function seed() {
  console.log('🌱 Seeding initial case studies...\n');
  console.log('This will generate ~15 cases across all source types.');
  console.log('Estimated time: 10-15 minutes');

  const results = {
    generated: 0,
    failed: 0,
    skipped: 0,
  };
  
  // Generate ~2 cases per source type (3 for framework_classic)
  for (const sourceType of SOURCE_TYPES) {
    console.log(`\n📂 Generating cases from: ${sourceType}`);
    console.log('─'.repeat(50));
    
    const casesPerType = sourceType === 'framework_classic' ? 3 : 2;
    
    for (let i = 0; i < casesPerType; i++) {
      try {
        console.log(`\n  Case ${i + 1}/${casesPerType}...`);
        
        const result = await generateDailyCases({
          count: 1,
          forceSourceType: sourceType,
          dryRun: false,
        });
        
        results.generated += result.generated.length;
        results.skipped += result.skipped.length;
        results.failed += result.failed.length;
        
        // Rate limiting - wait between API calls
        if (i < casesPerType - 1) {
          console.log('  ⏳ Waiting 3 seconds...');
          await sleep(3000);
        }
        
      } catch (error) {
        console.error(`  ❌ Error:`, error);
        console.error(`Stack trace:`, error.stack);
        results.failed++;
      }
    }
  }
  
  // Schedule the generated cases
  console.log('\n\n📅 Scheduling generated cases...');
  await scheduleAllCases();
  
  // Print final summary
  console.log('\n' + '═'.repeat(50));
  console.log('🌱 SEED COMPLETE');
  console.log('═'.repeat(50));
  console.log(`✅ Generated: ${results.generated}`);
  console.log(`⏭️ Skipped (duplicates): ${results.skipped}`);
  console.log(`❌ Failed: ${results.failed}`);
  
  // Check buffer status
  const { data: buffer } = await supabase.rpc('get_buffer_status');
  if (buffer?.[0]) {
    console.log(`\n📊 Buffer Status:`);
    console.log(`   Days of content ready: ${buffer[0].days_of_buffer}`);
    console.log(`   Total cases: ${buffer[0].total_unpublished}`);
  }
  
  console.log('\n✨ Your case engine is ready to go!');
}

async function scheduleAllCases() {
  // Get all unscheduled cases
  const { data: unscheduled } = await supabase
    .from('case_studies')
    .select('id, source_type')
    .is('scheduled_date', null)
    .order('created_at', { ascending: true });
  
  if (!unscheduled || unscheduled.length === 0) {
    console.log('  No cases to schedule');
    return;
  }
  
  // Schedule starting from today
  const startDate = new Date();
  startDate.setDate(startDate.getDate());
  
  for (let i = 0; i < unscheduled.length; i++) {
    const targetDate = new Date(startDate);
    targetDate.setDate(targetDate.getDate() + i);
    const dateStr = targetDate.toISOString().split('T')[0];
    
    await supabase
      .from('case_studies')
      .update({ 
        scheduled_date: dateStr,
        is_published: true,
      })
      .eq('id', unscheduled[i].id);
    
    console.log(`  📅 Scheduled case for ${dateStr}`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run seed
seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
