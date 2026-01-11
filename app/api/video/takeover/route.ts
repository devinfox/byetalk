import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import sharp from 'sharp'
import * as jose from 'jose'


const KLING_ACCESS_KEY = process.env.KLING_ACCESS_KEY!
const KLING_SECRET_KEY = process.env.KLING_SECRET_KEY!
const KLING_API_URL = 'https://api.klingai.com'

// Generate JWT token for Kling AI API
async function generateKlingToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  const payload = {
    iss: KLING_ACCESS_KEY,
    exp: now + 1800, // 30 minutes
    nbf: now - 5, // Valid 5 seconds ago for clock sync
  }

  const secret = new TextEncoder().encode(KLING_SECRET_KEY)

  const token = await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .sign(secret)

  return token
}

// The epic takeover prompt - references both warriors in the composite image
function generateTakeoverPrompt(winnerName: string, loserName: string): string {
  return `Epic Roman colosseum victory ceremony. The image shows two gladiators - the LEFT person is ${winnerName} (the victor, wearing golden armor), the RIGHT person is ${loserName} (the defeated, wearing silver armor).

Scene progression:
- Opening: Both gladiators stand in the colosseum arena, golden sunset light streaming through the arches
- ${winnerName} raises their sword triumphantly while ${loserName} gives a respectful nod
- The crowd erupts in cheers, throwing golden confetti and rose petals
- ${winnerName} ascends to the champion's podium as ${loserName} steps aside graciously
- Final shot: ${winnerName} holding a golden trophy aloft, sunbeams creating a halo effect

Maintain photorealistic faces from the reference image. Cinematic lighting, epic atmosphere, dramatic camera movements, dust particles floating in golden light.`
}

