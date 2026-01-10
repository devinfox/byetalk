'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  FolderOpen,
  Search,
  Upload,
  Loader2,
  FileText,
  FileImage,
  File,
  Trash2,
  Star,
  Download,
  MoreVertical,
  Grid,
  List,
  Filter,
  SortAsc,
  SortDesc,
  Eye,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useDocuments, Document } from '@/lib/document-context'

interface DocumentsPageClientProps {
  userId: string
}

type ViewMode = 'grid' | 'list'
type SortField = 'name' | 'date' | 'size'
type SortOrder = 'asc' | 'desc'

const FILE_ICONS: Record<string, React.ReactNode> = {
  pdf: <FileText className="w-8 h-8 text-red-400" />,
  doc: <FileText className="w-8 h-8 text-blue-400" />,
  docx: <FileText className="w-8 h-8 text-blue-400" />,
  xls: <FileText className="w-8 h-8 text-green-400" />,
  xlsx: <FileText className="w-8 h-8 text-green-400" />,
  png: <FileImage className="w-8 h-8 text-purple-400" />,
  jpg: <FileImage className="w-8 h-8 text-purple-400" />,
  jpeg: <FileImage className="w-8 h-8 text-purple-400" />,
  gif: <FileImage className="w-8 h-8 text-purple-400" />,
  webp: <FileImage className="w-8 h-8 text-purple-400" />,
}

