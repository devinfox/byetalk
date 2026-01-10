import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PHONE_TO_REMOVE = '8182092305'

// Normalize phone number for matching (handles different formats)
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10)
}

async function removePhoneRecords() {
  const normalizedPhone = normalizePhone(PHONE_TO_REMOVE)

  console.log(`\n=== Removing all records for phone: ${PHONE_TO_REMOVE} ===\n`)
  console.log(`Normalized phone: ${normalizedPhone}\n`)

  // 1. Find leads with this phone number
  const { data: leads, error: leadsError } = await supabase
    .from('leads')
    .select('id, first_name, last_name, phone, phone_secondary')
    .or(`phone.ilike.%${normalizedPhone}%,phone_secondary.ilike.%${normalizedPhone}%`)

  if (leadsError) {
    console.error('Error finding leads:', leadsError.message)
  } else {
    console.log(`Found ${leads?.length || 0} leads:`)
    leads?.forEach(lead => {
      console.log(`  - ${lead.first_name} ${lead.last_name} (${lead.id})`)
    })
  }

  const leadIds = leads?.map(l => l.id) || []

  // 2. Find calls with this phone number
  const { data: calls, error: callsError } = await supabase
    .from('calls')
    .select('id, from_number, to_number, direction, started_at')
    .or(`from_number.ilike.%${normalizedPhone}%,to_number.ilike.%${normalizedPhone}%`)

  if (callsError) {
    console.error('Error finding calls:', callsError.message)
  } else {
    console.log(`\nFound ${calls?.length || 0} calls:`)
    calls?.forEach(call => {
      console.log(`  - ${call.direction}: ${call.from_number} -> ${call.to_number} (${call.id})`)
    })
  }

  const callIds = calls?.map(c => c.id) || []

  // 3. Find contacts with this phone
  const { data: contacts, error: contactsError } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, phone')
    .or(`phone.ilike.%${normalizedPhone}%,phone_secondary.ilike.%${normalizedPhone}%`)

  if (contactsError) {
    console.error('Error finding contacts:', contactsError.message)
  } else {
    console.log(`\nFound ${contacts?.length || 0} contacts:`)
    contacts?.forEach(contact => {
      console.log(`  - ${contact.first_name} ${contact.last_name} (${contact.id})`)
    })
  }

  const contactIds = contacts?.map(c => c.id) || []

  // Now delete in order (respecting foreign keys)
  console.log('\n--- Starting deletion ---\n')

  // Delete email_funnel_enrollments for these leads
  if (leadIds.length > 0) {
    const { error: enrollError, count: enrollCount } = await supabase
      .from('email_funnel_enrollments')
      .delete()
      .in('lead_id', leadIds)

    if (enrollError) {
      console.log('Error deleting funnel enrollments:', enrollError.message)
    } else {
      console.log(`Deleted funnel enrollments for leads`)
    }
  }

  // Delete email_drafts for these leads
  if (leadIds.length > 0) {
    const { error: draftsError } = await supabase
      .from('email_drafts')
      .delete()
      .in('lead_id', leadIds)

    if (draftsError) {
      console.log('Error deleting email drafts:', draftsError.message)
    } else {
      console.log(`Deleted email drafts for leads`)
    }
  }

  // Delete emails for these leads
  if (leadIds.length > 0) {
    const { error: emailsError } = await supabase
      .from('emails')
      .delete()
      .in('lead_id', leadIds)

    if (emailsError) {
      console.log('Error deleting emails:', emailsError.message)
    } else {
      console.log(`Deleted emails for leads`)
    }
  }

  // Delete ai_tasks for these leads
  if (leadIds.length > 0) {
    const { error: tasksError } = await supabase
      .from('ai_tasks')
      .delete()
      .in('lead_id', leadIds)

    if (tasksError) {
      console.log('Error deleting AI tasks:', tasksError.message)
    } else {
      console.log(`Deleted AI tasks for leads`)
    }
  }

  // Delete call_tag_assignments for these calls
  if (callIds.length > 0) {
    const { error: tagError } = await supabase
      .from('call_tag_assignments')
      .delete()
      .in('call_id', callIds)

    if (tagError) {
      console.log('Error deleting call tags:', tagError.message)
    } else {
      console.log(`Deleted call tag assignments`)
    }
  }

  // Delete tasks that reference these calls
  if (callIds.length > 0) {
    const { error: callTasksError } = await supabase
      .from('tasks')
      .delete()
      .in('call_id', callIds)

    if (callTasksError) {
      console.log('Error deleting tasks for calls:', callTasksError.message)
    } else {
      console.log(`Deleted tasks referencing calls`)
    }
  }

  // Delete deals for these contacts first (before deleting contacts)
  if (contactIds.length > 0) {
    // First find deals for these contacts
    const { data: contactDeals } = await supabase
      .from('deals')
      .select('id')
      .in('contact_id', contactIds)

    const contactDealIds = contactDeals?.map(d => d.id) || []

    if (contactDealIds.length > 0) {
      // Delete deal_stage_history first
      const { error: dealHistoryError } = await supabase
        .from('deal_stage_history')
        .delete()
        .in('deal_id', contactDealIds)

      if (dealHistoryError) {
        console.log('Error deleting deal stage history:', dealHistoryError.message)
      } else {
        console.log(`Deleted deal stage history`)
      }

      // Delete commissions
      const { error: commissionsError } = await supabase
        .from('commissions')
        .delete()
        .in('deal_id', contactDealIds)

      if (commissionsError) {
        console.log('Error deleting commissions:', commissionsError.message)
      } else {
        console.log(`Deleted commissions`)
      }

      // Delete deal_revenue_summary
      const { error: revenueError } = await supabase
        .from('deal_revenue_summary')
        .delete()
        .in('deal_id', contactDealIds)

      if (revenueError) {
        console.log('Error deleting deal revenue summary:', revenueError.message)
      } else {
        console.log(`Deleted deal revenue summary`)
      }

      // Delete system_events for these deals
      const { error: eventsError } = await supabase
        .from('system_events')
        .delete()
        .in('deal_id', contactDealIds)

      if (eventsError) {
        console.log('Error deleting system events:', eventsError.message)
      } else {
        console.log(`Deleted system events for deals`)
      }

      // Clear source_call_id references
      const { error: clearDealCallError } = await supabase
        .from('deals')
        .update({ source_call_id: null })
        .in('id', contactDealIds)

      if (clearDealCallError) {
        console.log('Error clearing deal call references:', clearDealCallError.message)
      }

      // Now delete the deals
      const { error: contactDealsError } = await supabase
        .from('deals')
        .delete()
        .in('id', contactDealIds)

      if (contactDealsError) {
        console.log('Error deleting deals for contacts:', contactDealsError.message)
      } else {
        console.log(`Deleted ${contactDealIds.length} deals for contacts`)
      }
    }
  }

  // Delete deals for these leads
  if (leadIds.length > 0) {
    const { error: dealsError } = await supabase
      .from('deals')
      .delete()
      .in('lead_id', leadIds)

    if (dealsError) {
      console.log('Error deleting deals:', dealsError.message)
    } else {
      console.log(`Deleted deals for leads`)
    }
  }

  // Clear lead references from calls before deleting leads
  if (leadIds.length > 0) {
    const { error: clearLeadError } = await supabase
      .from('calls')
      .update({ lead_id: null })
      .in('lead_id', leadIds)

    if (clearLeadError) {
      console.log('Error clearing lead references from calls:', clearLeadError.message)
    } else {
      console.log(`Cleared lead references from calls`)
    }
  }

  // Delete the calls
  if (callIds.length > 0) {
    const { error: deleteCallsError } = await supabase
      .from('calls')
      .delete()
      .in('id', callIds)

    if (deleteCallsError) {
      console.log('Error deleting calls:', deleteCallsError.message)
    } else {
      console.log(`Deleted ${callIds.length} calls`)
    }
  }

  // Delete contacts
  if (contactIds.length > 0) {
    const { error: deleteContactsError } = await supabase
      .from('contacts')
      .delete()
      .in('id', contactIds)

    if (deleteContactsError) {
      console.log('Error deleting contacts:', deleteContactsError.message)
    } else {
      console.log(`Deleted ${contactIds.length} contacts`)
    }
  }

  // Delete leads
  if (leadIds.length > 0) {
    const { error: deleteLeadsError } = await supabase
      .from('leads')
      .delete()
      .in('id', leadIds)

    if (deleteLeadsError) {
      console.log('Error deleting leads:', deleteLeadsError.message)
    } else {
      console.log(`Deleted ${leadIds.length} leads`)
    }
  }

  // Delete form submissions
  const { error: formError, count: formCount } = await supabase
    .from('form_submissions')
    .delete()
    .ilike('submitted_phone', `%${normalizedPhone}%`)

  if (formError) {
    console.log('Error deleting form submissions:', formError.message)
  } else {
    console.log(`Deleted form submissions`)
  }

  console.log('\n=== Cleanup complete! ===\n')
  console.log('When you call inbound now, you should appear as an unknown lead.')
}

removePhoneRecords().catch(console.error)
