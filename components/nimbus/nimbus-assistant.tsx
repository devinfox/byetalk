"use client"

import { useState, useEffect, useRef } from "react"
import { X, Volume2, VolumeX, ChevronLeft, ChevronRight } from "lucide-react"

export type NimbusMood = "happy" | "talking" | "concerned"

interface NimbusAssistantProps {
  isVisible: boolean
  onClose: () => void
  mood: NimbusMood
  title?: string
  message: string
  subMessage?: string
  actionLabel?: string
  onAction?: () => void
  dismissLabel?: string
  onDismiss?: () => void
  isSpeaking?: boolean
  voiceEnabled?: boolean
  onToggleVoice?: () => void
  // Queue navigation
  queueLength?: number
  currentIndex?: number
  onNext?: () => void
  onPrevious?: () => void
}

const MOOD_IMAGES: Record<NimbusMood, string> = {
  happy: "/nimbus-mouth-opened.png",
  talking: "/nimbus-mouth-opened.png",
  concerned: "/nimbus-concerned.png",
}

const INTRO_DURATION = 2000 // Duration of intro animation in ms

export function NimbusAssistant({
  isVisible,
  onClose,
  mood,
  title,
  message,
  subMessage,
  actionLabel,
  onAction,
  dismissLabel,
  onDismiss,
  isSpeaking = false,
  voiceEnabled = true,
  onToggleVoice,
  queueLength = 1,
  currentIndex = 0,
  onNext,
  onPrevious,
}: NimbusAssistantProps) {
  const hasMultipleAlerts = queueLength > 1
  const [showIntro, setShowIntro] = useState(true)
  const [hasEntered, setHasEntered] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const introSoundRef = useRef<HTMLAudioElement | null>(null)

  // Reset intro state when becoming visible
  useEffect(() => {
    if (isVisible) {
      setShowIntro(true)
      setHasEntered(false)

      // Small delay before starting entrance
      const enterTimeout = setTimeout(() => {
        setHasEntered(true)
      }, 50)

      return () => clearTimeout(enterTimeout)
    } else {
      setHasEntered(false)
    }
  }, [isVisible])

  // Handle intro video and sound
  useEffect(() => {
    if (isVisible && showIntro) {
      const video = videoRef.current

      if (video) {
        video.currentTime = 0
        video.play().catch(() => {
          // If video fails to play, skip to static image
          setShowIntro(false)
        })

        // Play intro sound 1 second after video starts (if voice enabled)
        let soundTimeout: NodeJS.Timeout | null = null
        if (voiceEnabled) {
          soundTimeout = setTimeout(() => {
            try {
              const introSound = new Audio('/nimbus-intro-sound.mp3')
              introSoundRef.current = introSound
              introSound.volume = 0.5 // Not too loud
              introSound.play().catch(() => {
                // Ignore audio play errors (browser autoplay policy)
              })
            } catch {
              // Ignore errors
            }
          }, 1000)
        }

        const handleEnded = () => {
          setShowIntro(false)
        }

        video.addEventListener("ended", handleEnded)

        // Longer fallback timeout to ensure video fully plays
        // Only trigger if video hasn't ended naturally
        const fallbackTimeout = setTimeout(() => {
          if (showIntro) {
            setShowIntro(false)
          }
        }, INTRO_DURATION + 1000)

        return () => {
          video.removeEventListener("ended", handleEnded)
          clearTimeout(fallbackTimeout)
          if (soundTimeout) clearTimeout(soundTimeout)
          // Stop intro sound if component unmounts
          if (introSoundRef.current) {
            introSoundRef.current.pause()
            introSoundRef.current = null
          }
        }
      }
    }
  }, [isVisible, showIntro, voiceEnabled])

  if (!isVisible) return null

  const moodImage = MOOD_IMAGES[mood]

  return (
    <div
      className={`fixed bottom-24 right-6 z-[200] flex items-end gap-6 transition-transform duration-500 ease-out ${
        hasEntered ? "translate-x-0" : "translate-x-[calc(100%+1.5rem)]"
      }`}
      style={{ maxWidth: "min(680px, calc(100vw - 3rem))" }}
    >
      {/* Speech Bubble */}
      <div
        className={`relative bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-200 p-7 mb-24 transition-opacity duration-300 ${
          showIntro ? "opacity-0" : "opacity-100"
        }`}
        style={{ maxWidth: "380px" }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-2 -right-2 w-7 h-7 bg-gray-800 hover:bg-gray-700 rounded-full flex items-center justify-center transition-colors shadow-lg"
        >
          <X className="w-4 h-4 text-white" />
        </button>

        {/* Sound toggle button */}
        {onToggleVoice && (
          <button
            onClick={onToggleVoice}
            className="absolute -top-2 -right-11 w-7 h-7 bg-gray-800 hover:bg-gray-700 rounded-full flex items-center justify-center transition-colors shadow-lg"
            title={voiceEnabled ? "Mute Nimbus" : "Unmute Nimbus"}
          >
            {voiceEnabled ? (
              <Volume2 className="w-4 h-4 text-white" />
            ) : (
              <VolumeX className="w-4 h-4 text-gray-400" />
            )}
          </button>
        )}

        {/* Content */}
        <div className="space-y-3">
          {title && (
            <h3 className="font-semibold text-gray-900 text-lg">{title}</h3>
          )}
          <p className="text-gray-700 text-base leading-relaxed">{message}</p>
          {subMessage && (
            <p className="text-gray-500 text-base">{subMessage}</p>
          )}

          {/* Action buttons */}
          {(actionLabel || dismissLabel) && (
            <div className="flex gap-3 pt-3">
              {dismissLabel && onDismiss && (
                <button
                  onClick={onDismiss}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  {dismissLabel}
                </button>
              )}
              {actionLabel && onAction && (
                <button
                  onClick={onAction}
                  className="flex-1 px-4 py-2 text-sm font-medium text-black rounded-lg transition-all hover:scale-105"
                  style={{
                    background: "linear-gradient(135deg, #ffd700 0%, #ffec8b 20%, #daa520 50%, #b8860b 80%, #cd853f 100%)",
                  }}
                >
                  {actionLabel}
                </button>
              )}
            </div>
          )}

          {/* Queue navigation */}
          {hasMultipleAlerts && (
            <div className="flex items-center justify-center gap-3 pt-2 border-t border-gray-200 mt-3">
              <button
                onClick={onPrevious}
                disabled={!onPrevious}
                className={`p-1.5 rounded-full transition-colors ${
                  onPrevious
                    ? "hover:bg-gray-100 text-gray-700"
                    : "text-gray-300 cursor-not-allowed"
                }`}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm text-gray-500 font-medium min-w-[60px] text-center">
                {currentIndex + 1} of {queueLength}
              </span>
              <button
                onClick={onNext}
                disabled={!onNext}
                className={`p-1.5 rounded-full transition-colors ${
                  onNext
                    ? "hover:bg-gray-100 text-gray-700"
                    : "text-gray-300 cursor-not-allowed"
                }`}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {/* Speech bubble pointer */}
        <div
          className="absolute -right-2 bottom-8 w-5 h-5 bg-white/95 border-r border-b border-gray-200 transform rotate-[-45deg]"
        />
      </div>

      {/* Nimbus Character */}
      <div className="relative flex-shrink-0 w-72 h-72 animate-float">

        {/* Intro Animation */}
        <video
          ref={videoRef}
          src="/nimbus-intro-animation.webm"
          className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-300 ${
            showIntro ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          muted
          playsInline
        />

        {/* Static Expression */}
        <img
          src={moodImage}
          alt={`Nimbus ${mood}`}
          className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-300 ${
            showIntro ? "opacity-0" : "opacity-100"
          }`}
        />
      </div>

      <style jsx>{`
        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-8px);
          }
        }
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
