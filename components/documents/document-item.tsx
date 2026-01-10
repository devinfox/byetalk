'use client'

import { FileText, Image, File, FileSpreadsheet, FileCode, Film, Music, Archive, Star, Download, Trash2, MoreVertical } from 'lucide-react'
import { useState } from 'react'
import { Document, useDocuments } from '@/lib/document-context'

interface DocumentItemProps {
  document: Document
  onDelete: (id: string) => void
  onToggleFavorite: (id: string, isFavorite: boolean) => void
}

export function DocumentItem({ document, onDelete, onToggleFavorite }: DocumentItemProps) {
  const { isSelected, addToSelection, removeFromSelection } = useDocuments()
  const [showMenu, setShowMenu] = useState(false)
  const selected = isSelected(document.id)

  const getFileIcon = (mimeType: string | null, fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase()

    if (mimeType?.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '')) {
      return <Image className="w-5 h-5 text-purple-400" />
    }
    if (mimeType?.includes('pdf') || ext === 'pdf') {
      return <FileText className="w-5 h-5 text-red-400" />
    }
    if (mimeType?.includes('spreadsheet') || ['xlsx', 'xls', 'csv'].includes(ext || '')) {
      return <FileSpreadsheet className="w-5 h-5 text-green-400" />
    }
    if (mimeType?.includes('word') || ['doc', 'docx'].includes(ext || '')) {
      return <FileText className="w-5 h-5 text-blue-400" />
    }
    if (mimeType?.startsWith('video/') || ['mp4', 'mov', 'avi', 'webm'].includes(ext || '')) {
      return <Film className="w-5 h-5 text-pink-400" />
    }
    if (mimeType?.startsWith('audio/') || ['mp3', 'wav', 'ogg'].includes(ext || '')) {
      return <Music className="w-5 h-5 text-orange-400" />
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) {
      return <Archive className="w-5 h-5 text-yellow-400" />
    }
    if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'html', 'css', 'json'].includes(ext || '')) {
      return <FileCode className="w-5 h-5 text-cyan-400" />
    }
    return <File className="w-5 h-5 text-gray-400" />
  }

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown size'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const handleCheckboxChange = () => {
    if (selected) {
      removeFromSelection(document.id)
    } else {
      addToSelection(document)
    }
  }

  const handleDownload = () => {
    if (document.public_url) {
      window.open(document.public_url, '_blank')
    }
    setShowMenu(false)
  }

  return (
    <div
      className={`glass-card-subtle p-3 transition-all cursor-pointer group ${
        selected ? 'border-yellow-500/50 bg-yellow-500/10' : 'hover:bg-white/5'
      }`}
      onClick={handleCheckboxChange}
    >
      <div className="flex items-center gap-3">
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={selected}
          onChange={handleCheckboxChange}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 rounded border-white/20 bg-white/10 text-yellow-500 focus:ring-yellow-500/50 focus:ring-offset-0"
        />

        {/* File Icon */}
        <div className="flex-shrink-0">
          {getFileIcon(document.mime_type, document.file_name)}
        </div>

        {/* File Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate" title={document.file_name}>
            {document.file_name}
          </p>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>{formatFileSize(document.file_size_bytes)}</span>
            <span>•</span>
            <span>{formatDate(document.created_at)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleFavorite(document.id, !document.is_favorite)
            }}
            className={`p-1.5 rounded hover:bg-white/10 transition-colors ${
              document.is_favorite ? 'text-yellow-400' : 'text-gray-400 hover:text-yellow-400'
            }`}
            title={document.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Star className="w-4 h-4" fill={document.is_favorite ? 'currentColor' : 'none'} />
          </button>

          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowMenu(!showMenu)
              }}
              className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowMenu(false)
                  }}
                />
                <div className="absolute right-0 top-full mt-1 w-36 glass-card py-1 z-20">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDownload()
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/10 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(document.id)
                      setShowMenu(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
