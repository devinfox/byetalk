'use client'

import { useEffect, useRef, useCallback } from 'react'
import { usePresentation } from '@/lib/presentation-context'
import type { FabricCanvasJSON, FabricObject } from '@/types/presentation.types'

export function CanvasEditor() {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<any>(null)

  const {
    presentation,
    slides,
    currentSlideIndex,
    zoom,
    activeTool,
    setCanvas,
    selectObjects,
    clearSelection,
    setIsDirty,
    updateSlide,
    selectedObjectIds,
  } = usePresentation()

  const currentSlide = slides[currentSlideIndex]

  // Initialize Fabric.js canvas
  useEffect(() => {
    if (!canvasRef.current || !presentation) return

    let isMounted = true

    async function initCanvas() {
      const fabric = await import('fabric')

      if (!isMounted || !canvasRef.current || !presentation) return

      // Create canvas
      const canvas = new fabric.Canvas(canvasRef.current, {
        width: presentation.canvas_width,
        height: presentation.canvas_height,
        backgroundColor: currentSlide?.background_color || '#FFFFFF',
        selection: true,
        preserveObjectStacking: true,
      })

      fabricRef.current = canvas
      setCanvas(canvas as any)

      // Event listeners
      canvas.on('selection:created', (e) => {
        const selected = e.selected || []
        const ids = selected.map((obj: any) => obj.id).filter(Boolean)
        selectObjects(ids)
      })

      canvas.on('selection:updated', (e) => {
        const selected = e.selected || []
        const ids = selected.map((obj: any) => obj.id).filter(Boolean)
        selectObjects(ids)
      })

      canvas.on('selection:cleared', () => {
        clearSelection()
      })

      canvas.on('object:modified', () => {
        setIsDirty(true)
        saveCanvasToSlide()
      })

      canvas.on('object:added', () => {
        setIsDirty(true)
      })

      canvas.on('object:removed', () => {
        setIsDirty(true)
        saveCanvasToSlide()
      })

      // Handle text editing events
      canvas.on('text:changed', () => {
        setIsDirty(true)
      })

      canvas.on('text:editing:exited', () => {
        setIsDirty(true)
        saveCanvasToSlide()
      })

      // Load current slide content
      if (currentSlide?.canvas_json) {
        await canvas.loadFromJSON(currentSlide.canvas_json)
        canvas.renderAll()
      }
    }

    initCanvas()

    return () => {
      isMounted = false
      if (fabricRef.current) {
        fabricRef.current.dispose()
        fabricRef.current = null
      }
    }
  }, [presentation?.id]) // Only reinit on presentation change

  // Update canvas when slide changes
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || !currentSlide) return

    canvas.loadFromJSON(currentSlide.canvas_json).then(() => {
      canvas.backgroundColor = currentSlide.background_color || '#FFFFFF'
      canvas.renderAll()
    })
  }, [currentSlideIndex, currentSlide?.id])

  // Update zoom
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    canvas.setZoom(zoom)
    canvas.setWidth(presentation?.canvas_width! * zoom)
    canvas.setHeight(presentation?.canvas_height! * zoom)
    canvas.renderAll()
  }, [zoom, presentation?.canvas_width, presentation?.canvas_height])

  // Save canvas to slide
  const saveCanvasToSlide = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas || !currentSlide) return

    const json = canvas.toJSON(['id', 'name', 'locked', 'assetId', 'unsplashId']) as FabricCanvasJSON
    updateSlide(currentSlide.id, { canvas_json: json })
  }, [currentSlide, updateSlide])

  // Handle tool changes
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    switch (activeTool) {
      case 'select':
        canvas.isDrawingMode = false
        canvas.selection = true
        canvas.defaultCursor = 'default'
        break
      case 'draw':
        canvas.isDrawingMode = true
        canvas.freeDrawingBrush.color = '#000000'
        canvas.freeDrawingBrush.width = 3
        break
      default:
        canvas.isDrawingMode = false
        canvas.selection = true
    }
  }, [activeTool])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const canvas = fabricRef.current
      if (!canvas) return

      // Don't handle if typing in input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      // Check if we're currently editing text in Fabric.js
      const activeObject = canvas.getActiveObject()
      const isEditingText = activeObject &&
        (activeObject.type === 'textbox' || activeObject.type === 'i-text' || activeObject.type === 'text') &&
        (activeObject as any).isEditing

      // Don't intercept keys when editing text
      if (isEditingText) {
        return
      }

      // Delete selected objects
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeObjects = canvas.getActiveObjects()
        if (activeObjects.length > 0) {
          e.preventDefault()
          activeObjects.forEach((obj: any) => canvas.remove(obj))
          canvas.discardActiveObject()
          canvas.renderAll()
          saveCanvasToSlide()
        }
      }

      // Copy
      if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
        if (activeObject) {
          try {
            const cloned = await activeObject.clone()
            window._fabricClipboard = cloned
          } catch (err) {
            console.error('Clone error:', err)
          }
        }
      }

      // Paste
      if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
        if (window._fabricClipboard) {
          try {
            const clonedObj = await window._fabricClipboard.clone()
            canvas.discardActiveObject()
            clonedObj.set({
              left: (clonedObj.left || 0) + 20,
              top: (clonedObj.top || 0) + 20,
              id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            })

            if (clonedObj.type === 'activeSelection') {
              clonedObj.canvas = canvas
              clonedObj.forEachObject((obj: any) => {
                obj.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
                canvas.add(obj)
              })
              clonedObj.setCoords()
            } else {
              canvas.add(clonedObj)
            }

            window._fabricClipboard.top = (window._fabricClipboard.top || 0) + 20
            window._fabricClipboard.left = (window._fabricClipboard.left || 0) + 20
            canvas.setActiveObject(clonedObj)
            canvas.requestRenderAll()
            saveCanvasToSlide()
          } catch (err) {
            console.error('Paste error:', err)
          }
        }
      }

      // Select all
      if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        const { ActiveSelection } = await import('fabric')
        const allObjects = canvas.getObjects()
        if (allObjects.length > 0) {
          const selection = new ActiveSelection(allObjects, { canvas })
          canvas.setActiveObject(selection)
          canvas.requestRenderAll()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [saveCanvasToSlide])

  if (!presentation) return null

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center overflow-auto p-4"
    >
      <div
        className="relative shadow-2xl flex-shrink-0"
        style={{
          width: presentation.canvas_width * zoom,
          height: presentation.canvas_height * zoom,
        }}
      >
        <canvas ref={canvasRef} />
      </div>
    </div>
  )
}

// Extend window for clipboard
declare global {
  interface Window {
    _fabricClipboard: any
  }
}
