#!/usr/bin/env node

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN

const supabase = createClient(supabaseUrl, supabaseKey)
const twilioClient = twilio(accountSid, authToken)

async function syncTwilioNumbers() {
  console.log('Fetching Twilio phone numbers...\n')

  const numbers = await twilioClient.incomingPhoneNumbers.list({ limit: 500 })

  console.log(`Found ${numbers.length} phone numbers\n`)

  const insertData = numbers.map(n => ({
    phone_number: n.phoneNumber,
    phone_sid: n.sid,
    area_code: n.phoneNumber.replace(/\D/g, '').slice(1, 4),
    friendly_name: n.friendlyName,
    is_active: true,
  }))

  // Group by area code for summary
  const areaCodes = {}
  insertData.forEach(n => {
    areaCodes[n.area_code] = (areaCodes[n.area_code] || 0) + 1
  })

  console.log('Area code distribution:')
  Object.entries(areaCodes)
    .sort((a, b) => b[1] - a[1])
    .forEach(([code, count]) => {
      console.log(`  ${code}: ${count} numbers`)
    })

  console.log('\nSyncing to database...')

  const { error } = await supabase
    .from('twilio_phone_numbers')
    .upsert(insertData, { onConflict: 'phone_number' })

  if (error) {
    console.error('Error syncing:', error)
  } else {
    console.log(`\n✓ Synced ${numbers.length} phone numbers to database`)
  }
}

syncTwilioNumbers()
