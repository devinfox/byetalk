"use client"

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react"
import { NimbusAssistant, NimbusMood } from "./nimbus-assistant"
import { useNimbusVoice } from "@/lib/use-nimbus-voice"

// Extend Window interface for Nimbus testing
declare global {
  interface Window {
    testNimbus?: (mood?: NimbusMood, message?: string, userName?: string) => void
  }
}

interface NimbusAlert {
  id: string
  mood: NimbusMood
  title?: string
  message: string
  subMessage?: string
  actionLabel?: string
  onAction?: () => void
  dismissLabel?: string
  onDismiss?: () => void
  speakText?: string // Custom text for voice, defaults to title + message
  skipVoice?: boolean // Set to true to skip voice for this alert
}

interface NimbusContextType {
  showNimbus: (alert: Omit<NimbusAlert, "id">) => string
  hideNimbus: (id?: string) => void
  isVisible: boolean
  isSpeaking: boolean
  voiceEnabled: boolean
  setVoiceEnabled: (enabled: boolean) => void
  // Queue navigation
  queueLength: number
  currentIndex: number
  goToNext: () => void
  goToPrevious: () => void
}

const NimbusContext = createContext<NimbusContextType | null>(null)

export function useNimbus() {
  const context = useContext(NimbusContext)
  if (!context) {
    throw new Error("useNimbus must be used within a NimbusProvider")
  }
  return context
}

interface NimbusProviderProps {
  children: ReactNode
}

const VOICE_SETTINGS_KEY = 'nimbus-voice-enabled'

