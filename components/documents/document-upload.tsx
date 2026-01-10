'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, X, FileText, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useDocuments } from '@/lib/document-context'

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/zip',
  'application/x-rar-compressed',
]

interface UploadingFile {
  file: File
  progress: number
  error?: string
}

interface DocumentUploadProps {
  userId: string
}

export function DocumentUpload({ userId }: DocumentUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { triggerRefresh } = useDocuments()

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`
    }
    // Allow any file type for flexibility, but warn if unusual
    return null
  }

  const uploadFile = async (file: File) => {
    const error = validateFile(file)
    if (error) {
      setUploadingFiles(prev =>
        prev.map(f => f.file === file ? { ...f, error } : f)
      )
      return
    }

    const supabase = createClient()
    const timestamp = Date.now()
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const storagePath = `${userId}/${timestamp}-${sanitizedName}`

    try {
      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file, {
          contentType: file.type,
        })

      if (uploadError) throw uploadError

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(storagePath)

      // Create database record
      const { error: dbError } = await supabase.from('documents').insert({
        file_name: file.name,
        file_type: file.name.split('.').pop() || null,
        file_size_bytes: file.size,
        mime_type: file.type || null,
        storage_path: storagePath,
        storage_bucket: 'documents',
        public_url: urlData.publicUrl,
        entity_type: 'global',
        entity_id: null,
        uploaded_by: userId,
      })

      if (dbError) throw dbError

      // Update progress to complete
      setUploadingFiles(prev =>
        prev.map(f => f.file === file ? { ...f, progress: 100 } : f)
      )

      // Remove from uploading list after a short delay
      setTimeout(() => {
        setUploadingFiles(prev => prev.filter(f => f.file !== file))
        triggerRefresh()
      }, 1000)

    } catch (err) {
      console.error('Upload error:', err)
      setUploadingFiles(prev =>
        prev.map(f => f.file === file ? { ...f, error: 'Upload failed' } : f)
      )
    }
  }

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return

    const newFiles = Array.from(files).map(file => ({
      file,
      progress: 0,
    }))

    setUploadingFiles(prev => [...prev, ...newFiles])

    // Start uploading each file
    newFiles.forEach(({ file }) => {
      uploadFile(file)
    })
  }, [userId])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files)
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [handleFiles])

  const removeUploadingFile = (file: File) => {
    setUploadingFiles(prev => prev.filter(f => f.file !== file))
  }

  return (
    <div className="p-3 border-b border-white/10">
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-yellow-500 bg-yellow-500/10'
            : 'border-white/20 hover:border-yellow-500/50 hover:bg-yellow-500/5'
        }`}
      >
        <Upload className={`w-6 h-6 mx-auto mb-2 ${isDragging ? 'text-yellow-400' : 'text-gray-400'}`} />
        <p className="text-xs text-gray-400">
          {isDragging ? 'Drop files here' : 'Drop files or click to upload'}
        </p>
        <p className="text-xs text-gray-500 mt-1">Max 25MB per file</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleInputChange}
        className="hidden"
      />

      {/* Uploading Files */}
      {uploadingFiles.length > 0 && (
        <div className="mt-3 space-y-2">
          {uploadingFiles.map((item, index) => (
            <div key={index} className="flex items-center gap-2 p-2 glass-card-subtle rounded-lg">
              <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white truncate">{item.file.name}</p>
                {item.error ? (
                  <p className="text-xs text-red-400">{item.error}</p>
                ) : item.progress < 100 ? (
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-yellow-500 transition-all duration-300"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                    <Loader2 className="w-3 h-3 text-yellow-400 animate-spin" />
                  </div>
                ) : (
                  <p className="text-xs text-green-400">Uploaded!</p>
                )}
              </div>
              {item.error && (
                <button
                  onClick={() => removeUploadingFile(item.file)}
                  className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
