/**
 * Run Generator - Entry point for GitHub Actions
 */

import { generateDailyCases, getBufferStatus, scheduleUpcomingDays } from './case-generator.js';

async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const options = {
    count: 1,
    forceSourceType: null,
    dryRun: false,
  };
  
  for (const arg of args) {
    if (arg.startsWith('--count=')) {
      options.count = parseInt(arg.split('=')[1]) || 1;
    } else if (arg.startsWith('--source=')) {
      options.forceSourceType = arg.split('=')[1] || null;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }
  
  console.log('🚀 Starting case generation with options:', options);
  
  try {
    const results = await generateDailyCases(options);
    
    // Output for GitHub Actions
    console.log('\n📊 Results:');
    console.log(`   Generated: ${results.generated.length}`);
    console.log(`   Skipped: ${results.skipped.length}`);
    console.log(`   Failed: ${results.failed.length}`);
    
    if (results.failed.length > 0) {
      console.error('\n❌ Failures:');
      results.failed.forEach(f => console.error(`   - ${f.error}`));
      process.exit(1);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();
