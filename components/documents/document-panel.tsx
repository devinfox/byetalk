'use client'

import { FolderOpen, ChevronLeft, ChevronRight, Paperclip, X } from 'lucide-react'
import { useDocuments } from '@/lib/document-context'
import { DocumentUpload } from './document-upload'
import { DocumentList } from './document-list'

interface DocumentPanelProps {
  userId?: string
}

export function DocumentPanel({ userId }: DocumentPanelProps) {
  const {
    isPanelOpen,
    togglePanel,
    openPanel,
    selectedDocuments,
    clearSelection,
    attachToEmail,
  } = useDocuments()

  if (!userId) return null

  // Collapsed state
  if (!isPanelOpen) {
    return (
      <div className="flex-shrink-0 p-4 pr-0">
        <button
          onClick={openPanel}
          className="glass-card h-full w-12 flex flex-col items-center justify-center gap-2 hover:bg-white/5 transition-colors group"
          title="Open Documents"
        >
          <FolderOpen className="w-5 h-5 text-yellow-400" />
          <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
        </button>
      </div>
    )
  }

  // Expanded state
  return (
    <div className="w-80 flex-shrink-0 flex flex-col h-full p-4 pr-0">
      <div className="glass-card flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-yellow-400" />
            <h2 className="text-sm font-semibold text-white uppercase tracking-wide">Documents</h2>
          </div>
          <button
            onClick={togglePanel}
            className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            title="Close panel"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Upload Area */}
        <DocumentUpload userId={userId} />

        {/* Document List */}
        <DocumentList userId={userId} />

        {/* Selection Footer */}
        {selectedDocuments.length > 0 && (
          <div className="px-4 py-3 border-t border-white/10 bg-yellow-500/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-yellow-400 font-medium">
                {selectedDocuments.length} selected
              </span>
              <button
                onClick={clearSelection}
                className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
                title="Clear selection"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              onClick={attachToEmail}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium text-black transition-all"
              style={{
                background: 'linear-gradient(135deg, #ffd700 0%, #ffec8b 20%, #daa520 50%, #b8860b 80%, #cd853f 100%)',
              }}
            >
              <Paperclip className="w-4 h-4" />
              Attach to Email
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
