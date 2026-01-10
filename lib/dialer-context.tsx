'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

interface EntityInfo {
  leadId?: string
  contactId?: string
  entityName?: string // For display purposes
}

interface DialerContextType {
  isOpen: boolean
  phoneNumber: string
  entityInfo: EntityInfo | null
  openDialer: (phone?: string, entity?: EntityInfo) => void
  closeDialer: () => void
  setPhoneNumber: (phone: string) => void
}

const DialerContext = createContext<DialerContextType | undefined>(undefined)

export function DialerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [entityInfo, setEntityInfo] = useState<EntityInfo | null>(null)

  const openDialer = (phone?: string, entity?: EntityInfo) => {
    if (phone) {
      setPhoneNumber(phone.replace(/\D/g, ''))
    }
    if (entity) {
      setEntityInfo(entity)
    }
    setIsOpen(true)
  }

  const closeDialer = () => {
    setIsOpen(false)
    setEntityInfo(null)
  }

  return (
    <DialerContext.Provider
      value={{
        isOpen,
        phoneNumber,
        entityInfo,
        openDialer,
        closeDialer,
        setPhoneNumber,
      }}
    >
      {children}
    </DialerContext.Provider>
  )
}

export function useDialer() {
  const context = useContext(DialerContext)
  if (context === undefined) {
    throw new Error('useDialer must be used within a DialerProvider')
  }
  return context
}
