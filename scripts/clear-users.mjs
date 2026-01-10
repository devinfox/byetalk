import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://ohpjilsntlmlusgbpest.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ocGppbHNudGxtbHVzZ2JwZXN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzM4NDM1OSwiZXhwIjoyMDgyOTYwMzU5fQ.esTPD_elrxP0pfvRUHyy2aMnp9_LCHdhAGTISO9Xq-k'
)

// IDs to keep
const keepIds = [
  'b6fb12d7-9c5f-4bc8-88d8-e4250818d5e6', // George Smith
  '91be36f6-0b74-4956-8017-e9f9268035dc', // Devin Fox (capitalized)
]
const georgeId = 'b6fb12d7-9c5f-4bc8-88d8-e4250818d5e6'

async function clearTable(table, column, action = 'update') {
  console.log(`Clearing ${table}.${column}...`)
  let result
  if (action === 'update') {
    result = await supabase
      .from(table)
      .update({ [column]: georgeId })
      .not(column, 'in', `(${keepIds.join(',')})`)
  } else if (action === 'null') {
    result = await supabase
      .from(table)
      .update({ [column]: null })
      .not(column, 'in', `(${keepIds.join(',')})`)
  } else if (action === 'delete') {
    result = await supabase
      .from(table)
      .delete()
      .not(column, 'in', `(${keepIds.join(',')})`)
  }
  if (result.error) console.error(`  Error: ${result.error.message}`)
  return result
}

// Clear all team references first
console.log('\n=== STEP 1: Clear team references ===')
await supabase.from('users').update({ team_id: null, reports_to: null }).neq('id', '00000000-0000-0000-0000-000000000000')
await supabase.from('campaigns').update({ assigned_team_id: null, assigned_user_id: null }).neq('id', '00000000-0000-0000-0000-000000000000')
await supabase.from('teams').delete().neq('id', '00000000-0000-0000-0000-000000000000')

console.log('\n=== STEP 2: Clear task references ===')
await clearTable('tasks', 'assigned_to', 'update')
await clearTable('tasks', 'assigned_by', 'null')
await clearTable('tasks', 'completed_by', 'null')

console.log('\n=== STEP 3: Clear other table references ===')
await clearTable('calls', 'user_id', 'update')
await clearTable('activity_log', 'user_id', 'delete')
await clearTable('email_templates', 'created_by', 'null')
await clearTable('leads', 'owner_id', 'update')
await clearTable('deals', 'owner_id', 'update')
await clearTable('deals', 'secondary_owner_id', 'null')
await clearTable('deals', 'original_owner_id', 'null')
await clearTable('contacts', 'owner_id', 'update')
await clearTable('system_events', 'user_id', 'delete')
await clearTable('notes', 'created_by', 'update')
await clearTable('messages', 'sender_id', 'delete')
await clearTable('messages', 'recipient_id', 'delete')

// Also check for commission_entries and other tables
await clearTable('commission_entries', 'user_id', 'delete')
await clearTable('commission_entries', 'approved_by', 'null')

console.log('\n=== STEP 4: Delete users ===')
const { data, error } = await supabase
  .from('users')
  .delete()
  .not('id', 'in', `(${keepIds.join(',')})`)
  .select()

if (error) {
  console.error('Error deleting users:', error)
  process.exit(1)
}

console.log(`\nDeleted ${data.length} users:`)
data.forEach(u => console.log(`- ${u.first_name} ${u.last_name} (${u.email})`))

// Verify remaining users
const { data: remaining } = await supabase
  .from('users')
  .select('id, first_name, last_name, email')
  .order('first_name')

console.log('\nRemaining users:')
remaining.forEach(u => console.log(`- ${u.first_name} ${u.last_name} (${u.email})`))
