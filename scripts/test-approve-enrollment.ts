import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkAndApprove() {
  // Check Zach's enrollment status
  const { data: enrollment, error } = await supabase
    .from('email_funnel_enrollments')
    .select('id, status, lead:leads(first_name, last_name), funnel:email_funnels(name)')
    .eq('lead_id', '0978cc38-e737-42e0-b004-494dd1ba5a75')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error) {
    console.log('Error:', error.message)
    return
  }

  console.log('Enrollment found:')
  console.log('- ID:', enrollment.id)
  console.log('- Lead:', (enrollment.lead as any)?.first_name, (enrollment.lead as any)?.last_name)
  console.log('- Funnel:', (enrollment.funnel as any)?.name)
  console.log('- Status:', enrollment.status)

  if (enrollment.status === 'pending_approval') {
    console.log('\nApproving enrollment...')

    const { error: updateError } = await supabase
      .from('email_funnel_enrollments')
      .update({
        status: 'active',
        approved_at: new Date().toISOString(),
      })
      .eq('id', enrollment.id)

    if (updateError) {
      console.log('Error approving:', updateError.message)
    } else {
      console.log('✅ Enrollment approved successfully!')
      console.log('Zach is now enrolled in the Inbound Call Funnel!')

      // Update funnel total_enrolled
      const { data: funnel } = await supabase
        .from('email_funnels')
        .select('id, total_enrolled')
        .eq('name', 'Inbound Call Funnel')
        .single()

      if (funnel) {
        await supabase
          .from('email_funnels')
          .update({ total_enrolled: (funnel.total_enrolled || 0) + 1 })
          .eq('id', funnel.id)
        console.log('Updated funnel enrolled count')
      }
    }
  } else {
    console.log('\nEnrollment is not pending - current status:', enrollment.status)

    if (enrollment.status === 'active') {
      console.log('✅ Zach is already enrolled in the funnel!')
    }
  }
}

checkAndApprove().catch(console.error)
