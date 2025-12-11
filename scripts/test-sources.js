/**
 * Test Sources - Verify all content sources are working
 * 
 * Run with: npm run test:sources
 */

import { fetchFromWikipedia } from './sources/wikipedia.js';
import { fetchFromArchiveOrg } from './sources/archive-org.js';
import { fetchFromTechCrunch } from './sources/techcrunch.js';
import { fetchFromHackerNews } from './sources/hackernews.js';
import { fetchFromCompanyBlogs } from './sources/company-blogs.js';
import { fetchFromSECEdgar } from './sources/sec-edgar.js';
import { fetchFromProductHunt } from './sources/producthunt.js';
import { generateFrameworkCase } from './sources/framework-cases.js';

const sources = [
  { name: 'Wikipedia', fetcher: fetchFromWikipedia },
  { name: 'Archive.org', fetcher: fetchFromArchiveOrg },
  { name: 'TechCrunch', fetcher: fetchFromTechCrunch },
  { name: 'Hacker News', fetcher: fetchFromHackerNews },
  { name: 'Company Blogs', fetcher: fetchFromCompanyBlogs },
  { name: 'SEC Edgar', fetcher: fetchFromSECEdgar },
  { name: 'Product Hunt', fetcher: fetchFromProductHunt },
  { name: 'Framework Cases', fetcher: generateFrameworkCase },
];

async function testAllSources() {
  console.log('🧪 Testing all content sources...\n');
  console.log('═'.repeat(60));

  const results = [];

  for (const source of sources) {
    console.log(`\n📂 Testing: ${source.name}`);
    console.log('─'.repeat(40));

    const startTime = Date.now();

    try {
      const content = await source.fetcher();
      const duration = Date.now() - startTime;

      console.log(`✅ Success (${duration}ms)`);
      console.log(`   Title: ${content.title?.substring(0, 50)}...`);
      console.log(`   Company: ${content.companyName || 'N/A'}`);
      console.log(`   Content length: ${content.content?.length || 0} chars`);
      console.log(`   Source URL: ${content.sourceUrl || 'N/A'}`);

      results.push({
        name: source.name,
        status: 'success',
        duration,
        title: content.title,
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`❌ Failed (${duration}ms)`);
      console.log(`   Error: ${error.message}`);

      results.push({
        name: source.name,
        status: 'failed',
        duration,
        error: error.message,
      });
    }

    // Rate limiting between sources
    await sleep(1000);
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('═'.repeat(60));

  const successful = results.filter(r => r.status === 'success');
  const failed = results.filter(r => r.status === 'failed');

  console.log(`\n✅ Passed: ${successful.length}/${results.length}`);
  console.log(`❌ Failed: ${failed.length}/${results.length}`);

  if (failed.length > 0) {
    console.log('\n⚠️ Failed sources:');
    failed.forEach(f => {
      console.log(`   - ${f.name}: ${f.error}`);
    });
  }

  console.log('\n📈 Performance:');
  results
    .filter(r => r.status === 'success')
    .sort((a, b) => a.duration - b.duration)
    .forEach(r => {
      console.log(`   ${r.name}: ${r.duration}ms`);
    });

  // Exit with error if any failed
  if (failed.length > 0) {
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

testAllSources().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
