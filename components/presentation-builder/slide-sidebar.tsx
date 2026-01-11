'use client'

import { useState } from 'react'
import { usePresentation } from '@/lib/presentation-context'
import {
  Plus,
  Copy,
  Trash2,
  MoreVertical,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Palette,
} from 'lucide-react'
import { COLOR_PRESETS, GRADIENT_PRESETS } from './utils/google-fonts'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Slide } from '@/types/presentation.types'

interface SortableSlideProps {
  slide: Slide
  index: number
  isActive: boolean
  onSelect: () => void
  onDuplicate: () => void
  onDelete: () => void
  onBackgroundChange: (color: string) => void
}

function SortableSlide({
  slide,
  index,
  isActive,
  onSelect,
  onDuplicate,
  onDelete,
  onBackgroundChange,
}: SortableSlideProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: slide.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group ${isDragging ? 'z-50' : ''}`}
    >
      <div
        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
          isActive
            ? 'bg-yellow-500/20 ring-1 ring-yellow-500/50'
            : 'hover:bg-white/5'
        }`}
        onClick={onSelect}
      >
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <GripVertical className="w-4 h-4 text-gray-500" />
        </div>

        {/* Slide Number */}
        <span className="text-xs text-gray-500 w-4 text-center">{index + 1}</span>

        {/* Thumbnail */}
        <div
          className="w-24 h-14 rounded border border-white/10 flex-shrink-0 overflow-hidden"
          style={{ backgroundColor: slide.background_color || '#FFFFFF' }}
        >
          {slide.thumbnail_url ? (
            <img
              src={slide.thumbnail_url}
              alt={slide.name || `Slide ${index + 1}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">
              {/* Simple preview placeholder */}
            </div>
          )}
        </div>

        {/* Menu */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowMenu(!showMenu)
            }}
            className="p-1 opacity-0 group-hover:opacity-100 hover:bg-white/10 rounded transition-all"
          >
            <MoreVertical className="w-4 h-4 text-gray-400" />
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => {
                  setShowMenu(false)
                  setShowColorPicker(false)
                }}
              />
              <div className="absolute right-0 top-full mt-1 w-48 bg-gray-900 border border-white/10 rounded-lg shadow-xl z-20 overflow-hidden">
                {/* Background Color */}
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowColorPicker(!showColorPicker)
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 flex items-center gap-2"
                  >
                    <Palette className="w-4 h-4" />
                    Background
                    <div
                      className="w-4 h-4 rounded border border-white/20 ml-auto"
                      style={{ backgroundColor: slide.background_color || '#FFFFFF' }}
                    />
                  </button>
                  {showColorPicker && (
                    <div className="p-2 border-t border-white/10">
                      <div className="grid grid-cols-5 gap-1 mb-2">
                        {['#FFFFFF', '#000000', '#f8f9fa', '#1a1a2e', '#16213e', '#0f3460', '#e94560', '#533483', '#f39c12', '#27ae60'].map((color) => (
                          <button
                            key={color}
                            onClick={(e) => {
                              e.stopPropagation()
                              onBackgroundChange(color)
                              setShowColorPicker(false)
                              setShowMenu(false)
                            }}
                            className="w-6 h-6 rounded border border-white/20 hover:scale-110 transition-transform"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                      <input
                        type="color"
                        value={slide.background_color || '#FFFFFF'}
                        onChange={(e) => {
                          e.stopPropagation()
                          onBackgroundChange(e.target.value)
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full h-6 rounded cursor-pointer"
                      />
                    </div>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDuplicate()
                    setShowMenu(false)
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 flex items-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  Duplicate
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete()
                    setShowMenu(false)
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2"
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
  )
}

export function SlideSidebar() {
  const {
    slides,
    currentSlideIndex,
    setCurrentSlideIndex,
    addSlide,
    duplicateSlide,
    deleteSlide,
    reorderSlides,
    saveCurrentSlide,
    updateSlide,
    getCanvas,
    setIsDirty,
  } = usePresentation()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = slides.findIndex((s) => s.id === active.id)
      const newIndex = slides.findIndex((s) => s.id === over.id)
      reorderSlides(oldIndex, newIndex)
    }
  }

  const handleSlideSelect = (index: number) => {
    if (index !== currentSlideIndex) {
      saveCurrentSlide()
      setCurrentSlideIndex(index)
    }
  }

  const handleAddSlide = () => {
    saveCurrentSlide()
    addSlide()
  }

  const handleDuplicate = (slideId: string) => {
    saveCurrentSlide()
    duplicateSlide(slideId)
  }

  const handleDelete = (slideId: string) => {
    if (slides.length <= 1) {
      alert('Cannot delete the last slide')
      return
    }
    if (confirm('Are you sure you want to delete this slide?')) {
      deleteSlide(slideId)
    }
  }

  const handleBackgroundChange = (slideId: string, color: string) => {
    updateSlide(slideId, { background_color: color })
    // Also update canvas background if it's the current slide
    const slideIndex = slides.findIndex(s => s.id === slideId)
    if (slideIndex === currentSlideIndex) {
      const canvas = getCanvas()
      if (canvas) {
        canvas.backgroundColor = color
        canvas.renderAll()
      }
    }
    setIsDirty(true)
  }

  return (
    <div className="w-48 border-r border-white/10 bg-gray-900/50 flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-white/10 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-400">Slides</span>
        <button
          onClick={handleAddSlide}
          className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
          title="Add Slide"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Slides List */}
      <div className="flex-1 overflow-y-auto p-2">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={slides.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            {slides.map((slide, index) => (
              <SortableSlide
                key={slide.id}
                slide={slide}
                index={index}
                isActive={index === currentSlideIndex}
                onSelect={() => handleSlideSelect(index)}
                onDuplicate={() => handleDuplicate(slide.id)}
                onDelete={() => handleDelete(slide.id)}
                onBackgroundChange={(color) => handleBackgroundChange(slide.id, color)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {/* Footer - Navigation */}
      <div className="p-3 border-t border-white/10 flex items-center justify-center gap-2">
        <button
          onClick={() => handleSlideSelect(Math.max(0, currentSlideIndex - 1))}
          disabled={currentSlideIndex === 0}
          className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <span className="text-sm text-gray-500">
          {currentSlideIndex + 1} / {slides.length}
        </span>
        <button
          onClick={() =>
            handleSlideSelect(Math.min(slides.length - 1, currentSlideIndex + 1))
          }
          disabled={currentSlideIndex === slides.length - 1}
          className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
