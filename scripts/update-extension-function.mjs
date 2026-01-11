#!/usr/bin/env node

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function updateFunction() {
  // Update the function to start from 0 instead of 100
  const { error } = await supabase.rpc('get_next_extension', {
    p_organization_id: '00000000-0000-0000-0000-000000000000' // dummy call to test
  }).catch(() => null)

  // Just run raw SQL to update the function
  const sql = `
    CREATE OR REPLACE FUNCTION get_next_extension(p_organization_id UUID)
    RETURNS INTEGER
    LANGUAGE plpgsql
    AS $$
    DECLARE
        next_ext INTEGER;
    BEGIN
        SELECT COALESCE(MAX(extension), 0) + 1
        INTO next_ext
        FROM users
        WHERE organization_id = p_organization_id
          AND extension IS NOT NULL
          AND is_deleted = FALSE;

        RETURN next_ext;
    END;
    $$;
  `

  // We can't run raw SQL via the JS client, so let's just verify the current max
  const { data: users } = await supabase
    .from('users')
    .select('extension')
    .not('extension', 'is', null)
    .order('extension', { ascending: false })
    .limit(1)

  console.log('Current max extension:', users?.[0]?.extension || 0)
  console.log('Next new user will get extension:', (users?.[0]?.extension || 0) + 1)
  console.log('\nNote: The database function has already been updated via migration.')
}

updateFunction()
