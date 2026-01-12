'use client'

import { useState } from 'react'
import { useTurboMode } from '@/lib/turbo-mode-context'
import { useTwilioDeviceContext } from '@/lib/twilio-device-context'
import { Button } from '@/components/ui/button'
import { Zap, ZapOff, Loader2, Phone, PhoneOff, User } from 'lucide-react'
import { cn } from '@/lib/utils'

export function TurboModeToggle() {
  const {
    isInTurboMode,
    isLoading,
    session,
    activeSessions,
    activeCalls,
    startTurboMode,
    stopTurboMode,
    dialNextBatch,
    refreshStatus,
  } = useTurboMode()

  const { isReady, status, connectToUrl, hangUp } = useTwilioDeviceContext()
  const [isConnecting, setIsConnecting] = useState(false)

  const isInConference = status === 'connected' && isInTurboMode

  // Find the connected call assigned to this user
  const myConnectedCall = activeCalls.find(
    call => call.status === 'connected' && call.assigned_to === session?.user_id
  )

  const handleToggle = async () => {
    if (isInTurboMode) {
      // Stop turbo mode - disconnect from conference
      hangUp()
      await stopTurboMode()
    } else {
      // Start turbo mode
      const result = await startTurboMode()

      if (result.success && result.twiml_url) {
        // Connect to the conference
        setIsConnecting(true)
        console.log('[TurboMode] Connecting to conference:', result.twiml_url)

        const connected = await connectToUrl(result.twiml_url)

        if (connected) {
          console.log('[TurboMode] Connected to conference, starting auto-dial')
          // Give the conference a moment to start, then begin dialing
          setTimeout(() => {
            dialNextBatch()
          }, 2000)
        } else {
          console.error('[TurboMode] Failed to connect to conference')
          // Stop turbo mode if we couldn't connect
          await stopTurboMode()
        }

        setIsConnecting(false)
      }
    }
  }

  const buttonText = () => {
    if (isLoading || isConnecting) return 'Connecting...'
    if (isInTurboMode) return 'Exit Turbo Mode'
    return 'Enter Turbo Mode'
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Connected Lead Banner - Shows prominently when talking to a lead */}
      {myConnectedCall && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
              <User className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium uppercase tracking-wide opacity-90">You are connected with</p>
              <p className="text-2xl font-bold">{myConnectedCall.lead_name || 'Unknown Lead'}</p>
              <p className="text-sm opacity-90">{myConnectedCall.lead_phone}</p>
            </div>
          </div>
        </div>
      )}

      <Button
        onClick={handleToggle}
        disabled={isLoading || isConnecting || (!isReady && !isInTurboMode)}
        variant={isInTurboMode ? 'destructive' : 'default'}
        size="lg"
        className={cn(
          'relative overflow-hidden transition-all duration-300',
          isInTurboMode && 'bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 border-0'
        )}
      >
        {isLoading || isConnecting ? (
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
        ) : isInTurboMode ? (
          <ZapOff className="h-5 w-5 mr-2" />
        ) : (
          <Zap className="h-5 w-5 mr-2" />
        )}
        {buttonText()}

        {/* Pulsing animation when active */}
        {isInTurboMode && (
          <span className="absolute inset-0 rounded-md animate-pulse bg-white/10" />
        )}
      </Button>

      {/* Connection status indicator */}
      {isInTurboMode && (
        <div className="flex items-center justify-center gap-2 text-xs">
          {isInConference ? (
            <>
              <Phone className="h-3 w-3 text-green-500" />
              <span className="text-green-500">Connected to conference</span>
            </>
          ) : (
            <>
              <PhoneOff className="h-3 w-3 text-yellow-500" />
              <span className="text-yellow-500">Reconnecting...</span>
            </>
          )}
        </div>
      )}

      {/* Stats when in turbo mode */}
      {isInTurboMode && session && (
        <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">{session.calls_made}</span> dialed
          </span>
          <span>
            <span className="font-medium text-green-500">{session.calls_connected}</span> connected
          </span>
        </div>
      )}

      {/* Show other active reps */}
      {activeSessions.length > 0 && (
        <div className="text-xs text-muted-foreground text-center">
          {activeSessions.length} rep{activeSessions.length !== 1 ? 's' : ''} in turbo mode
        </div>
      )}

      {/* Show device not ready warning */}
      {!isReady && !isInTurboMode && (
        <div className="text-xs text-yellow-500 text-center">
          Initializing phone...
        </div>
      )}
    </div>
  )
}
