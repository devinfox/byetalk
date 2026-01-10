import { NextRequest, NextResponse } from 'next/server'

// Google Cloud Text-to-Speech API
const GOOGLE_TTS_API = 'https://texttospeech.googleapis.com/v1/text:synthesize'

// Nimbus voice configuration - natural, conversational female voice
// Journey voices are designed to sound human-like and conversational
const VOICE_CONFIG = {
  languageCode: 'en-US',
  name: 'en-US-Journey-F', // Journey voice - most natural, conversational female
  ssmlGender: 'FEMALE',
}

const AUDIO_CONFIG = {
  audioEncoding: 'MP3',
  speakingRate: 0.95, // Slightly slower for natural conversation
  pitch: 0, // Natural pitch (no modification)
  volumeGainDb: 0,
}

/**
 * POST /api/nimbus/speak
 * Convert text to speech using Google Cloud Text-to-Speech
 * Returns audio as base64 MP3 data
 */
export async function POST(request: NextRequest) {
  let inputText = ''

  try {
    const body = await request.json()
    inputText = body.text || ''

    if (!inputText || typeof inputText !== 'string') {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    const apiKey = process.env.GOOGLE_CLOUD_API_KEY || process.env.GOOGLE_AI_API_KEY

    if (!apiKey) {
      // Return a flag to use browser TTS fallback
      console.log('[Nimbus Voice] No API key, using browser TTS for:', inputText.substring(0, 30))
      return NextResponse.json({
        useBrowserTTS: true,
        text: inputText,
        voice: {
          lang: 'en-US',
          name: 'female', // Hint for browser voice selection
        },
      })
    }

    console.log('[Nimbus Voice] Generating speech for:', inputText.substring(0, 50) + '...')

    // Prepare the request body
    const requestBody = {
      input: {
        text: inputText,
      },
      voice: VOICE_CONFIG,
      audioConfig: AUDIO_CONFIG,
    }

    // Call Google Cloud Text-to-Speech API
    const response = await fetch(`${GOOGLE_TTS_API}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('[Nimbus Voice] TTS API error:', response.status, errorData)

      // Fall back to browser TTS
      return NextResponse.json({
        useBrowserTTS: true,
        text: inputText,
        voice: {
          lang: 'en-US',
          name: 'female',
        },
      })
    }

    const data = await response.json()

    if (!data.audioContent) {
      console.error('[Nimbus Voice] No audio content in response')
      return NextResponse.json({
        useBrowserTTS: true,
        text: inputText,
        voice: {
          lang: 'en-US',
          name: 'female',
        },
      })
    }

    console.log('[Nimbus Voice] Generated audio successfully')

    return NextResponse.json({
      audio: data.audioContent,
      format: 'mp3',
      useBrowserTTS: false,
    })
  } catch (error) {
    console.error('[Nimbus Voice] Error:', error)

    // Fall back to browser TTS on any error
    return NextResponse.json({
      useBrowserTTS: true,
      text: '',
      voice: {
        lang: 'en-US',
        name: 'female',
      },
    })
  }
}
