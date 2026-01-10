'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Loader2, FolderOpen } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Document, useDocuments } from '@/lib/document-context'
import { DocumentItem } from './document-item'

interface DocumentListProps {
  userId: string
}

export function DocumentList({ userId }: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const { refreshTrigger } = useDocuments()

  const fetchDocuments = useCallback(async () => {
    if (!userId) return

    setLoading(true)
    const supabase = createClient()

    let query = supabase
      .from('documents')
      .select('*')
      .eq('entity_type', 'global')
      .eq('uploaded_by', userId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(100)

    if (searchQuery) {
      query = query.ilike('file_name', `%${searchQuery}%`)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching documents:', error)
    } else {
      setDocuments(data || [])
    }
    setLoading(false)
  }, [userId, searchQuery])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments, refreshTrigger])

  const handleDelete = async (id: string) => {
    const supabase = createClient()

    const { error } = await supabase
      .from('documents')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      console.error('Error deleting document:', error)
      return
    }

    setDocuments(prev => prev.filter(d => d.id !== id))
  }

  const handleToggleFavorite = async (id: string, isFavorite: boolean) => {
    const supabase = createClient()

    const { error } = await supabase
      .from('documents')
      .update({ is_favorite: isFavorite })
      .eq('id', id)

    if (error) {
      console.error('Error updating favorite:', error)
      return
    }

    setDocuments(prev =>
      prev.map(d => d.id === id ? { ...d, is_favorite: isFavorite } : d)
    )
  }

  // Sort: favorites first, then by date
  const sortedDocuments = [...documents].sort((a, b) => {
    if (a.is_favorite && !b.is_favorite) return -1
    if (!a.is_favorite && b.is_favorite) return 1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Search */}
      <div className="p-3 border-b border-white/10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-yellow-500/50 focus:border-yellow-500/50"
          />
        </div>
      </div>

      {/* Document List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-5 h-5 text-yellow-400 animate-spin" />
          </div>
        ) : sortedDocuments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <FolderOpen className="w-8 h-8 text-gray-500 mb-2" />
            <p className="text-gray-500 text-sm">
              {searchQuery ? 'No documents found' : 'No documents yet'}
            </p>
            <p className="text-gray-600 text-xs">
              {searchQuery ? 'Try a different search' : 'Upload files to get started'}
            </p>
          </div>
        ) : (
          sortedDocuments.map(doc => (
            <DocumentItem
              key={doc.id}
              document={doc}
              onDelete={handleDelete}
              onToggleFavorite={handleToggleFavorite}
            />
          ))
        )}
      </div>
    </div>
  )
}