// Fetch image as buffer from URL
async function fetchImageBuffer(url: string): Promise<Buffer> {
  // Handle relative URLs (default avatars)
  let fullUrl = url
  if (url.startsWith('/')) {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
    fullUrl = `${appUrl}${url}`
  }

  const response = await fetch(fullUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

// Create side-by-side composite image preserving full height
async function createCompositeImage(
  winnerAvatarUrl: string,
  loserAvatarUrl: string
): Promise<Buffer> {
  // Fetch both images
  const [winnerBuffer, loserBuffer] = await Promise.all([
    fetchImageBuffer(winnerAvatarUrl),
    fetchImageBuffer(loserAvatarUrl),
  ])

  // Get metadata for both images
  const [winnerMeta, loserMeta] = await Promise.all([
    sharp(winnerBuffer).metadata(),
    sharp(loserBuffer).metadata(),
  ])

  // Use the max height between the two images
  const maxHeight = Math.max(winnerMeta.height || 512, loserMeta.height || 512)

  // Resize both to the same height, maintaining aspect ratio
  const [winnerResized, loserResized] = await Promise.all([
    sharp(winnerBuffer)
      .resize({ height: maxHeight, fit: 'inside' })
      .toBuffer(),
    sharp(loserBuffer)
      .resize({ height: maxHeight, fit: 'inside' })
      .toBuffer(),
  ])

  // Get the actual dimensions after resize
  const [winnerResizedMeta, loserResizedMeta] = await Promise.all([
    sharp(winnerResized).metadata(),
    sharp(loserResized).metadata(),
  ])

  const winnerWidth = winnerResizedMeta.width || 512
  const loserWidth = loserResizedMeta.width || 512

  // Create side-by-side composite (winner on LEFT, loser on RIGHT)
  const compositeWidth = winnerWidth + loserWidth
  const compositeHeight = maxHeight

  const composite = await sharp({
    create: {
      width: compositeWidth,
      height: compositeHeight,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite([
      { input: winnerResized, left: 0, top: 0 },
      { input: loserResized, left: winnerWidth, top: 0 },
    ])
    .jpeg({ quality: 90 })
    .toBuffer()

  return composite
}

// Upload composite to Supabase storage and get public URL
async function uploadCompositeImage(
  imageBuffer: Buffer,
  filename: string
): Promise<string> {
  const { data, error } = await getSupabaseAdmin().storage
    .from('takeover-composites')
    .upload(filename, imageBuffer, {
      contentType: 'image/jpeg',
      upsert: true,
    })

  if (error) {
    console.error('Upload error:', error)
    throw new Error(`Failed to upload composite: ${error.message}`)
  }

  // Get public URL
  const { data: urlData } = getSupabaseAdmin().storage
    .from('takeover-composites')
    .getPublicUrl(filename)

  return urlData.publicUrl
}

// Delete composite image from storage
async function deleteCompositeImage(filename: string): Promise<void> {
  const { error } = await getSupabaseAdmin().storage
    .from('takeover-composites')
    .remove([filename])

  if (error) {
    console.error('Delete error:', error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { winnerId, loserId, winnerName, loserName, winnerAvatar, loserAvatar } = await request.json()

    if (!winnerId || !loserId) {
      return NextResponse.json({ error: 'Missing winnerId or loserId' }, { status: 400 })
    }

    console.log(`Generating takeover video with Kling AI: ${winnerName} overtakes ${loserName}`)
    console.log(`Winner avatar: ${winnerAvatar}`)
    console.log(`Loser avatar: ${loserAvatar}`)

    // Create composite image with both avatars
    const compositeFilename = `takeover-${winnerId}-${loserId}-${Date.now()}.jpg`
    let compositeUrl: string

    try {
      console.log('Creating composite image...')
      const compositeBuffer = await createCompositeImage(winnerAvatar, loserAvatar)
      console.log('Uploading composite to storage...')
      compositeUrl = await uploadCompositeImage(compositeBuffer, compositeFilename)
      console.log('Composite URL:', compositeUrl)
    } catch (imageError) {
      console.error('Error creating composite image:', imageError)
      return NextResponse.json(
        { error: 'Failed to create composite image', details: String(imageError) },
        { status: 500 }
      )
    }

    // Generate the prompt
    const prompt = generateTakeoverPrompt(winnerName, loserName)
    console.log('Prompt:', prompt)

    // Generate JWT token for Kling
    const token = await generateKlingToken()

    // Create the Kling generation task with image-to-video
    const klingResponse = await fetch(`${KLING_API_URL}/v1/videos/image2video`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_name: 'kling-v1-6', // Latest model with better quality
        image: compositeUrl,
        prompt: prompt,
        negative_prompt: 'blurry, low quality, distorted faces, text, watermark, logo',
        mode: 'std', // Standard mode (cheaper)
        duration: '5', // 5 seconds (cheaper)
        cfg_scale: 0.5, // Balance between creativity and adherence
      }),
    })

    if (!klingResponse.ok) {
      const errorText = await klingResponse.text()
      console.error('Kling API error:', klingResponse.status, errorText)
      // Clean up composite image on error
      await deleteCompositeImage(compositeFilename)
      return NextResponse.json({ error: 'Failed to start video generation', details: errorText }, { status: 500 })
    }

    const klingData = await klingResponse.json()
    console.log('Kling task created:', klingData)

    // Extract task ID from response
    const taskId = klingData.data?.task_id || klingData.task_id || klingData.id

    if (!taskId) {
      console.error('No task ID in Kling response:', klingData)
      await deleteCompositeImage(compositeFilename)
      return NextResponse.json({ error: 'No task ID returned from Kling', details: JSON.stringify(klingData) }, { status: 500 })
    }

    // Store the video generation record in the database (if table exists)
    let videoRecord = null
    try {
      const { data, error: dbError } = await getSupabaseAdmin()
        .from('takeover_videos')
        .insert({
          winner_id: winnerId,
          loser_id: loserId,
          runway_task_id: taskId, // Reusing column name for Kling task ID
          status: 'processing',
          prompt: prompt,
          composite_filename: compositeFilename,
        })
        .select()
        .single()

      if (dbError) {
        console.error('Database error (table may not exist yet):', dbError.message)
      } else {
        videoRecord = data
      }
    } catch (e) {
      console.error('Database insert failed:', e)
    }

    return NextResponse.json({
      success: true,
      taskId: taskId,
      message: `Generating takeover video: ${winnerName} overtakes ${loserName}`,
      videoRecordId: videoRecord?.id,
      compositeFilename, // Return so we can clean up later
    })
  } catch (error) {
    console.error('Takeover video error:', error)
    return NextResponse.json({ error: 'Failed to generate takeover video', details: String(error) }, { status: 500 })
  }
}

// Poll for video status
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const taskId = searchParams.get('taskId')
  const compositeFilename = searchParams.get('compositeFilename')

  if (!taskId) {
    return NextResponse.json({ error: 'Missing taskId' }, { status: 400 })
  }

  try {
    // Generate JWT token for Kling
    const token = await generateKlingToken()

    const klingResponse = await fetch(`${KLING_API_URL}/v1/videos/image2video/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!klingResponse.ok) {
      const errorText = await klingResponse.text()
      console.error('Kling status check error:', klingResponse.status, errorText)
      return NextResponse.json({ error: 'Failed to get task status', details: errorText }, { status: 500 })
    }

    const taskData = await klingResponse.json()
    console.log('Kling task status:', taskData)

    // Kling status mapping
    // Kling uses: submitted, processing, succeed, failed
    // We map to: PENDING, RUNNING, SUCCEEDED, FAILED
    const klingStatus = taskData.data?.task_status || taskData.task_status || taskData.status
    let status = 'RUNNING'

    if (klingStatus === 'succeed' || klingStatus === 'completed') {
      status = 'SUCCEEDED'
    } else if (klingStatus === 'failed') {
      status = 'FAILED'
    } else if (klingStatus === 'submitted' || klingStatus === 'pending') {
      status = 'PENDING'
    } else if (klingStatus === 'processing') {
      status = 'RUNNING'
    }

    // Get video URL from response
    const videoUrl = taskData.data?.task_result?.videos?.[0]?.url ||
                     taskData.task_result?.videos?.[0]?.url ||
                     taskData.videos?.[0]?.url ||
                     taskData.output?.[0] ||
                     null

    // If completed or failed, clean up composite image
    if ((status === 'SUCCEEDED' || status === 'FAILED') && compositeFilename) {
      console.log('Cleaning up composite image:', compositeFilename)
      await deleteCompositeImage(compositeFilename)
    }

    // If completed, update the database record
    if (status === 'SUCCEEDED' && videoUrl) {
      await getSupabaseAdmin()
        .from('takeover_videos')
        .update({
          status: 'completed',
          video_url: videoUrl,
          completed_at: new Date().toISOString(),
        })
        .eq('runway_task_id', taskId)
    } else if (status === 'FAILED') {
      const errorMsg = taskData.data?.task_status_msg || taskData.message || 'Unknown error'
      await getSupabaseAdmin()
        .from('takeover_videos')
        .update({
          status: 'failed',
          error: errorMsg,
        })
        .eq('runway_task_id', taskId)
    }

    return NextResponse.json({
      status: status,
      progress: taskData.data?.progress || taskData.progress || null,
      videoUrl: videoUrl,
      failure: taskData.data?.task_status_msg || taskData.message || null,
    })
  } catch (error) {
    console.error('Status check error:', error)
    return NextResponse.json({ error: 'Failed to check video status', details: String(error) }, { status: 500 })
  }
}
