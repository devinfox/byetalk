'use client'

import { useState, useCallback } from 'react'
import { usePresentation } from '@/lib/presentation-context'
import { Search, Upload, Loader2, ImageIcon, X } from 'lucide-react'
import type { UnsplashPhoto } from '@/types/presentation.types'

export function AssetsPanel() {
  const { getCanvas, generateId, setIsDirty } = usePresentation()

  const [searchQuery, setSearchQuery] = useState('')
  const [photos, setPhotos] = useState<UnsplashPhoto[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  const searchUnsplash = useCallback(async () => {
    if (!searchQuery.trim()) return

    setLoading(true)
    try {
      const response = await fetch(
        `/api/presentations/unsplash?query=${encodeURIComponent(searchQuery)}`
      )
      if (response.ok) {
        const data = await response.json()
        setPhotos(data.results || [])
      }
    } catch (error) {
      console.error('Error searching Unsplash:', error)
    }
    setLoading(false)
  }, [searchQuery])

  const addImageToCanvas = useCallback(
    async (imageUrl: string, photo?: UnsplashPhoto) => {
      const canvas = getCanvas()
      if (!canvas) return

      const fabric = await import('fabric')
      const id = generateId()

      // Track download if Unsplash
      if (photo) {
        fetch('/api/presentations/unsplash', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ download_location: photo.links.download_location }),
        }).catch(console.error)
      }

      fabric.FabricImage.fromURL(
        imageUrl,
        {
          crossOrigin: 'anonymous',
        }
      ).then((img) => {
        // Scale to fit canvas while maintaining aspect ratio
        const maxWidth = canvas.width! * 0.5
        const maxHeight = canvas.height! * 0.5
        const scale = Math.min(maxWidth / img.width!, maxHeight / img.height!)

        img.set({
          left: (canvas.width! - img.width! * scale) / 2,
          top: (canvas.height! - img.height! * scale) / 2,
          scaleX: scale,
          scaleY: scale,
          id,
          unsplashId: photo?.id,
        } as any)

        canvas.add(img)
        canvas.setActiveObject(img)
        canvas.renderAll()
        setIsDirty(true)
      })
    },
    [getCanvas, generateId, setIsDirty]
  )

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files || files.length === 0) return

      setUploading(true)

      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue

        // Read file as data URL
        const reader = new FileReader()
        reader.onload = (event) => {
          const dataUrl = event.target?.result as string
          if (dataUrl) {
            addImageToCanvas(dataUrl)
          }
        }
        reader.readAsDataURL(file)
      }

      setUploading(false)
      e.target.value = ''
    },
    [addImageToCanvas]
  )

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-white/10">
        <h3 className="text-sm font-medium text-white">Assets</h3>
      </div>

      <div className="p-4 border-b border-white/10 space-y-3">
        {/* Upload Button */}
        <label className="block cursor-pointer">
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
          <div className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors">
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Upload Image
          </div>
        </label>

        {/* Unsplash Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchUnsplash()}
            placeholder="Search Unsplash..."
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-yellow-500/50"
          />
        </div>
      </div>

      {/* Search Results */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 text-yellow-400 animate-spin" />
          </div>
        ) : photos.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {photos.map((photo) => (
              <button
                key={photo.id}
                onClick={() => addImageToCanvas(photo.urls.regular, photo)}
                className="aspect-square rounded-lg overflow-hidden bg-gray-800 hover:ring-2 hover:ring-yellow-500 transition-all"
              >
                <img
                  src={photo.urls.small}
                  alt={photo.alt_description || 'Unsplash photo'}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        ) : searchQuery ? (
          <div className="text-center text-gray-500 text-sm py-8">
            No results found. Try a different search term.
          </div>
        ) : (
          <div className="text-center py-8">
            <ImageIcon className="w-12 h-12 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              Search Unsplash for free images
            </p>
            <p className="text-gray-600 text-xs mt-1">
              or upload your own
            </p>
          </div>
        )}
      </div>

      {/* Unsplash Attribution */}
      {photos.length > 0 && (
        <div className="p-3 border-t border-white/10 text-center">
          <a
            href="https://unsplash.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-500 hover:text-gray-400"
          >
            Photos by Unsplash
          </a>
        </div>
      )}
    </div>
  )
}
