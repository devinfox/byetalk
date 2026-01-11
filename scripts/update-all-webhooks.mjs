#!/usr/bin/env node
/**
 * Update all third-party webhook URLs to new tunnel URL
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load .env.local manually (handle spaces in keys)
const envPath = resolve(process.cwd(), '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
const env = {}
envContent.split('\n').forEach(line => {
  const trimmed = line.trim()
  if (trimmed && !trimmed.startsWith('#')) {
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex > 0) {
      const key = trimmed.substring(0, eqIndex).trim()
      const value = trimmed.substring(eqIndex + 1).trim()
      env[key] = value
    }
  }
})

const NEW_URL = process.argv[2] || 'https://vision-represent-memorial-grand.trycloudflare.com'

console.log(`\n🔄 Updating webhooks to: ${NEW_URL}\n`)

// ============================================================================
// 1. DAILY.CO
// ============================================================================
async function updateDaily() {
  const apiKey = env.DAILY_API_KEY
  if (!apiKey) {
    console.log('❌ Daily.co: DAILY_API_KEY not found in .env.local')
    return false
  }

  const webhookUrl = `${NEW_URL}/api/daily/webhook`

  try {
    // List existing webhooks
    const listRes = await fetch('https://api.daily.co/v1/webhooks', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
    const webhooks = await listRes.json()

    // Delete old webhooks with our endpoint
    if (webhooks.data) {
      for (const wh of webhooks.data) {
        if (wh.url.includes('/api/daily/webhook')) {
          await fetch(`https://api.daily.co/v1/webhooks/${wh.uuid}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${apiKey}` }
          })
          console.log(`   Deleted old webhook: ${wh.url}`)
        }
      }
    }

    // Create new webhook
    const createRes = await fetch('https://api.daily.co/v1/webhooks', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: webhookUrl,
        eventTypes: [
          'recording.ready-to-download',
          'transcript.ready-to-download',
          'transcript.started',
          'transcript.error'
        ]
      })
    })

    const newWebhook = await createRes.json()

    if (newWebhook.uuid) {
      console.log(`✅ Daily.co: Webhook updated`)
      console.log(`   URL: ${webhookUrl}`)
      if (newWebhook.hmac) {
        console.log(`   ⚠️  New HMAC secret: ${newWebhook.hmac}`)
        console.log(`   Update .env.local: DAILY_WEBHOOK_SECRET=${newWebhook.hmac}`)
      }
      return true
    } else {
      console.log(`❌ Daily.co: Failed - ${JSON.stringify(newWebhook)}`)
      return false
    }
  } catch (error) {
    console.log(`❌ Daily.co: ${error.message}`)
    return false
  }
}

// ============================================================================
// 2. TWILIO
// ============================================================================
async function updateTwilio() {
  const accountSid = env.TWILIO_ACCOUNT_SID
  const authToken = env.TWILIO_AUTH_TOKEN
  const phoneNumber = env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken) {
    console.log('❌ Twilio: TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not found')
    return false
  }

  if (!phoneNumber) {
    console.log('❌ Twilio: TWILIO_PHONE_NUMBER not found')
    return false
  }

  const voiceUrl = `${NEW_URL}/api/twilio/voice`
  const voiceFallbackUrl = `${NEW_URL}/api/twilio/voice/fallback`
  const statusCallback = `${NEW_URL}/api/twilio/status`

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

  try {
    // Get phone number SID
    const listRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phoneNumber)}`,
      { headers: { 'Authorization': `Basic ${auth}` } }
    )
    const listData = await listRes.json()

    if (!listData.incoming_phone_numbers?.length) {
      console.log(`❌ Twilio: Phone number ${phoneNumber} not found`)
      return false
    }

    const phoneSid = listData.incoming_phone_numbers[0].sid

    // Update phone number webhooks
    const updateRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers/${phoneSid}.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          VoiceUrl: voiceUrl,
          VoiceMethod: 'POST',
          VoiceFallbackUrl: voiceFallbackUrl,
          VoiceFallbackMethod: 'POST',
          StatusCallback: statusCallback,
          StatusCallbackMethod: 'POST'
        })
      }
    )

    if (updateRes.ok) {
      console.log(`✅ Twilio: Phone number ${phoneNumber} updated`)
      console.log(`   Voice URL: ${voiceUrl}`)
      console.log(`   Fallback URL: ${voiceFallbackUrl}`)
      console.log(`   Status Callback: ${statusCallback}`)
      return true
    } else {
      const error = await updateRes.text()
      console.log(`❌ Twilio: Failed - ${error}`)
      return false
    }
  } catch (error) {
    console.log(`❌ Twilio: ${error.message}`)
    return false
  }
}

// ============================================================================
// 3. SENDGRID (Event Webhook only - Inbound Parse needs dashboard)
// ============================================================================
async function updateSendGrid() {
  const apiKey = env.SENDGRID_API_KEY
  if (!apiKey) {
    console.log('❌ SendGrid: SENDGRID_API_KEY not found')
    return false
  }

  const eventUrl = `${NEW_URL}/api/email/webhooks/sendgrid/events`

  try {
    // Update event webhook settings
    const res = await fetch('https://api.sendgrid.com/v3/user/webhooks/event/settings', {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        enabled: true,
        url: eventUrl,
        oauth_client_id: '',
        oauth_token_url: ''
      })
    })

    if (res.ok) {
      console.log(`✅ SendGrid: Event webhook updated`)
      console.log(`   URL: ${eventUrl}`)
      console.log(`   ⚠️  Inbound Parse must be updated in SendGrid Dashboard manually`)
      console.log(`   Inbound URL: ${NEW_URL}/api/email/webhooks/sendgrid/inbound`)
      return true
    } else {
      const error = await res.text()
      console.log(`❌ SendGrid: Failed - ${error}`)
      return false
    }
  } catch (error) {
    console.log(`❌ SendGrid: ${error.message}`)
    return false
  }
}

// ============================================================================
// 4. MICROSOFT (Cannot be updated via API - needs Azure Portal)
// ============================================================================
function showMicrosoftInstructions() {
  console.log(`⚠️  Microsoft: Must be updated manually in Azure Portal`)
  console.log(`   1. Go to: https://portal.azure.com`)
  console.log(`   2. Navigate to: Azure Active Directory → App Registrations`)
  console.log(`   3. Select your app → Authentication`)
  console.log(`   4. Update Redirect URI to: ${NEW_URL}/api/auth/callback/microsoft`)
}

// ============================================================================
// RUN ALL UPDATES
// ============================================================================
async function main() {
  console.log('=' .repeat(60))
  console.log('DAILY.CO')
  console.log('=' .repeat(60))
  await updateDaily()

  console.log('\n' + '=' .repeat(60))
  console.log('TWILIO')
  console.log('=' .repeat(60))
  await updateTwilio()

  console.log('\n' + '=' .repeat(60))
  console.log('SENDGRID')
  console.log('=' .repeat(60))
  await updateSendGrid()

  console.log('\n' + '=' .repeat(60))
  console.log('MICROSOFT')
  console.log('=' .repeat(60))
  showMicrosoftInstructions()

  console.log('\n' + '=' .repeat(60))
  console.log('ENV FILE UPDATE NEEDED')
  console.log('=' .repeat(60))
  console.log(`Update .env.local with:`)
  console.log(`   NEXT_PUBLIC_APP_URL=${NEW_URL}`)
  console.log(`   MICROSOFT_REDIRECT_URI=${NEW_URL}/api/auth/callback/microsoft`)

  console.log('\n✨ Done!\n')
}

main().catch(console.error)
