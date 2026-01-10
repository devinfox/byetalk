'use client'

import { ReactNode } from 'react'
import { useDialer } from '@/lib/dialer-context'

interface CallButtonProps {
  phone: string
  children: ReactNode
  className?: string
  leadId?: string
  contactId?: string
  entityName?: string
}

export function CallButton({
  phone,
  children,
  className,
  leadId,
  contactId,
  entityName,
}: CallButtonProps) {
  const { openDialer } = useDialer()

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    openDialer(phone, { leadId, contactId, entityName })
  }

  return (
    <button onClick={handleClick} className={className}>
      {children}
    </button>
  )
}
