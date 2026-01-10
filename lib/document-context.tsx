'use client'

import { createContext, useContext, useState, ReactNode, useCallback } from 'react'

export interface Document {
  id: string
  file_name: string
  file_type: string | null
  file_size_bytes: number | null
  mime_type: string | null
  storage_path: string
  storage_bucket: string
  public_url: string | null
  entity_type: string
  entity_id: string | null
  uploaded_by: string
  description: string | null
  tags: string[] | null
  is_favorite: boolean
  created_at: string
  updated_at: string
}

interface DocumentContextType {
  // Panel state
  isPanelOpen: boolean
  togglePanel: () => void
  openPanel: () => void
  closePanel: () => void

  // Selection for email attachment
  selectedDocuments: Document[]
  addToSelection: (doc: Document) => void
  removeFromSelection: (id: string) => void
  clearSelection: () => void
  isSelected: (id: string) => boolean

  // For integrating with email compose
  pendingAttachments: Document[]
  attachToEmail: () => void
  clearPendingAttachments: () => void

  // Refresh trigger
  refreshTrigger: number
  triggerRefresh: () => void
}

const DocumentContext = createContext<DocumentContextType | undefined>(undefined)

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [selectedDocuments, setSelectedDocuments] = useState<Document[]>([])
  const [pendingAttachments, setPendingAttachments] = useState<Document[]>([])
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const togglePanel = useCallback(() => {
    setIsPanelOpen(prev => !prev)
  }, [])

  const openPanel = useCallback(() => {
    setIsPanelOpen(true)
  }, [])

  const closePanel = useCallback(() => {
    setIsPanelOpen(false)
  }, [])

  const addToSelection = useCallback((doc: Document) => {
    setSelectedDocuments(prev => {
      if (prev.find(d => d.id === doc.id)) return prev
      return [...prev, doc]
    })
  }, [])

  const removeFromSelection = useCallback((id: string) => {
    setSelectedDocuments(prev => prev.filter(d => d.id !== id))
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedDocuments([])
  }, [])

  const isSelected = useCallback((id: string) => {
    return selectedDocuments.some(d => d.id === id)
  }, [selectedDocuments])

  const attachToEmail = useCallback(() => {
    setPendingAttachments(selectedDocuments)
    setSelectedDocuments([])
  }, [selectedDocuments])

  const clearPendingAttachments = useCallback(() => {
    setPendingAttachments([])
  }, [])

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1)
  }, [])

  return (
    <DocumentContext.Provider
      value={{
        isPanelOpen,
        togglePanel,
        openPanel,
        closePanel,
        selectedDocuments,
        addToSelection,
        removeFromSelection,
        clearSelection,
        isSelected,
        pendingAttachments,
        attachToEmail,
        clearPendingAttachments,
        refreshTrigger,
        triggerRefresh,
      }}
    >
      {children}
    </DocumentContext.Provider>
  )
}

export function useDocuments() {
  const context = useContext(DocumentContext)
  if (context === undefined) {
    throw new Error('useDocuments must be used within a DocumentProvider')
  }
  return context
}
