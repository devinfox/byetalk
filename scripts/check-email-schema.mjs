import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ohpjilsntlmlusgbpest.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ocGppbHNudGxtbHVzZ2JwZXN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzM4NDM1OSwiZXhwIjoyMDgyOTYwMzU5fQ.esTPD_elrxP0pfvRUHyy2aMnp9_LCHdhAGTISO9Xq-k'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkSchema() {
  console.log('Checking email_domains table...')

  // Try to select from email_domains
  const { data, error } = await supabase
    .from('email_domains')
    .select('*')
    .limit(1)

  if (error) {
    console.log('Error:', error.message)
    if (error.message.includes('does not exist')) {
      console.log('\nTable email_domains does not exist - migration needs to be applied')
    }
  } else {
    console.log('Table exists! Sample data:', data)
  }

  // Check email_accounts
  console.log('\nChecking email_accounts table...')
  const { data: accounts, error: accError } = await supabase
    .from('email_accounts')
    .select('*')
    .limit(1)

  if (accError) {
    console.log('Error:', accError.message)
  } else {
    console.log('Table exists! Sample data:', accounts)
  }
}

checkSchema().catch(console.error)
