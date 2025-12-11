/**
 * Check Buffer - Reports how many days of content are ready
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function main() {
  try {
    const { data, error } = await supabase.rpc('get_buffer_status');
    
    if (error) {
      console.error('Error checking buffer:', error.message);
      console.log('7'); // Default fallback
      return;
    }
    
    const status = data?.[0];
    const bufferDays = status?.days_of_buffer || 0;
    
    // Output just the number for GitHub Actions to capture
    console.log(bufferDays);
    
  } catch (error) {
    console.error('Error:', error.message);
    console.log('7'); // Default fallback
  }
}

main();
