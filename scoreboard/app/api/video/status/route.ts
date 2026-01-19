import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const crmApiUrl = process.env.NEXT_PUBLIC_CRM_API_URL
  const { searchParams } = new URL(request.url)
  const taskId = searchParams.get('taskId')
  const compositeFilename = searchParams.get('compositeFilename')

  if (!crmApiUrl) {
    return NextResponse.json({ error: 'CRM API URL not configured' }, { status: 500 })
  }

  if (!taskId) {
    return NextResponse.json({ error: 'Missing taskId' }, { status: 400 })
  }

  try {
    let url = `${crmApiUrl}/api/video/takeover?taskId=${taskId}`
    if (compositeFilename) {
      url += `&compositeFilename=${encodeURIComponent(compositeFilename)}`
    }
    const response = await fetch(url)

    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    console.error('Error checking video status:', error)
    return NextResponse.json({ error: 'Failed to check video status' }, { status: 500 })
  }
}
