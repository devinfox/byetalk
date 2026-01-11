'use client'

import { useTurboMode } from '@/lib/turbo-mode-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Phone, PhoneCall, PhoneIncoming, PhoneOff, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

export function TurboActiveCallsPanel() {
  const { activeCalls, isInTurboMode } = useTurboMode()

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'dialing':
        return <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />
      case 'ringing':
        return <PhoneIncoming className="h-4 w-4 text-blue-500 animate-pulse" />
      case 'answered':
      case 'connected':
        return <PhoneCall className="h-4 w-4 text-green-500" />
      default:
        return <PhoneOff className="h-4 w-4 text-gray-400" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'dialing':
        return 'bg-yellow-50 border-yellow-200'
      case 'ringing':
        return 'bg-blue-50 border-blue-200'
      case 'answered':
      case 'connected':
        return 'bg-green-50 border-green-200'
      default:
        return 'bg-gray-50 border-gray-200'
    }
  }

  const activeCallsFiltered = activeCalls.filter(c =>
    ['dialing', 'ringing', 'answered', 'connected'].includes(c.status)
  )

  if (!isInTurboMode) {
    return null
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Phone className="h-4 w-4" />
          Active Calls
          <Badge variant="secondary" className="ml-1">
            {activeCallsFiltered.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activeCallsFiltered.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <div className="flex justify-center gap-2 mb-2">
              <div className="w-3 h-3 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-3 h-3 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-3 h-3 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <p className="text-sm">Dialing leads...</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {activeCallsFiltered.map((call) => (
              <div
                key={call.id}
                className={cn(
                  'p-3 rounded-lg border transition-all duration-300',
                  getStatusColor(call.status)
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(call.status)}
                    <div>
                      <p className="font-medium text-sm">{call.lead_name || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">{call.lead_phone}</p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs capitalize',
                      call.status === 'connected' && 'border-green-500 text-green-700 bg-green-100'
                    )}
                  >
                    {call.status}
                  </Badge>
                </div>

                {call.dialed_at && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Started {formatDistanceToNow(new Date(call.dialed_at), { addSuffix: true })}
                  </p>
                )}

                {call.status === 'connected' && (
                  <div className="mt-2 pt-2 border-t border-green-200">
                    <div className="flex items-center gap-1 text-xs text-green-700">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      Call connected
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Placeholder slots for upcoming calls */}
            {activeCallsFiltered.length < 3 && (
              <>
                {Array.from({ length: 3 - activeCallsFiltered.length }).map((_, i) => (
                  <div
                    key={`placeholder-${i}`}
                    className="p-3 rounded-lg border border-dashed border-gray-200 bg-gray-50/50"
                  >
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="w-4 h-4 rounded-full border-2 border-dashed border-gray-300" />
                      <span className="text-sm">Waiting for next lead...</span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
