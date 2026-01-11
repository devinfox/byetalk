'use client'

import { useTurboMode } from '@/lib/turbo-mode-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Phone, Trash2, X, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TurboQueuePanelProps {
  onAddLeads?: () => void
}

export function TurboQueuePanel({ onAddLeads }: TurboQueuePanelProps) {
  const {
    queueItems,
    queueCount,
    removeFromQueue,
    clearQueue,
  } = useTurboMode()

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
            Call Queue
            <Badge variant="secondary" className="ml-1">
              {queueCount}
            </Badge>
          </CardTitle>
          <div className="flex gap-2">
            {onAddLeads && (
              <Button variant="outline" size="sm" onClick={onAddLeads}>
                Add Leads
              </Button>
            )}
            {queueCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearQueue}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {queueItems.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No leads in queue</p>
            <p className="text-xs mt-1">Add leads to start turbo dialing</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {queueItems.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    'flex items-center justify-between p-2 rounded-lg border',
                    item.status === 'dialing' && 'bg-yellow-50 border-yellow-200',
                    item.status === 'ringing' && 'bg-blue-50 border-blue-200',
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {item.leads?.first_name} {item.leads?.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.leads?.phone}
                    </p>
                  </div>

                  {item.status !== 'queued' && (
                    <Badge
                      variant="outline"
                      className={cn(
                        'ml-2 text-xs',
                        item.status === 'dialing' && 'border-yellow-500 text-yellow-700',
                        item.status === 'ringing' && 'border-blue-500 text-blue-700',
                      )}
                    >
                      {item.status}
                    </Badge>
                  )}

                  {item.status === 'queued' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFromQueue(item.lead_id)}
                      className="h-8 w-8 p-0 hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
