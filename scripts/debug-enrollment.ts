import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function debugEnrollment() {
  console.log('=== Debugging Recent Enrollments ===\n')

  // Get recent enrollments
  const { data: enrollments, error } = await supabase
    .from('email_funnel_enrollments')
    .select(`
      id,
      status,
      enrolled_by,
      enrolled_at,
      match_reason,
      lead:leads(id, first_name, last_name, phone),
      funnel:email_funnels(id, name)
    `)
    .order('enrolled_at', { ascending: false })
    .limit(5)

  if (error) {
    console.log('Error:', error.message)
    return
  }

  console.log('Recent enrollments:')
  enrollments?.forEach((e, i) => {
    console.log(`\n${i + 1}. Enrollment ${e.id}`)
    console.log(`   Status: ${e.status}`)
    console.log(`   Enrolled by: ${e.enrolled_by}`)
    console.log(`   Enrolled at: ${e.enrolled_at}`)
    console.log(`   Lead: ${(e.lead as any)?.first_name} ${(e.lead as any)?.last_name} (${(e.lead as any)?.id})`)
    console.log(`   Funnel: ${(e.funnel as any)?.name}`)
    console.log(`   Match reason: ${e.match_reason}`)
  })

  // Get recent calls to see if user_id is set
  console.log('\n\n=== Recent Calls ===\n')
  const { data: calls } = await supabase
    .from('calls')
    .select('id, direction, from_number, to_number, user_id, started_at')
    .order('started_at', { ascending: false })
    .limit(5)

  calls?.forEach((c, i) => {
    console.log(`${i + 1}. ${c.direction} call from ${c.from_number} to ${c.to_number}`)
    console.log(`   user_id: ${c.user_id || 'NOT SET'}`)
    console.log(`   started_at: ${c.started_at}`)
  })

  // Get users to compare IDs
  console.log('\n\n=== Users ===\n')
  const { data: users } = await supabase
    .from('users')
    .select('id, auth_id, first_name, last_name, email')
    .limit(10)

  users?.forEach(u => {
    console.log(`${u.first_name} ${u.last_name}`)
    console.log(`   users.id: ${u.id}`)
    console.log(`   auth_id: ${u.auth_id}`)
    console.log(`   email: ${u.email}`)
  })
}

debugEnrollment().catch(console.error)
