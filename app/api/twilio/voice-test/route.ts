import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  console.log('[Voice Test] POST received!')

  try {
    const formData = await request.formData()
    const entries: Record<string, string> = {}
    formData.forEach((v, k) => entries[k] = String(v))
    console.log('[Voice Test] Form data:', entries)
  } catch (e) {
    console.log('[Voice Test] No form data or error:', e)
  }

  // Return simple TwiML
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Test endpoint received your call.</Say>
  <Hangup/>
</Response>`

  return new NextResponse(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  })
}

export async function GET() {
  return new NextResponse('Voice test endpoint is working (GET)', {
    headers: { 'Content-Type': 'text/plain' },
  })
}
