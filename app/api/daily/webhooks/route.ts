import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const DAILY_API_URL = 'https://api.daily.co/v1'

function getApiKey(): string {
  const apiKey = process.env.DAILY_API_KEY
  if (!apiKey) {
    throw new Error('DAILY_API_KEY not configured')
  }
  return apiKey
}

// GET /api/daily/webhooks - List all webhooks
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const response = await fetch(`${DAILY_API_URL}/webhooks`, {
      headers: {
        'Authorization': `Bearer ${getApiKey()}`,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      return NextResponse.json(
        { error: error.info || 'Failed to fetch webhooks' },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching webhooks:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/daily/webhooks - Create a webhook
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // Default webhook configuration
    const webhookConfig = {
      url: body.url || `${appUrl}/api/daily/webhook`,
      eventTypes: body.eventTypes || [
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
      ],
    }

    const response = await fetch(`${DAILY_API_URL}/webhooks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookConfig),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      return NextResponse.json(
        { error: error.info || error.error || 'Failed to create webhook' },
        { status: response.status }
      )
    }

    const webhook = await response.json()

    return NextResponse.json({
      webhook,
      message: 'Webhook created successfully',
      hmac_secret: webhook.hmac,
      instructions: webhook.hmac
        ? `Add DAILY_WEBHOOK_SECRET=${webhook.hmac} to your .env file for signature verification`
        : null,
    })
  } catch (error) {
    console.error('Error creating webhook:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/daily/webhooks - Delete a webhook
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const uuid = searchParams.get('uuid')

    if (!uuid) {
      return NextResponse.json({ error: 'Webhook UUID required' }, { status: 400 })
    }

    const response = await fetch(`${DAILY_API_URL}/webhooks/${uuid}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${getApiKey()}`,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      return NextResponse.json(
        { error: error.info || 'Failed to delete webhook' },
        { status: response.status }
      )
    }

    return NextResponse.json({ message: 'Webhook deleted successfully' })
  } catch (error) {
    console.error('Error deleting webhook:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
