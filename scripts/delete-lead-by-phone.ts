import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function deleteLeadsByPhone(phoneNumber: string) {
  // Normalize phone number - remove all non-digits
  const normalizedPhone = phoneNumber.replace(/\D/g, '')

  console.log(`\n🔍 Searching for leads with phone: ${normalizedPhone}`)

  // Find all leads with this phone number
  const { data: leads, error: findError } = await supabase
    .from('leads')
    .select('id, first_name, last_name, phone, phone_secondary, email')
    .or(`phone.ilike.%${normalizedPhone}%,phone_secondary.ilike.%${normalizedPhone}%`)

  if (findError) {
    console.error('Error finding leads:', findError)
    return
  }

  if (!leads || leads.length === 0) {
    console.log('❌ No leads found with that phone number')
    return
  }

  console.log(`\n📋 Found ${leads.length} lead(s):`)
  leads.forEach(lead => {
    console.log(`  - ${lead.first_name || 'Unknown'} ${lead.last_name || ''} (${lead.phone}) [${lead.id}]`)
  })

  const leadIds = leads.map(l => l.id)

  // Delete related records in order (respecting foreign keys)
  const tables = [
    { name: 'ai_tasks', column: 'lead_id' },
    { name: 'email_drafts', column: 'lead_id' },
    { name: 'email_funnel_enrollments', column: 'lead_id' },
    { name: 'email_lead_profiles', column: 'lead_id' },
    { name: 'email_threads', column: 'lead_id' },
    { name: 'emails', column: 'lead_id' },
    { name: 'activities', column: 'lead_id' },
    { name: 'notes', column: 'lead_id' },
    { name: 'events', column: 'lead_id' },
    { name: 'tasks', column: 'lead_id' },
    { name: 'chat_messages', column: 'lead_id' },
    { name: 'call_tag_assignments', column: 'call_id', subquery: true },
    { name: 'calls', column: 'lead_id' },
    { name: 'form_submissions', column: 'lead_id' },
    { name: 'form_submissions', column: 'duplicate_of_lead_id' },
    { name: 'deals', column: 'lead_id' },
    { name: 'contacts', column: 'lead_id' },
  ]

  console.log('\n🗑️  Deleting related records...')

  for (const table of tables) {
    try {
      if (table.subquery) {
        // Special case for call_tag_assignments - need to delete by call_id
        const { data: calls } = await supabase
          .from('calls')
          .select('id')
          .in('lead_id', leadIds)

        if (calls && calls.length > 0) {
          const callIds = calls.map(c => c.id)
          const { error } = await supabase
            .from(table.name)
            .delete()
            .in('call_id', callIds)

          if (error && !error.message.includes('does not exist')) {
            console.log(`  ⚠️  ${table.name}: ${error.message}`)
          } else {
            console.log(`  ✓ ${table.name}: deleted`)
          }
        }
      } else {
        const { error, count } = await supabase
          .from(table.name)
          .delete()
          .in(table.column, leadIds)

        if (error && !error.message.includes('does not exist')) {
          console.log(`  ⚠️  ${table.name}.${table.column}: ${error.message}`)
        } else {
          console.log(`  ✓ ${table.name}.${table.column}: deleted`)
        }
      }
    } catch (err: any) {
      console.log(`  ⚠️  ${table.name}: ${err.message || 'skipped'}`)
    }
  }

  // Also delete calls by phone number directly (in case they aren't linked to a lead)
  console.log('\n🗑️  Deleting calls by phone number...')
  const { error: callsError } = await supabase
    .from('calls')
    .delete()
    .or(`from_number.ilike.%${normalizedPhone}%,to_number.ilike.%${normalizedPhone}%`)

  if (callsError) {
    console.log(`  ⚠️  calls by phone: ${callsError.message}`)
  } else {
    console.log('  ✓ calls by phone: deleted')
  }

  // Finally delete the leads themselves
  console.log('\n🗑️  Deleting leads...')
  const { error: deleteError } = await supabase
    .from('leads')
    .delete()
    .in('id', leadIds)

  if (deleteError) {
    console.error('❌ Error deleting leads:', deleteError)
  } else {
    console.log(`✅ Successfully deleted ${leads.length} lead(s) and all related data!`)
  }
}

