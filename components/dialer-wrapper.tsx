'use client'

import { ReactNode } from 'react'
import { DialerProvider } from '@/lib/dialer-context'
import { TwilioDeviceProvider } from '@/lib/twilio-device-context'
import { FloatingDialer } from './floating-dialer'

interface DialerWrapperProps {
  children: ReactNode
  userId?: string
}

export function DialerWrapper({ children, userId }: DialerWrapperProps) {
  return (
    <TwilioDeviceProvider>
      <DialerProvider>
        {children}
        <FloatingDialer userId={userId} />
      </DialerProvider>
    </TwilioDeviceProvider>
  )
}
