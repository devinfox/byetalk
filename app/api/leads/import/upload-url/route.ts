import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * POST /api/leads/import/upload-url
 * Generate a signed URL for uploading large CSV files directly to storage
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { fileName } = await request.json()

    if (!fileName) {
      return NextResponse.json({ error: 'File name required' }, { status: 400 })
    }

    // Generate unique path
    const timestamp = Date.now()
    const storagePath = `imports/pending/${timestamp}_${fileName}`

    // Create signed upload URL using admin client
    const { data, error } = await getSupabaseAdmin()
      .storage
      .from('documents')
      .createSignedUploadUrl(storagePath)

    if (error) {
      console.error('[Upload URL] Error creating signed URL:', error)
      return NextResponse.json({ error: 'Failed to create upload URL: ' + error.message }, { status: 500 })
    }

    return NextResponse.json({
      signedUrl: data.signedUrl,
      storagePath,
      token: data.token,
    })
  } catch (error) {
    console.error('[Upload URL] Error:', error)
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to create upload URL' },
      { status: 500 }
    )
  }
}