async function checkAllRecords(phoneNumber: string) {
  const normalizedPhone = phoneNumber.replace(/\D/g, '')
  console.log(`\n🔍 Comprehensive search for: ${normalizedPhone}`)

  // Check leads
  const { data: leads } = await supabase
    .from('leads')
    .select('id, first_name, last_name, phone, phone_secondary')
    .or(`phone.ilike.%${normalizedPhone}%,phone_secondary.ilike.%${normalizedPhone}%`)
  console.log(`  Leads: ${leads?.length || 0}`)
  if (leads && leads.length > 0) console.log('    ', leads)

  // Check calls
  const { data: calls } = await supabase
    .from('calls')
    .select('id, from_number, to_number, lead_id, tracking_number')
    .or(`from_number.ilike.%${normalizedPhone}%,to_number.ilike.%${normalizedPhone}%,tracking_number.ilike.%${normalizedPhone}%`)
  console.log(`  Calls: ${calls?.length || 0}`)
  if (calls && calls.length > 0) console.log('    ', calls)

  // Check form submissions
  const { data: forms } = await supabase
    .from('form_submissions')
    .select('id, submitted_phone, lead_id')
    .ilike('submitted_phone', `%${normalizedPhone}%`)
  console.log(`  Form submissions: ${forms?.length || 0}`)
  if (forms && forms.length > 0) console.log('    ', forms)

  // Check contacts
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, phone')
    .or(`phone.ilike.%${normalizedPhone}%,phone_secondary.ilike.%${normalizedPhone}%`)
  console.log(`  Contacts: ${contacts?.length || 0}`)
  if (contacts && contacts.length > 0) console.log('    ', contacts)

  // Check campaigns
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name, tracking_phone')
    .ilike('tracking_phone', `%${normalizedPhone}%`)
  console.log(`  Campaigns: ${campaigns?.length || 0}`)
  if (campaigns && campaigns.length > 0) console.log('    ', campaigns)

  // Check users
  const { data: users } = await supabase
    .from('users')
    .select('id, first_name, last_name, phone')
    .ilike('phone', `%${normalizedPhone}%`)
  console.log(`  Users: ${users?.length || 0}`)
  if (users && users.length > 0) console.log('    ', users)

  // Check ai_tasks for phone in extracted_data
  const { data: tasks } = await supabase
    .from('ai_tasks')
    .select('id, extracted_data')
  const tasksWithPhone = tasks?.filter(t =>
    JSON.stringify(t.extracted_data || {}).includes(normalizedPhone)
  ) || []
  console.log(`  AI Tasks (with phone in data): ${tasksWithPhone.length}`)
  if (tasksWithPhone.length > 0) console.log('    IDs:', tasksWithPhone.map(t => t.id))

  // Check emails for phone in any text field
  const { data: emails } = await supabase
    .from('emails')
    .select('id, subject, body_text')
  const emailsWithPhone = emails?.filter(e =>
    (e.body_text || '').includes(normalizedPhone) || (e.subject || '').includes(normalizedPhone)
  ) || []
  console.log(`  Emails (with phone in content): ${emailsWithPhone.length}`)
  if (emailsWithPhone.length > 0) console.log('    IDs:', emailsWithPhone.map(e => e.id))
}

