import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://ohpjilsntlmlusgbpest.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ocGppbHNudGxtbHVzZ2JwZXN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzM4NDM1OSwiZXhwIjoyMDgyOTYwMzU5fQ.esTPD_elrxP0pfvRUHyy2aMnp9_LCHdhAGTISO9Xq-k'
)

// Check leads columns
console.log('=== LEADS COLUMNS ===')
const { data: lead } = await supabase.from('leads').select('*').limit(1)
if (lead && lead[0]) console.log(Object.keys(lead[0]))

// Check deals columns
console.log('\n=== DEALS COLUMNS ===')
const { data: deal } = await supabase.from('deals').select('*').limit(1)
if (deal && deal[0]) console.log(Object.keys(deal[0]))

// Check campaigns
console.log('\n=== CAMPAIGNS ===')
const { data: campaigns } = await supabase.from('campaigns').select('*').limit(1)
if (campaigns && campaigns[0]) console.log(Object.keys(campaigns[0]))

// Check messages table
console.log('\n=== MESSAGES ===')
const { data: messages } = await supabase.from('messages').select('*').limit(1)
if (messages && messages[0]) console.log(Object.keys(messages[0]))
