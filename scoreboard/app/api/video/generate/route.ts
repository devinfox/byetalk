import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const crmApiUrl = process.env.NEXT_PUBLIC_CRM_API_URL

  if (!crmApiUrl) {
    return NextResponse.json({ error: 'CRM API URL not configured' }, { status: 500 })
  }

  try {
    const body = await request.json()

    const response = await fetch(`${crmApiUrl}/api/video/takeover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    console.error('Error proxying video generation:', error)
    return NextResponse.json({ error: 'Failed to generate video' }, { status: 500 })
  }
}