async function deleteAllByPhone(phoneNumber: string) {
  const normalizedPhone = phoneNumber.replace(/\D/g, '')
  console.log(`\n🗑️  Force deleting ALL records with phone: ${normalizedPhone}`)

  // First, find all linked lead_ids from calls
  const { data: calls } = await supabase
    .from('calls')
    .select('lead_id')
    .or(`from_number.ilike.%${normalizedPhone}%,to_number.ilike.%${normalizedPhone}%`)
    .not('lead_id', 'is', null)

  const linkedLeadIds = [...new Set(calls?.map(c => c.lead_id).filter(Boolean) || [])]
  console.log(`  Found ${linkedLeadIds.length} linked leads: ${linkedLeadIds.join(', ')}`)

  // Delete related records for linked leads
  if (linkedLeadIds.length > 0) {
    // Delete ai_tasks
    await supabase.from('ai_tasks').delete().in('lead_id', linkedLeadIds)
    console.log('  ✓ ai_tasks deleted')

    // Delete email_drafts
    await supabase.from('email_drafts').delete().in('lead_id', linkedLeadIds)
    console.log('  ✓ email_drafts deleted')

    // Delete email_funnel_enrollments
    await supabase.from('email_funnel_enrollments').delete().in('lead_id', linkedLeadIds)
    console.log('  ✓ email_funnel_enrollments deleted')

    // Delete email_lead_profiles
    await supabase.from('email_lead_profiles').delete().in('lead_id', linkedLeadIds)
    console.log('  ✓ email_lead_profiles deleted')

    // Delete email_threads
    await supabase.from('email_threads').delete().in('lead_id', linkedLeadIds)
    console.log('  ✓ email_threads deleted')

    // Delete emails
    await supabase.from('emails').delete().in('lead_id', linkedLeadIds)
    console.log('  ✓ emails deleted')

    // Delete activities
    await supabase.from('activities').delete().in('lead_id', linkedLeadIds)
    console.log('  ✓ activities deleted')

    // Delete chat_messages
    await supabase.from('chat_messages').delete().in('lead_id', linkedLeadIds)
    console.log('  ✓ chat_messages deleted')

    // Delete deals
    await supabase.from('deals').delete().in('lead_id', linkedLeadIds)
    console.log('  ✓ deals deleted')

    // Delete form_submissions
    await supabase.from('form_submissions').delete().in('lead_id', linkedLeadIds)
    console.log('  ✓ form_submissions by lead_id deleted')
  }

  // Delete calls (must be done before leads due to initial_call_id FK)
  // First, null out initial_call_id references
  if (linkedLeadIds.length > 0) {
    await supabase
      .from('leads')
      .update({ initial_call_id: null })
      .in('id', linkedLeadIds)
    console.log('  ✓ lead.initial_call_id references cleared')
  }

  // Get all call IDs for this phone number
  const { data: callsToDelete } = await supabase
    .from('calls')
    .select('id')
    .or(`from_number.ilike.%${normalizedPhone}%,to_number.ilike.%${normalizedPhone}%`)

  const callIds = callsToDelete?.map(c => c.id) || []
  console.log(`  Found ${callIds.length} calls to delete`)

  // Delete tasks referencing these calls
  if (callIds.length > 0) {
    await supabase.from('tasks').delete().in('call_id', callIds)
    console.log('  ✓ tasks by call_id deleted')
  }

  // Now delete the calls
  const { error: callsError } = await supabase
    .from('calls')
    .delete()
    .or(`from_number.ilike.%${normalizedPhone}%,to_number.ilike.%${normalizedPhone}%`)
  console.log(`  Calls deleted: ${callsError ? callsError.message : 'done'}`)

  // Delete form submissions by phone
  const { error: formsError } = await supabase
    .from('form_submissions')
    .delete()
    .ilike('submitted_phone', `%${normalizedPhone}%`)
  console.log(`  Form submissions by phone deleted: ${formsError ? formsError.message : 'done'}`)

  // Delete the linked leads
  if (linkedLeadIds.length > 0) {
    const { error: leadsError } = await supabase
      .from('leads')
      .delete()
      .in('id', linkedLeadIds)
    console.log(`  Linked leads deleted: ${leadsError ? leadsError.message : 'done'}`)
  }

  // Delete leads by phone
  const { error: leadsPhoneError } = await supabase
    .from('leads')
    .delete()
    .or(`phone.ilike.%${normalizedPhone}%,phone_secondary.ilike.%${normalizedPhone}%`)
  console.log(`  Leads by phone deleted: ${leadsPhoneError ? leadsPhoneError.message : 'done'}`)

  // Get contact IDs to delete
  const { data: contactsToDelete } = await supabase
    .from('contacts')
    .select('id')
    .or(`phone.ilike.%${normalizedPhone}%,phone_secondary.ilike.%${normalizedPhone}%`)

  const contactIds = contactsToDelete?.map(c => c.id) || []
  console.log(`  Found ${contactIds.length} contacts to delete`)

  // Null out deals.contact_id references
  if (contactIds.length > 0) {
    await supabase
      .from('deals')
      .update({ contact_id: null })
      .in('contact_id', contactIds)
    console.log('  ✓ deals.contact_id references cleared')
  }

  // Delete contacts
  const { error: contactsError } = await supabase
    .from('contacts')
    .delete()
    .or(`phone.ilike.%${normalizedPhone}%,phone_secondary.ilike.%${normalizedPhone}%`)
  console.log(`  Contacts deleted: ${contactsError ? contactsError.message : 'done'}`)

  console.log('\n✅ Deletion complete!')
}

// Get phone number from command line or use default
const phoneNumber = process.argv[2] || '8182092305'
const action = process.argv[3] || 'search' // 'search' or 'delete'

if (action === 'delete') {
  deleteAllByPhone(phoneNumber)
} else if (action === 'lead') {
  deleteLeadsByPhone(phoneNumber)
} else {
  checkAllRecords(phoneNumber)
}
