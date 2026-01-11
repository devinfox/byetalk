import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get recent calls and their AI analysis status
const { data: calls } = await supabase
  .from('calls')
  .select('id, direction, status, duration_seconds, lead_id, ai_tasks_generated, ai_summary, ai_analysis_status, created_at, recording_url, transcription')
  .eq('is_deleted', false)
  .order('created_at', { ascending: false })
  .limit(20);

console.log('Recent calls:');
console.log('='.repeat(120));
calls?.forEach(c => {
  const hasRecording = c.recording_url ? 'REC' : 'NO-REC';
  const hasTranscript = c.transcription ? 'TRANS' : 'NO-TRANS';
  const aiStatus = c.ai_analysis_status || 'not_started';
  const taskGen = c.ai_tasks_generated ? 'TASKS' : 'NO-TASKS';
  console.log(c.id + ' | ' + (c.direction || '').padEnd(8) + ' | ' + ((c.duration_seconds || 0) + 's').padEnd(6) + ' | ' + hasRecording.padEnd(6) + ' | ' + hasTranscript.padEnd(9) + ' | ' + aiStatus.padEnd(12) + ' | ' + taskGen);
});

// Count unprocessed calls
const unprocessed = calls?.filter(c => c.ai_tasks_generated !== true && (c.recording_url || c.transcription));
console.log('');
console.log('Unprocessed calls with recordings/transcripts:', unprocessed?.length || 0);
if (unprocessed && unprocessed.length > 0) {
  console.log('IDs to process:');
  unprocessed.forEach(c => console.log('  - ' + c.id));
}