function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  return FILE_ICONS[ext] || <File className="w-8 h-8 text-gray-400" />
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function DocumentsPageClient({ userId }: DocumentsPageClientProps) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [uploading, setUploading] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null)
  const { refreshTrigger, triggerRefresh } = useDocuments()

  const fetchDocuments = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    let query = supabase
      .from('documents')
      .select('*')
      .eq('entity_type', 'global')
      .eq('uploaded_by', userId)
      .eq('is_deleted', false)
      .limit(200)

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

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    const supabase = createClient()

    for (const file of Array.from(files)) {
      const fileExt = file.name.split('.').pop()
      const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, file)

      if (uploadError) {
        console.error('Upload error:', uploadError)
        continue
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(fileName)

      // Create document record
      await supabase.from('documents').insert({
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_size: file.size,
        file_type: file.type,
        entity_type: 'global',
        uploaded_by: userId,
      })
    }

    setUploading(false)
    triggerRefresh()
    e.target.value = ''
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return

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
    setSelectedDoc(null)
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
      prev.map(d => (d.id === id ? { ...d, is_favorite: isFavorite } : d))
    )
  }

  // Sort documents
  const sortedDocuments = [...documents].sort((a, b) => {
    // Favorites always first
    if (a.is_favorite && !b.is_favorite) return -1
    if (!a.is_favorite && b.is_favorite) return 1

    let comparison = 0
    switch (sortField) {
      case 'name':
        comparison = a.file_name.localeCompare(b.file_name)
        break
      case 'date':
        comparison = new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        break
      case 'size':
        comparison = (b.file_size || 0) - (a.file_size || 0)
        break
    }
    return sortOrder === 'asc' ? -comparison : comparison
  })

  const stats = {
    total: documents.length,
    totalSize: documents.reduce((sum, d) => sum + (d.file_size || 0), 0),
    favorites: documents.filter(d => d.is_favorite).length,
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-light text-white flex items-center gap-3">
            <FolderOpen className="w-7 h-7 text-yellow-400" />
            Documents
          </h1>
          <p className="text-gray-400 mt-1">
            {stats.total} files ({formatFileSize(stats.totalSize)})
            {stats.favorites > 0 && ` · ${stats.favorites} favorites`}
          </p>
        </div>

        {/* Upload Button */}
        <label className="cursor-pointer">
          <input
            type="file"
            multiple
            onChange={handleUpload}
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv"
          />
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-black transition-all hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, #ffd700 0%, #ffec8b 20%, #daa520 50%, #b8860b 80%, #cd853f 100%)',
            }}
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Upload Files
          </div>
        </label>
      </div>

      {/* Toolbar */}
      <div className="glass-card p-4 mb-4 flex items-center gap-4 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-yellow-500/50"
          />
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-yellow-500/50"
          >
            <option value="date">Date</option>
            <option value="name">Name</option>
            <option value="size">Size</option>
          </select>
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="p-2 bg-white/5 border border-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            {sortOrder === 'asc' ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />}
          </button>
        </div>

        {/* View Toggle */}
        <div className="flex items-center border border-white/10 rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-400 hover:text-white'}`}
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-400 hover:text-white'}`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Document Grid/List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-yellow-400 animate-spin" />
          </div>
        ) : sortedDocuments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <FolderOpen className="w-16 h-16 text-gray-600 mb-4" />
            <h3 className="text-lg font-medium text-gray-400 mb-2">
              {searchQuery ? 'No documents found' : 'No documents yet'}
            </h3>
            <p className="text-gray-500 text-sm mb-4">
              {searchQuery ? 'Try a different search term' : 'Upload files to get started'}
            </p>
            {!searchQuery && (
              <label className="cursor-pointer">
                <input
                  type="file"
                  multiple
                  onChange={handleUpload}
                  className="hidden"
                />
                <div className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors">
                  <Upload className="w-4 h-4" />
                  Upload your first file
                </div>
              </label>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {sortedDocuments.map((doc) => (
              <div
                key={doc.id}
                className={`glass-card p-4 hover:bg-white/5 transition-colors cursor-pointer group relative ${
                  selectedDoc === doc.id ? 'ring-2 ring-yellow-500' : ''
                }`}
                onClick={() => setSelectedDoc(selectedDoc === doc.id ? null : doc.id)}
              >
                {/* Favorite Star */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleToggleFavorite(doc.id, !doc.is_favorite)
                  }}
                  className={`absolute top-2 right-2 p-1 rounded transition-colors ${
                    doc.is_favorite
                      ? 'text-yellow-400'
                      : 'text-gray-600 opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <Star className={`w-4 h-4 ${doc.is_favorite ? 'fill-current' : ''}`} />
                </button>

                {/* Icon */}
                <div className="flex justify-center mb-3">
                  {getFileIcon(doc.file_name)}
                </div>

                {/* Name */}
                <p className="text-sm text-white truncate text-center mb-1" title={doc.file_name}>
                  {doc.file_name}
                </p>

                {/* Meta */}
                <p className="text-xs text-gray-500 text-center">
                  {formatFileSize(doc.file_size || 0)} · {formatDate(doc.created_at)}
                </p>

                {/* Actions (on hover) */}
                <div className="absolute bottom-2 left-2 right-2 flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 bg-white/10 hover:bg-white/20 rounded text-gray-300 hover:text-white transition-colors"
                    title="View"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </a>
                  <a
                    href={doc.file_url}
                    download={doc.file_name}
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 bg-white/10 hover:bg-white/20 rounded text-gray-300 hover:text-white transition-colors"
                    title="Download"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(doc.id)
                    }}
                    className="p-1.5 bg-white/10 hover:bg-red-500/20 rounded text-gray-300 hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Size</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedDocuments.map((doc) => (
                  <tr
                    key={doc.id}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleToggleFavorite(doc.id, !doc.is_favorite)}
                          className={doc.is_favorite ? 'text-yellow-400' : 'text-gray-600 hover:text-gray-400'}
                        >
                          <Star className={`w-4 h-4 ${doc.is_favorite ? 'fill-current' : ''}`} />
                        </button>
                        {getFileIcon(doc.file_name)}
                        <span className="text-sm text-white truncate max-w-[300px]">{doc.file_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {formatFileSize(doc.file_size || 0)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {formatDate(doc.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
                          title="View"
                        >
                          <Eye className="w-4 h-4" />
                        </a>
                        <a
                          href={doc.file_url}
                          download={doc.file_name}
                          className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => handleDelete(doc.id)}
                          className="p-1.5 hover:bg-red-500/10 rounded text-gray-400 hover:text-red-400 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