export function NimbusProvider({ children }: NimbusProviderProps) {
  const [allAlerts, setAllAlerts] = useState<NimbusAlert[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isVisible, setIsVisible] = useState(false)
  const [voiceEnabled, setVoiceEnabledState] = useState(true)
  // Use ref instead of state to track spoken alerts - refs are synchronous
  const spokenAlertIdsRef = useRef<Set<string>>(new Set())

  // Derived state
  const currentAlert = allAlerts.length > 0 ? allAlerts[currentIndex] : null
  const queueLength = allAlerts.length

  // Load voice settings from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(VOICE_SETTINGS_KEY)
      if (saved !== null) {
        setVoiceEnabledState(saved === 'true')
      }
    }
  }, [])

  // Save voice settings to localStorage when changed
  const setVoiceEnabled = useCallback((enabled: boolean) => {
    setVoiceEnabledState(enabled)
    if (typeof window !== 'undefined') {
      localStorage.setItem(VOICE_SETTINGS_KEY, String(enabled))
    }
  }, [])

  // Toggle voice on/off
  const toggleVoice = useCallback(() => {
    setVoiceEnabled(!voiceEnabled)
  }, [voiceEnabled, setVoiceEnabled])

  // Initialize Nimbus voice
  const { speak, stop: stopSpeaking, isSpeaking } = useNimbusVoice({
    enabled: voiceEnabled,
    onSpeakStart: () => console.log('[Nimbus] Started speaking'),
    onSpeakEnd: () => console.log('[Nimbus] Finished speaking'),
    onError: (error) => console.error('[Nimbus Voice Error]', error),
  })

  // Speak when a new alert is shown - only once per alert
  useEffect(() => {
    if (!isVisible || !currentAlert || !voiceEnabled || currentAlert.skipVoice) {
      return
    }

    const alertId = currentAlert.id

    // Check if we've already spoken this alert (using ref for synchronous check)
    if (spokenAlertIdsRef.current.has(alertId)) {
      console.log('[Nimbus] Alert already spoken, skipping:', alertId)
      return
    }

    // Mark this alert as spoken IMMEDIATELY (synchronous with ref)
    spokenAlertIdsRef.current.add(alertId)
    console.log('[Nimbus] Marking alert as spoken:', alertId)

    // Build the text to speak
    const textToSpeak = currentAlert.speakText ||
      [currentAlert.title, currentAlert.message, currentAlert.subMessage]
        .filter(Boolean)
        .join('. ')

    if (textToSpeak) {
      // Small delay to let the animation start
      const timer = setTimeout(() => {
        speak(textToSpeak)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [isVisible, currentAlert?.id, voiceEnabled, speak]) // Include speak in deps

  // Stop speaking when Nimbus is hidden
  useEffect(() => {
    if (!isVisible) {
      stopSpeaking()
    }
  }, [isVisible, stopSpeaking])

  // Navigation functions
  const goToNext = useCallback(() => {
    if (currentIndex < allAlerts.length - 1) {
      setCurrentIndex(prev => prev + 1)
    }
  }, [currentIndex, allAlerts.length])

  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1)
    }
  }, [currentIndex])

  const showNimbus = useCallback((alert: Omit<NimbusAlert, "id">) => {
    const id = `nimbus-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const fullAlert: NimbusAlert = { ...alert, id }

    setAllAlerts(prev => {
      const newAlerts = [...prev, fullAlert]
      // If this is the first alert or Nimbus isn't visible, show it
      if (!isVisible || prev.length === 0) {
        setCurrentIndex(newAlerts.length - 1)
        setIsVisible(true)
      }
      return newAlerts
    })

    return id
  }, [isVisible])

  const hideNimbus = useCallback((id?: string) => {
    // If dismissing specific alert, remove it from the queue
    if (id) {
      setAllAlerts(prev => {
        const newAlerts = prev.filter(a => a.id !== id)
        if (newAlerts.length === 0) {
          setIsVisible(false)
          setCurrentIndex(0)
        } else {
          // Adjust currentIndex if needed
          const removedIndex = prev.findIndex(a => a.id === id)
          if (removedIndex <= currentIndex && currentIndex > 0) {
            setCurrentIndex(curr => curr - 1)
          }
        }
        return newAlerts
      })
    } else {
      // Dismiss current alert
      setAllAlerts(prev => {
        const newAlerts = prev.filter((_, i) => i !== currentIndex)
        if (newAlerts.length === 0) {
          setIsVisible(false)
          setCurrentIndex(0)
        } else if (currentIndex >= newAlerts.length) {
          setCurrentIndex(newAlerts.length - 1)
        }
        return newAlerts
      })
    }
  }, [currentIndex])

  const handleClose = useCallback(() => {
    hideNimbus()
  }, [hideNimbus])

  const handleAction = useCallback(() => {
    if (currentAlert?.onAction) {
      currentAlert.onAction()
    }
    hideNimbus()
  }, [currentAlert, hideNimbus])

  const handleDismiss = useCallback(() => {
    if (currentAlert?.onDismiss) {
      currentAlert.onDismiss()
    }
    hideNimbus()
  }, [currentAlert, hideNimbus])

  // Expose test function to window for development testing
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.testNimbus = (mood: NimbusMood = 'happy', message?: string, userName?: string) => {
        const name = userName || 'there'
        const msg = message || 'This is a test message from IT'
        showNimbus({
          mood,
          title: `Hi ${name}!`,
          message: msg,
          subMessage: 'This is a test notification.',
          actionLabel: 'Got it!',
          onAction: () => {},
        })
      }

      return () => {
        delete window.testNimbus
      }
    }
  }, [showNimbus])

  return (
    <NimbusContext.Provider value={{
      showNimbus,
      hideNimbus,
      isVisible,
      isSpeaking,
      voiceEnabled,
      setVoiceEnabled,
      queueLength,
      currentIndex,
      goToNext,
      goToPrevious
    }}>
      {children}
      <NimbusAssistant
        isVisible={isVisible}
        onClose={handleClose}
        mood={currentAlert?.mood || "happy"}
        title={currentAlert?.title}
        isSpeaking={isSpeaking}
        voiceEnabled={voiceEnabled}
        onToggleVoice={toggleVoice}
        message={currentAlert?.message || ""}
        subMessage={currentAlert?.subMessage}
        actionLabel={currentAlert?.actionLabel}
        onAction={currentAlert?.onAction ? handleAction : undefined}
        dismissLabel={currentAlert?.dismissLabel}
        onDismiss={currentAlert?.onDismiss ? handleDismiss : undefined}
        // Queue navigation
        queueLength={queueLength}
        currentIndex={currentIndex}
        onNext={queueLength > 1 && currentIndex < queueLength - 1 ? goToNext : undefined}
        onPrevious={queueLength > 1 && currentIndex > 0 ? goToPrevious : undefined}
      />
    </NimbusContext.Provider>
  )
}
