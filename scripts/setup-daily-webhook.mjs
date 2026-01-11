#!/usr/bin/env node
/**
 * Setup Daily.co Webhook
 *
 * This script registers a webhook with Daily.co to receive events
 * for recordings, transcriptions, and meetings.
 *
 * Usage:
 *   node scripts/setup-daily-webhook.mjs
 *
 * Environment variables required:
 *   - DAILY_API_KEY: Your Daily.co API key
 *   - NEXT_PUBLIC_APP_URL: Your app's base URL (e.g., https://yourdomain.com)
 */

import 'dotenv/config'

const DAILY_API_KEY = process.env.DAILY_API_KEY
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

if (!DAILY_API_KEY) {
  console.error('❌ DAILY_API_KEY environment variable is required')
  process.exit(1)
}

const WEBHOOK_URL = `${APP_URL}/api/daily/webhook`

// Events we want to subscribe to
// Note: Daily uses 'transcript.*' not 'transcription.*'
const EVENT_TYPES = [
  'meeting.started',
  'meeting.ended',
  'recording.started',
  'recording.ready-to-download',
  'recording.error',
  'transcript.started',
  'transcript.ready-to-download',
  'transcript.error',
  'participant.joined',
  'participant.left',
]

async function listWebhooks() {
  const response = await fetch('https://api.daily.co/v1/webhooks', {
    headers: {
      'Authorization': `Bearer ${DAILY_API_KEY}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to list webhooks: ${response.status}`)
  }

  return response.json()
}

async function createWebhook() {
  console.log('📡 Creating Daily.co webhook...')
  console.log(`   URL: ${WEBHOOK_URL}`)
  console.log(`   Events: ${EVENT_TYPES.join(', ')}`)
  console.log('')

  const response = await fetch('https://api.daily.co/v1/webhooks', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DAILY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: WEBHOOK_URL,
      eventTypes: EVENT_TYPES,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(`Failed to create webhook: ${response.status} - ${JSON.stringify(error)}`)
  }

  return response.json()
}

async function deleteWebhook(uuid) {
  const response = await fetch(`https://api.daily.co/v1/webhooks/${uuid}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${DAILY_API_KEY}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to delete webhook: ${response.status}`)
  }

  return true
}

async function main() {
  console.log('🔧 Daily.co Webhook Setup')
  console.log('========================')
  console.log('')

  try {
    // List existing webhooks
    console.log('📋 Checking existing webhooks...')
    const existingWebhooks = await listWebhooks()

    if (existingWebhooks.data && existingWebhooks.data.length > 0) {
      console.log(`   Found ${existingWebhooks.data.length} existing webhook(s):`)

      for (const webhook of existingWebhooks.data) {
        console.log(`   - ${webhook.uuid}: ${webhook.url}`)

        // Check if this webhook points to our URL
        if (webhook.url === WEBHOOK_URL) {
          console.log('   ℹ️  This webhook already exists for our URL')
          console.log('')
          console.log('   Options:')
          console.log('   1. Keep existing webhook (no action needed)')
          console.log('   2. Delete and recreate (run with --recreate flag)')

          if (process.argv.includes('--recreate')) {
            console.log('')
            console.log('   🗑️  Deleting existing webhook...')
            await deleteWebhook(webhook.uuid)
            console.log('   ✅ Deleted')
          } else {
            console.log('')
            console.log('✅ Webhook already configured!')
            console.log('')
            console.log('Webhook details:')
            console.log(`   UUID: ${webhook.uuid}`)
            console.log(`   URL: ${webhook.url}`)
            console.log(`   Events: ${webhook.eventTypes?.join(', ') || 'all'}`)
            if (webhook.hmac) {
              console.log(`   HMAC Secret: ${webhook.hmac}`)
              console.log('')
              console.log('⚠️  Add this to your .env file:')
              console.log(`   DAILY_WEBHOOK_SECRET=${webhook.hmac}`)
            }
            return
          }
        }
      }
      console.log('')
    } else {
      console.log('   No existing webhooks found')
      console.log('')
    }

    // Create new webhook
    const webhook = await createWebhook()

    console.log('✅ Webhook created successfully!')
    console.log('')
    console.log('Webhook details:')
    console.log(`   UUID: ${webhook.uuid}`)
    console.log(`   URL: ${webhook.url}`)
    console.log(`   Events: ${webhook.eventTypes?.join(', ')}`)

    if (webhook.hmac) {
      console.log(`   HMAC Secret: ${webhook.hmac}`)
      console.log('')
      console.log('⚠️  IMPORTANT: Add this to your .env file for signature verification:')
      console.log(`   DAILY_WEBHOOK_SECRET=${webhook.hmac}`)
    }

    console.log('')
    console.log('🎉 Setup complete! Daily.co will now send events to your webhook.')

  } catch (error) {
    console.error('')
    console.error('❌ Error:', error.message)
    console.error('')
    console.error('Troubleshooting:')
    console.error('1. Make sure your DAILY_API_KEY is correct')
    console.error('2. Ensure your webhook URL is publicly accessible')
    console.error('3. Check that your endpoint returns 200 OK for GET requests')
    process.exit(1)
  }
}

main()
