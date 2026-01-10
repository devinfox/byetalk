'use client'

import { ReactNode } from 'react'
import { DialerProvider } from '@/lib/dialer-context'
import { FloatingDialer } from './floating-dialer'

interface DialerWrapperProps {
  children: ReactNode
  userId?: string
}

export function DialerWrapper({ children, userId }: DialerWrapperProps) {
  return (
    <DialerProvider>
      {children}
      <FloatingDialer userId={userId} />
    </DialerProvider>
  )
}
