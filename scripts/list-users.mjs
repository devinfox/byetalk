import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://ohpjilsntlmlusgbpest.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ocGppbHNudGxtbHVzZ2JwZXN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzM4NDM1OSwiZXhwIjoyMDgyOTYwMzU5fQ.esTPD_elrxP0pfvRUHyy2aMnp9_LCHdhAGTISO9Xq-k'
)

// First, list all users with all columns
const { data: users, error } = await supabase
  .from('users')
  .select('*')
  .order('created_at')

if (error) {
  console.error('Error:', error)
  process.exit(1)
}

console.log('Current users:')
users.forEach(u => console.log(JSON.stringify(u, null, 2)))
