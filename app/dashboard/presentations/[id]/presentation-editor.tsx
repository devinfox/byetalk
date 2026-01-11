'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Save,
  Download,
  Settings,
  Play,
  Loader2,
  Undo,
  Redo,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { PresentationProvider, usePresentation } from '@/lib/presentation-context'
import { SlideSidebar } from '@/components/presentation-builder/slide-sidebar'
import { CanvasEditor } from '@/components/presentation-builder/canvas-editor'
import { ElementToolbar } from '@/components/presentation-builder/element-toolbar'
import { FormattingToolbar } from '@/components/presentation-builder/formatting-toolbar'
import { PropertiesPanel } from '@/components/presentation-builder/properties-panel'
import { ExportModal } from '@/components/presentation-builder/modals/export-modal'
import type { Presentation, Slide } from '@/types/presentation.types'

interface PresentationEditorProps {
  presentationId: string
  userId: string
}

function PresentationEditorContent({
  presentationId,
  userId,
}: PresentationEditorProps) {
  const router = useRouter()
  const {
    presentation,
    setPresentation,
    slides,
    setSlides,
    isDirty,
    isSaving,
    isLoading,
    setIsSaving,
    setIsLoading,
    setIsDirty,
    zoom,
    setZoom,
    undo,
    redo,
    canUndo,
    canRedo,
    saveCurrentSlide,
  } = usePresentation()

  const [showExportModal, setShowExportModal] = useState(false)
  const [nameEditing, setNameEditing] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Load presentation data
  useEffect(() => {
    async function loadPresentation() {
      setIsLoading(true)
      try {
        const response = await fetch(`/api/presentations/${presentationId}`)
        if (response.ok) {
          const data = await response.json()
          setPresentation(data.presentation)
          setSlides(data.slides || [])
          setNameValue(data.presentation.name)
        } else {
          router.push('/dashboard/presentations')
        }
      } catch (error) {
        console.error('Error loading presentation:', error)
        router.push('/dashboard/presentations')
      }
      setIsLoading(false)
    }

    loadPresentation()
  }, [presentationId, setPresentation, setSlides, setIsLoading, router])

  // Auto-save with debounce
  const savePresentation = useCallback(async () => {
    if (!presentation || !isDirty) return

    setIsSaving(true)
    try {
      // Save current slide first
      saveCurrentSlide()

      // Save presentation metadata
      await fetch(`/api/presentations/${presentationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: presentation.name,
        }),
      })

      // Save all slides
      for (const slide of slides) {
        await fetch(`/api/presentations/${presentationId}/slides`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slide_id: slide.id,
            canvas_json: slide.canvas_json,
            name: slide.name,
            background_color: slide.background_color,
          }),
        })
      }

      setIsDirty(false)
    } catch (error) {
      console.error('Error saving presentation:', error)
    }
    setIsSaving(false)
  }, [
    presentation,
    slides,
    isDirty,
    presentationId,
    saveCurrentSlide,
    setIsSaving,
    setIsDirty,
  ])

  // Auto-save on changes
  useEffect(() => {
    if (isDirty) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      saveTimeoutRef.current = setTimeout(() => {
        savePresentation()
      }, 2000) // Auto-save after 2 seconds of inactivity
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [isDirty, savePresentation])

  const handleNameSave = async () => {
    if (!presentation) return

    try {
      await fetch(`/api/presentations/${presentationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameValue }),
      })
      setPresentation({ ...presentation, name: nameValue })
    } catch (error) {
      console.error('Error updating name:', error)
    }
    setNameEditing(false)
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-yellow-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading presentation...</p>
        </div>
      </div>
    )
  }

  if (!presentation) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-gray-950 overflow-hidden">
      {/* Top Header Bar */}
      <header className="h-14 border-b border-white/10 flex items-center justify-between px-4 bg-gray-900/50 backdrop-blur-sm shrink-0">
        {/* Left - Back & Name */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard/presentations')}
            className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {nameEditing ? (
            <input
              type="text"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={handleNameSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNameSave()
                if (e.key === 'Escape') setNameEditing(false)
              }}
              className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white focus:outline-none focus:ring-1 focus:ring-yellow-500"
              autoFocus
            />
          ) : (
            <h1
              className="text-white font-medium cursor-pointer hover:text-yellow-400 transition-colors"
              onClick={() => {
                setNameValue(presentation.name)
                setNameEditing(true)
              }}
            >
              {presentation.name}
            </h1>
          )}

          {/* Save Status */}
          <div className="flex items-center gap-2 text-sm">
            {isSaving ? (
              <span className="text-gray-400 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Saving...
              </span>
            ) : isDirty ? (
              <span className="text-yellow-400">Unsaved changes</span>
            ) : (
              <span className="text-gray-500">Saved</span>
            )}
          </div>
        </div>

        {/* Center - Undo/Redo & Zoom */}
        <div className="flex items-center gap-2">
          <button
            onClick={undo}
            disabled={!canUndo()}
            className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Undo"
          >
            <Undo className="w-4 h-4" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo()}
            className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Redo"
          >
            <Redo className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-white/10 mx-2" />

          <button
            onClick={() => setZoom(Math.max(0.25, zoom - 0.1))}
            className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-400 w-14 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom(Math.min(2, zoom + 0.1))}
            className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        {/* Right - Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => savePresentation()}
            disabled={isSaving || !isDirty}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            Save
          </button>

          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>

          <button
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-black font-medium"
            style={{
              background:
                'linear-gradient(135deg, #ffd700 0%, #ffec8b 20%, #daa520 50%, #b8860b 80%, #cd853f 100%)',
            }}
          >
            <Play className="w-4 h-4" />
            Present
          </button>
        </div>
      </header>

      {/* Element Toolbar */}
      <div className="shrink-0">
        <ElementToolbar />
      </div>

      {/* Formatting Toolbar - Context-sensitive based on selection */}
      <div className="shrink-0">
        <FormattingToolbar />
      </div>

      {/* Main Content - 3 Panel Layout */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left - Slide Sidebar */}
        <SlideSidebar />

        {/* Center - Canvas */}
        <div className="flex-1 overflow-hidden bg-gray-900/30">
          <CanvasEditor />
        </div>

        {/* Right - Properties Panel */}
        <PropertiesPanel />
      </div>

      {/* Modals */}
      {showExportModal && (
        <ExportModal onClose={() => setShowExportModal(false)} />
      )}
    </div>
  )
}

export function PresentationEditor(props: PresentationEditorProps) {
  return (
    <PresentationProvider>
      <PresentationEditorContent {...props} />
    </PresentationProvider>
  )
}
