import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

async function processCall(callId) {
  console.log(`Processing call: ${callId}`);

  try {
    const response = await fetch(`${APP_URL}/api/calls/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId }),
    });

    const result = await response.json();

    if (response.ok) {
      console.log(`  ✅ Success:`, {
        summary: result.summary?.substring(0, 100) + '...',
        tasksCreated: result.tasksCreated,
        leadCreated: result.leadCreated,
        leadProfileUpdated: result.leadProfileUpdated,
      });
      return true;
    } else {
      console.log(`  ❌ Error:`, result.error);
      return false;
    }
  } catch (err) {
    console.log(`  ❌ Failed:`, err.message);
    return false;
  }
}

// Get all calls with recordings that haven't been AI processed
const { data: unprocessedCalls } = await supabase
  .from('calls')
  .select('id, direction, duration_seconds, recording_url, created_at')
  .eq('is_deleted', false)
  .eq('ai_tasks_generated', false)
  .not('recording_url', 'is', null)
  .order('created_at', { ascending: true });

console.log(`Found ${unprocessedCalls?.length || 0} unprocessed calls with recordings`);
console.log('');

if (unprocessedCalls && unprocessedCalls.length > 0) {
  let processed = 0;
  let failed = 0;

  for (const call of unprocessedCalls) {
    console.log(`\n[${processed + failed + 1}/${unprocessedCalls.length}] Call from ${new Date(call.created_at).toLocaleString()}`);
    console.log(`  Direction: ${call.direction}, Duration: ${call.duration_seconds}s`);

    const success = await processCall(call.id);
    if (success) {
      processed++;
    } else {
      failed++;
    }

    // Small delay between calls to avoid overwhelming the API
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n' + '='.repeat(50));
  console.log(`Done! Processed: ${processed}, Failed: ${failed}`);
} else {
  console.log('No unprocessed calls found');
}
