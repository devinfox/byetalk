#!/usr/bin/env node

import twilio from 'twilio'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const twimlAppSid = process.env.TWILIO_TWIML_APP_SID

if (!accountSid || !authToken) {
  console.error('Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN in .env.local')
  process.exit(1)
}

const client = twilio(accountSid, authToken)

async function assignTwimlAppToAllNumbers() {
  console.log('Fetching all phone numbers...\n')

  const numbers = await client.incomingPhoneNumbers.list()

  console.log(`Found ${numbers.length} phone number(s)\n`)

  for (const number of numbers) {
    console.log(`Updating ${number.phoneNumber} (${number.friendlyName})...`)

    try {
      await client.incomingPhoneNumbers(number.sid).update({
        voiceApplicationSid: twimlAppSid,
      })
      console.log(`  ✓ Assigned to TwiML App ${twimlAppSid}\n`)
    } catch (err) {
      console.error(`  ✗ Failed: ${err.message}\n`)
    }
  }

  console.log('Done!')
}

assignTwimlAppToAllNumbers()
