import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function updateUsers() {
  const kyleAuthId = 'e7c0e7cc-51c0-453c-84d5-5eca5d778f29'

  // 1. Find and delete any existing Devin Fox users (except Kyle's record)
  const { data: devinUsers } = await supabase
    .from('users')
    .select('id, auth_id, first_name, last_name')
    .ilike('first_name', '%devin%')

  console.log('Found Devin users:', devinUsers?.length || 0)

  for (const user of devinUsers || []) {
    if (user.auth_id !== kyleAuthId) {
      console.log('Deleting:', user.first_name, user.last_name, user.auth_id)

      // Delete from users table
      await supabase.from('users').delete().eq('id', user.id)

      // Delete from auth if auth_id exists
      if (user.auth_id) {
        await supabase.auth.admin.deleteUser(user.auth_id)
      }
    }
  }

  // 2. Rename Kyle Mahogany to Devin Fox
  const { data: userData, error: updateUserError } = await supabase
    .from('users')
    .update({ first_name: 'Devin', last_name: 'Fox' })
    .eq('auth_id', kyleAuthId)
    .select()

  if (updateUserError) {
    console.log('Error updating users table:', updateUserError.message)
  } else {
    console.log('Updated users table:', userData?.[0]?.first_name, userData?.[0]?.last_name)
  }

  // Update auth metadata
  const { data: authData, error: updateAuthError } = await supabase.auth.admin.updateUserById(kyleAuthId, {
    user_metadata: {
      full_name: 'Devin Fox',
      first_name: 'Devin',
      last_name: 'Fox'
    }
  })

  if (updateAuthError) {
    console.log('Error updating auth:', updateAuthError.message)
  } else {
    console.log('Updated auth metadata:', authData.user?.user_metadata?.full_name)
  }

  console.log('\nDone!')
}

updateUsers()
