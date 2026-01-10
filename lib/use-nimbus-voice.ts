"use client"

import { useState, useCallback, useRef, useEffect } from 'react'

interface UseNimbusVoiceOptions {
  enabled?: boolean
  onSpeakStart?: () => void
  onSpeakEnd?: () => void
  onError?: (error: string) => void
}

interface UseNimbusVoiceReturn {
  speak: (text: string) => Promise<void>
  stop: () => void
  isSpeaking: boolean
  isLoading: boolean
  error: string | null
}

// Find a pleasant female voice from available browser voices
function findFemaleVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  // Preferred voices in order of preference
  const preferredVoices = [
    'Samantha', // macOS - natural female voice
    'Karen', // macOS - Australian female
    'Moira', // macOS - Irish female
    'Fiona', // macOS - Scottish female
    'Google US English Female', // Chrome
    'Microsoft Zira', // Windows
    'Microsoft Eva', // Windows
  ]

  // Try to find a preferred voice
  for (const name of preferredVoices) {
    const voice = voices.find(v => v.name.includes(name))
    if (voice) return voice
  }

  // Fall back to any English female voice
  const englishFemale = voices.find(v =>
    v.lang.startsWith('en') &&
    (v.name.toLowerCase().includes('female') ||
     v.name.includes('Samantha') ||
     v.name.includes('Karen') ||
     v.name.includes('Zira'))
  )
  if (englishFemale) return englishFemale

  // Fall back to any English voice
  const englishVoice = voices.find(v => v.lang.startsWith('en'))
  return englishVoice || voices[0] || null
}

/**
 * Hook for Nimbus text-to-speech
 * Uses Google Cloud TTS when available, falls back to browser Web Speech API
 */
export function useNimbusVoice(options: UseNimbusVoiceOptions = {}): UseNimbusVoiceReturn {
  const { enabled = true, onSpeakStart, onSpeakEnd, onError } = options

  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const isSpeakingRef = useRef(false) // Guard against concurrent calls

  // Load available voices
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return

    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices()
      if (availableVoices.length > 0) {
        setVoices(availableVoices)
      }
    }

    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices

    return () => {
      window.speechSynthesis.onvoiceschanged = null
    }
  }, [])

  // Stop any currently playing audio
  const stop = useCallback(() => {
    // Stop HTML5 audio
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }

    // Stop Web Speech synthesis
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }

    utteranceRef.current = null
    isSpeakingRef.current = false
    setIsSpeaking(false)
  }, [])

  // Play MP3 audio from base64
  const playMp3Audio = useCallback(async (base64Audio: string) => {
    return new Promise<void>((resolve, reject) => {
      try {
        // Stop any previous audio
        stop()

        // Create audio element
        const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`)
        audioRef.current = audio

        audio.onplay = () => {
          setIsSpeaking(true)
          onSpeakStart?.()
        }

        audio.onended = () => {
          setIsSpeaking(false)
          onSpeakEnd?.()
          audioRef.current = null
          resolve()
        }

        audio.onerror = (e) => {
          setIsSpeaking(false)
          audioRef.current = null
          reject(new Error('Failed to play audio'))
        }

        audio.play().catch(reject)
      } catch (err) {
        reject(err)
      }
    })
  }, [stop, onSpeakStart, onSpeakEnd])

  // Use browser Web Speech API
  const speakWithBrowserTTS = useCallback((text: string) => {
    return new Promise<void>((resolve, reject) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        reject(new Error('Speech synthesis not supported'))
        return
      }

      // Stop any previous speech
      stop()

      const utterance = new SpeechSynthesisUtterance(text)
      utteranceRef.current = utterance

      // Find and set a pleasant female voice
      const femaleVoice = findFemaleVoice(voices)
      if (femaleVoice) {
        utterance.voice = femaleVoice
      }

      // Configure voice properties for a calm, friendly tone
      utterance.rate = 0.95 // Slightly slower for calmness
      utterance.pitch = 1.1 // Slightly higher pitch
      utterance.volume = 1.0

      utterance.onstart = () => {
        setIsSpeaking(true)
        onSpeakStart?.()
      }

      utterance.onend = () => {
        setIsSpeaking(false)
        onSpeakEnd?.()
        utteranceRef.current = null
        resolve()
      }

      utterance.onerror = (event) => {
        setIsSpeaking(false)
        utteranceRef.current = null
        if (event.error !== 'canceled') {
          reject(new Error(`Speech synthesis error: ${event.error}`))
        } else {
          resolve() // Canceled is not an error
        }
      }

      window.speechSynthesis.speak(utterance)
    })
  }, [voices, stop, onSpeakStart, onSpeakEnd])

  // Speak text using Nimbus voice
  const speak = useCallback(async (text: string) => {
    if (!enabled) return
    if (!text.trim()) return

    // Prevent concurrent calls
    if (isSpeakingRef.current) {
      console.log('[Nimbus Voice] Already speaking, ignoring duplicate call')
      return
    }

    // Stop any current speech first
    stop()

    isSpeakingRef.current = true
    setError(null)
    setIsLoading(true)

    try {
      // Try to get audio from server (Google Cloud TTS)
      const response = await fetch('/api/nimbus/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })

      const data = await response.json()

      if (data.useBrowserTTS || !data.audio) {
        // Use browser TTS fallback
        console.log('[Nimbus Voice] Using browser TTS fallback')
        await speakWithBrowserTTS(text)
      } else {
        // Play Google Cloud TTS audio
        await playMp3Audio(data.audio)
      }
    } catch (err) {
      // Try browser TTS as final fallback
      console.log('[Nimbus Voice] API failed, using browser TTS:', err)
      try {
        await speakWithBrowserTTS(text)
      } catch (fallbackErr) {
        const errorMessage = fallbackErr instanceof Error ? fallbackErr.message : 'Failed to speak'
        setError(errorMessage)
        onError?.(errorMessage)
        console.error('[Nimbus Voice] All TTS methods failed:', fallbackErr)
      }
    } finally {
      isSpeakingRef.current = false
      setIsLoading(false)
    }
  }, [enabled, stop, playMp3Audio, speakWithBrowserTTS, onError])

  return {
    speak,
    stop,
    isSpeaking,
    isLoading,
    error,
  }
}
