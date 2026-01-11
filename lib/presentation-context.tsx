'use client'

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
  useEffect,
} from 'react'
import type { Canvas as FabricCanvas, FabricObject as FabricObjectType } from 'fabric'
import type {
  Presentation,
  Slide,
  FabricCanvasJSON,
  FabricObject,
  ToolType,
  PanelType,
  HistoryEntry,
} from '@/types/presentation.types'

// ============================================================================
// CONTEXT STATE TYPES
// ============================================================================

interface PresentationState {
  // Presentation data
  presentation: Presentation | null
  slides: Slide[]
  currentSlideIndex: number

  // Canvas state
  selectedObjectIds: string[]
  clipboard: FabricObject[] | null
  zoom: number
  canvasReady: boolean // Flag to indicate canvas is initialized

  // UI state
  activeTool: ToolType
  activePanel: PanelType | null

  // Status flags
  isDirty: boolean
  isSaving: boolean
  isLoading: boolean
}

interface PresentationActions {
  // Presentation actions
  setPresentation: (presentation: Presentation | null) => void
  updatePresentation: (updates: Partial<Presentation>) => void

  // Slide actions
  setSlides: (slides: Slide[]) => void
  addSlide: (slide?: Partial<Slide>) => void
  updateSlide: (slideId: string, updates: Partial<Slide>) => void
  deleteSlide: (slideId: string) => void
  duplicateSlide: (slideId: string) => void
  reorderSlides: (fromIndex: number, toIndex: number) => void
  setCurrentSlideIndex: (index: number) => void
  getCurrentSlide: () => Slide | null

  // Canvas actions
  setCanvas: (canvas: FabricCanvas | null) => void
  getCanvas: () => FabricCanvas | null
  saveCurrentSlide: () => void
  loadSlideToCanvas: (slideId: string) => void

  // Object actions
  addObject: (object: FabricObject) => void
  updateObject: (objectId: string, updates: Partial<FabricObject>) => void
  deleteSelectedObjects: () => void
  copySelectedObjects: () => void
  pasteObjects: () => void
  selectObjects: (objectIds: string[]) => void
  clearSelection: () => void

  // Layer actions
  bringForward: () => void
  sendBackward: () => void
  bringToFront: () => void
  sendToBack: () => void

  // History actions
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean

  // UI actions
  setActiveTool: (tool: ToolType) => void
  setActivePanel: (panel: PanelType | null) => void
  setZoom: (zoom: number) => void

  // Status actions
  setIsDirty: (isDirty: boolean) => void
  setIsSaving: (isSaving: boolean) => void
  setIsLoading: (isLoading: boolean) => void

  // Utility
  generateId: () => string
  reset: () => void
}

type PresentationContextType = PresentationState & PresentationActions

// ============================================================================
// DEFAULT VALUES
// ============================================================================

const defaultState: PresentationState = {
  presentation: null,
  slides: [],
  currentSlideIndex: 0,
  selectedObjectIds: [],
  clipboard: null,
  zoom: 1,
  canvasReady: false,
  activeTool: 'select',
  activePanel: 'elements',
  isDirty: false,
  isSaving: false,
  isLoading: false,
}

const defaultCanvasJSON: FabricCanvasJSON = {
  version: '6.0.0',
  objects: [],
}

// ============================================================================
// CONTEXT
// ============================================================================

const PresentationContext = createContext<PresentationContextType | null>(null)

// ============================================================================
// PROVIDER
// ============================================================================

