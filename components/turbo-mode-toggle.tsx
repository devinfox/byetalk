'use client'

import { useTurboMode } from '@/lib/turbo-mode-context'
import { Button } from '@/components/ui/button'
import { Zap, ZapOff, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function TurboModeToggle() {
  const {
    isInTurboMode,
    isLoading,
    session,
    activeSessions,
    startTurboMode,
    stopTurboMode,
  } = useTurboMode()

  const handleToggle = async () => {
    if (isInTurboMode) {
      await stopTurboMode()
    } else {
      await startTurboMode()
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={handleToggle}
        disabled={isLoading}
        variant={isInTurboMode ? 'destructive' : 'default'}
        size="lg"
        className={cn(
          'relative overflow-hidden transition-all duration-300',
          isInTurboMode && 'bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 border-0'
        )}
      >
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
        ) : isInTurboMode ? (
          <ZapOff className="h-5 w-5 mr-2" />
        ) : (
          <Zap className="h-5 w-5 mr-2" />
        )}
        {isInTurboMode ? 'Exit Turbo Mode' : 'Enter Turbo Mode'}

        {/* Pulsing animation when active */}
        {isInTurboMode && (
          <span className="absolute inset-0 rounded-md animate-pulse bg-white/10" />
        )}
      </Button>

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
    </div>
  )
}
