import { NextResponse } from 'next/server'

export async function GET() {
  const crmApiUrl = process.env.NEXT_PUBLIC_CRM_API_URL

  if (!crmApiUrl) {
    return NextResponse.json({ error: 'CRM API URL not configured' }, { status: 500 })
  }

  try {
    const response = await fetch(`${crmApiUrl}/api/scoreboard`, {
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`CRM API returned ${response.status}`)
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching from CRM API:', error)
    return NextResponse.json({ error: 'Failed to fetch scoreboard data' }, { status: 500 })
  }
}