export function PresentationProvider({ children }: { children: ReactNode }) {
  // State
  const [presentation, setPresentation] = useState<Presentation | null>(null)
  const [slides, setSlidesState] = useState<Slide[]>([])
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0)
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([])
  const [clipboard, setClipboard] = useState<FabricObject[] | null>(null)
  const [zoom, setZoomState] = useState(1)
  const [canvasReady, setCanvasReady] = useState(false)
  const [activeTool, setActiveToolState] = useState<ToolType>('select')
  const [activePanel, setActivePanelState] = useState<PanelType | null>('elements')
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Refs
  const canvasRef = useRef<FabricCanvas | null>(null)
  const historyRef = useRef<HistoryEntry[]>([])
  const historyIndexRef = useRef(-1)
  const maxHistorySize = 50

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  const generateId = useCallback(() => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }, [])

  // ============================================================================
  // PRESENTATION ACTIONS
  // ============================================================================

  const updatePresentation = useCallback((updates: Partial<Presentation>) => {
    setPresentation((prev) => (prev ? { ...prev, ...updates } : null))
    setIsDirty(true)
  }, [])

  // ============================================================================
  // SLIDE ACTIONS
  // ============================================================================

  const setSlides = useCallback((newSlides: Slide[]) => {
    setSlidesState(newSlides)
  }, [])

  const addSlide = useCallback(
    (slideData?: Partial<Slide>) => {
      const newSlide: Slide = {
        id: generateId(),
        presentation_id: presentation?.id || '',
        slide_order: slides.length,
        name: slideData?.name || `Slide ${slides.length + 1}`,
        background_color: slideData?.background_color || '#FFFFFF',
        background_image_url: slideData?.background_image_url || null,
        canvas_json: slideData?.canvas_json || defaultCanvasJSON,
        thumbnail_url: null,
        notes: slideData?.notes || null,
        transition_type: slideData?.transition_type || 'none',
        transition_duration: slideData?.transition_duration || 500,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      setSlidesState((prev) => [...prev, newSlide])
      setCurrentSlideIndex(slides.length)
      setIsDirty(true)
    },
    [generateId, presentation?.id, slides.length]
  )

  const updateSlide = useCallback((slideId: string, updates: Partial<Slide>) => {
    setSlidesState((prev) =>
      prev.map((slide) =>
        slide.id === slideId
          ? { ...slide, ...updates, updated_at: new Date().toISOString() }
          : slide
      )
    )
    setIsDirty(true)
  }, [])

  const deleteSlide = useCallback(
    (slideId: string) => {
      setSlidesState((prev) => {
        const filtered = prev.filter((slide) => slide.id !== slideId)
        // Reorder remaining slides
        return filtered.map((slide, index) => ({
          ...slide,
          slide_order: index,
        }))
      })

      // Adjust current index if needed
      setCurrentSlideIndex((prev) => {
        const newSlideCount = slides.length - 1
        if (prev >= newSlideCount) {
          return Math.max(0, newSlideCount - 1)
        }
        return prev
      })

      setIsDirty(true)
    },
    [slides.length]
  )

  const duplicateSlide = useCallback(
    (slideId: string) => {
      const slideIndex = slides.findIndex((s) => s.id === slideId)
      if (slideIndex === -1) return

      const originalSlide = slides[slideIndex]
      const newSlide: Slide = {
        ...originalSlide,
        id: generateId(),
        name: `${originalSlide.name} (Copy)`,
        slide_order: slideIndex + 1,
        thumbnail_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      setSlidesState((prev) => {
        const newSlides = [...prev]
        newSlides.splice(slideIndex + 1, 0, newSlide)
        // Reorder slides after the duplicate
        return newSlides.map((slide, index) => ({
          ...slide,
          slide_order: index,
        }))
      })

      setCurrentSlideIndex(slideIndex + 1)
      setIsDirty(true)
    },
    [slides, generateId]
  )

  const reorderSlides = useCallback((fromIndex: number, toIndex: number) => {
    setSlidesState((prev) => {
      const newSlides = [...prev]
      const [movedSlide] = newSlides.splice(fromIndex, 1)
      newSlides.splice(toIndex, 0, movedSlide)
      // Update slide_order
      return newSlides.map((slide, index) => ({
        ...slide,
        slide_order: index,
      }))
    })
    setCurrentSlideIndex(toIndex)
    setIsDirty(true)
  }, [])

  const getCurrentSlide = useCallback(() => {
    return slides[currentSlideIndex] || null
  }, [slides, currentSlideIndex])

  // ============================================================================
  // CANVAS ACTIONS
  // ============================================================================

  const setCanvas = useCallback((canvas: FabricCanvas | null) => {
    canvasRef.current = canvas
    setCanvasReady(canvas !== null)
  }, [])

  const getCanvas = useCallback(() => {
    return canvasRef.current
  }, [])

  const saveCurrentSlide = useCallback(() => {
    const canvas = canvasRef.current
    const currentSlide = slides[currentSlideIndex]
    if (!canvas || !currentSlide) return

    const canvasJson = (canvas as any).toJSON([
      'id',
      'name',
      'locked',
      'assetId',
      'unsplashId',
    ]) as FabricCanvasJSON

    updateSlide(currentSlide.id, { canvas_json: canvasJson })
  }, [slides, currentSlideIndex, updateSlide])

  const loadSlideToCanvas = useCallback(
    (slideId: string) => {
      const canvas = canvasRef.current
      const slide = slides.find((s) => s.id === slideId)
      if (!canvas || !slide) return

      canvas.loadFromJSON(slide.canvas_json).then(() => {
        canvas.renderAll()
      })
    },
    [slides]
  )

  // ============================================================================
  // OBJECT ACTIONS
  // ============================================================================

  const addObject = useCallback(
    (objectData: FabricObject) => {
      const canvas = canvasRef.current
      if (!canvas) return

      // Add unique ID if not present
      if (!objectData.id) {
        objectData.id = generateId()
      }

      // The actual Fabric.js object creation will be handled by the canvas component
      // This context action just triggers the update
      setIsDirty(true)
    },
    [generateId]
  )

  const updateObject = useCallback(
    (objectId: string, updates: Partial<FabricObject>) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const objects = canvas.getObjects() as FabricObjectType[]
      const target = objects.find((obj) => (obj as any).id === objectId)

      if (target) {
        target.set(updates as any)
        canvas.renderAll()
        setIsDirty(true)
      }
    },
    []
  )

  const deleteSelectedObjects = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const activeObjects = canvas.getActiveObjects()
    if (activeObjects.length === 0) return

    activeObjects.forEach((obj) => {
      canvas.remove(obj)
    })

    canvas.discardActiveObject()
    canvas.renderAll()
    setSelectedObjectIds([])
    setIsDirty(true)
  }, [])

  const copySelectedObjects = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const activeObjects = canvas.getActiveObjects()
    if (activeObjects.length === 0) return

    const copiedObjects = activeObjects.map((obj) => (obj as any).toJSON(['id', 'name', 'locked']))
    setClipboard(copiedObjects as FabricObject[])
  }, [])

  const pasteObjects = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !clipboard || clipboard.length === 0) return

    // Pasting will be handled by the canvas component
    // This just provides access to clipboard data
    setIsDirty(true)
  }, [clipboard])

  const selectObjects = useCallback((objectIds: string[]) => {
    setSelectedObjectIds(objectIds)
  }, [])

  const clearSelection = useCallback(() => {
    const canvas = canvasRef.current
    if (canvas) {
      canvas.discardActiveObject()
      canvas.renderAll()
    }
    setSelectedObjectIds([])
  }, [])

  // ============================================================================
  // LAYER ACTIONS
  // ============================================================================

  const bringForward = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const activeObject = canvas.getActiveObject()
    if (activeObject) {
      canvas.bringObjectForward(activeObject)
      canvas.renderAll()
      setIsDirty(true)
    }
  }, [])

  const sendBackward = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const activeObject = canvas.getActiveObject()
    if (activeObject) {
      canvas.sendObjectBackwards(activeObject)
      canvas.renderAll()
      setIsDirty(true)
    }
  }, [])

  const bringToFront = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const activeObject = canvas.getActiveObject()
    if (activeObject) {
      canvas.bringObjectToFront(activeObject)
      canvas.renderAll()
      setIsDirty(true)
    }
  }, [])

  const sendToBack = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const activeObject = canvas.getActiveObject()
    if (activeObject) {
      canvas.sendObjectToBack(activeObject)
      canvas.renderAll()
      setIsDirty(true)
    }
  }, [])

  // ============================================================================
  // HISTORY ACTIONS
  // ============================================================================

  const pushHistory = useCallback((entry: HistoryEntry) => {
    // Remove any redo history
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1)

    // Add new entry
    historyRef.current.push(entry)

    // Limit history size
    if (historyRef.current.length > maxHistorySize) {
      historyRef.current.shift()
    } else {
      historyIndexRef.current++
    }
  }, [])

  const undo = useCallback(() => {
    if (historyIndexRef.current < 0) return

    const entry = historyRef.current[historyIndexRef.current]
    historyIndexRef.current--

    // Apply the previous state
    const canvas = canvasRef.current
    if (canvas && entry) {
      canvas.loadFromJSON(entry.canvasJson).then(() => {
        canvas.renderAll()
      })
    }
  }, [])

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return

    historyIndexRef.current++
    const entry = historyRef.current[historyIndexRef.current]

    const canvas = canvasRef.current
    if (canvas && entry) {
      canvas.loadFromJSON(entry.canvasJson).then(() => {
        canvas.renderAll()
      })
    }
  }, [])

  const canUndo = useCallback(() => {
    return historyIndexRef.current >= 0
  }, [])

  const canRedo = useCallback(() => {
    return historyIndexRef.current < historyRef.current.length - 1
  }, [])

  // ============================================================================
  // UI ACTIONS
  // ============================================================================

  const setActiveTool = useCallback((tool: ToolType) => {
    setActiveToolState(tool)
  }, [])

  const setActivePanel = useCallback((panel: PanelType | null) => {
    setActivePanelState(panel)
  }, [])

  const setZoom = useCallback((newZoom: number) => {
    setZoomState(Math.max(0.1, Math.min(3, newZoom)))
  }, [])

  // ============================================================================
  // RESET
  // ============================================================================

  const reset = useCallback(() => {
    setPresentation(null)
    setSlidesState([])
    setCurrentSlideIndex(0)
    setSelectedObjectIds([])
    setClipboard(null)
    setZoomState(1)
    setCanvasReady(false)
    setActiveToolState('select')
    setActivePanelState('elements')
    setIsDirty(false)
    setIsSaving(false)
    setIsLoading(false)
    canvasRef.current = null
    historyRef.current = []
    historyIndexRef.current = -1
  }, [])

  // ============================================================================
  // CONTEXT VALUE
  // ============================================================================

  const value: PresentationContextType = {
    // State
    presentation,
    slides,
    currentSlideIndex,
    selectedObjectIds,
    clipboard,
    zoom,
    canvasReady,
    activeTool,
    activePanel,
    isDirty,
    isSaving,
    isLoading,

    // Presentation actions
    setPresentation,
    updatePresentation,

    // Slide actions
    setSlides,
    addSlide,
    updateSlide,
    deleteSlide,
    duplicateSlide,
    reorderSlides,
    setCurrentSlideIndex,
    getCurrentSlide,

    // Canvas actions
    setCanvas,
    getCanvas,
    saveCurrentSlide,
    loadSlideToCanvas,

    // Object actions
    addObject,
    updateObject,
    deleteSelectedObjects,
    copySelectedObjects,
    pasteObjects,
    selectObjects,
    clearSelection,

    // Layer actions
    bringForward,
    sendBackward,
    bringToFront,
    sendToBack,

    // History actions
    undo,
    redo,
    canUndo,
    canRedo,

    // UI actions
    setActiveTool,
    setActivePanel,
    setZoom,

    // Status actions
    setIsDirty,
    setIsSaving,
    setIsLoading,

    // Utility
    generateId,
    reset,
  }

  return (
    <PresentationContext.Provider value={value}>
      {children}
    </PresentationContext.Provider>
  )
}

// ============================================================================
// HOOK
// ============================================================================

export function usePresentation() {
  const context = useContext(PresentationContext)
  if (!context) {
    throw new Error('usePresentation must be used within a PresentationProvider')
  }
  return context
}
