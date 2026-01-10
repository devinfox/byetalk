import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ohpjilsntlmlusgbpest.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ocGppbHNudGxtbHVzZ2JwZXN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzM4NDM1OSwiZXhwIjoyMDgyOTYwMzU5fQ.esTPD_elrxP9pfvRUHyy2aMnp9_LCHdhAGTISO9Xq-k'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  console.log('Running email system migration...')

  const migrationPath = path.join(__dirname, '../supabase/migrations/00019_email_system.sql')
  const sql = fs.readFileSync(migrationPath, 'utf8')

  // Split into individual statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))

  console.log(`Found ${statements.length} SQL statements`)

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i]
    if (!statement || statement.startsWith('--')) continue

    try {
      const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' })
      if (error) {
        // Check if it's a "already exists" type error
        if (error.message?.includes('already exists') || error.message?.includes('duplicate')) {
          console.log(`Statement ${i + 1}: Already exists (skipping)`)
        } else {
          console.error(`Statement ${i + 1} error:`, error.message)
        }
      } else {
        console.log(`Statement ${i + 1}: OK`)
      }
    } catch (err) {
      console.error(`Statement ${i + 1} exception:`, err.message)
    }
  }

  console.log('Migration complete!')
}

runMigration().catch(console.error)
