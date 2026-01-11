'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePresentation } from '@/lib/presentation-context'
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  GripVertical,
  Type,
  Square,
  Circle,
  Triangle,
  Image,
  Minus,
  Shapes,
} from 'lucide-react'
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
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface LayerItem {
  id: string
  name: string
  type: string
  visible: boolean
  locked: boolean
  object: any
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  textbox: <Type className="w-4 h-4" />,
  text: <Type className="w-4 h-4" />,
  rect: <Square className="w-4 h-4" />,
  circle: <Circle className="w-4 h-4" />,
  triangle: <Triangle className="w-4 h-4" />,
  image: <Image className="w-4 h-4" />,
  line: <Minus className="w-4 h-4" />,
  path: <Shapes className="w-4 h-4" />,
  group: <Shapes className="w-4 h-4" />,
}

function SortableLayer({
  layer,
  isSelected,
  onSelect,
  onToggleVisibility,
  onToggleLock,
}: {
  layer: LayerItem
  isSelected: boolean
  onSelect: () => void
  onToggleVisibility: () => void
  onToggleLock: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: layer.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer group ${
        isSelected ? 'bg-yellow-500/20' : 'hover:bg-white/5'
      } ${!layer.visible ? 'opacity-50' : ''}`}
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

      {/* Type Icon */}
      <span className="text-gray-400">
        {TYPE_ICONS[layer.type] || <Shapes className="w-4 h-4" />}
      </span>

      {/* Name */}
      <span className="flex-1 text-sm text-white truncate">
        {layer.name || `${layer.type}`}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleVisibility()
          }}
          className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white"
        >
          {layer.visible ? (
            <Eye className="w-3.5 h-3.5" />
          ) : (
            <EyeOff className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleLock()
          }}
          className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white"
        >
          {layer.locked ? (
            <Lock className="w-3.5 h-3.5" />
          ) : (
            <Unlock className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  )
}

export function LayersPanel() {
  const { getCanvas, selectedObjectIds, setIsDirty, canvasReady } = usePresentation()
  const [layers, setLayers] = useState<LayerItem[]>([])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Build layers list from canvas
  useEffect(() => {
    const canvas = getCanvas()
    if (!canvas || !canvasReady) return

    const updateLayers = () => {
      const objects = canvas.getObjects()
      const layerItems: LayerItem[] = objects
        .map((obj: any) => ({
          id: obj.id || `obj-${Math.random().toString(36).substr(2, 9)}`,
          name: obj.name || obj.text?.substring(0, 20) || obj.type,
          type: obj.type,
          visible: obj.visible !== false,
          locked: obj.selectable === false,
          object: obj,
        }))
        .reverse() // Reverse so top layer is first (higher z-index at top)

      setLayers(layerItems)
    }

    updateLayers()
    canvas.on('object:added', updateLayers)
    canvas.on('object:removed', updateLayers)
    canvas.on('object:modified', updateLayers)
    canvas.on('selection:created', updateLayers)
    canvas.on('selection:updated', updateLayers)
    canvas.on('selection:cleared', updateLayers)

    return () => {
      canvas.off('object:added', updateLayers)
      canvas.off('object:removed', updateLayers)
      canvas.off('object:modified', updateLayers)
      canvas.off('selection:created', updateLayers)
      canvas.off('selection:updated', updateLayers)
      canvas.off('selection:cleared', updateLayers)
    }
  }, [getCanvas, canvasReady])

  const handleSelect = useCallback(
    (layer: LayerItem) => {
      const canvas = getCanvas()
      if (!canvas || layer.locked) return

      canvas.setActiveObject(layer.object)
      canvas.renderAll()
    },
    [getCanvas]
  )

  const handleToggleVisibility = useCallback(
    (layer: LayerItem) => {
      const canvas = getCanvas()
      if (!canvas) return

      layer.object.set('visible', !layer.visible)
      canvas.renderAll()
      setIsDirty(true)

      setLayers((prev) =>
        prev.map((l) =>
          l.id === layer.id ? { ...l, visible: !layer.visible } : l
        )
      )
    },
    [getCanvas, setIsDirty]
  )

  const handleToggleLock = useCallback(
    (layer: LayerItem) => {
      const canvas = getCanvas()
      if (!canvas) return

      const newLocked = !layer.locked
      layer.object.set({
        selectable: !newLocked,
        evented: !newLocked,
      })

      if (newLocked) {
        canvas.discardActiveObject()
      }

      canvas.renderAll()
      setIsDirty(true)

      setLayers((prev) =>
        prev.map((l) => (l.id === layer.id ? { ...l, locked: newLocked } : l))
      )
    },
    [getCanvas, setIsDirty]
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const canvas = getCanvas()
      if (!canvas) return

      const oldIndex = layers.findIndex((l) => l.id === active.id)
      const newIndex = layers.findIndex((l) => l.id === over.id)

      if (oldIndex === -1 || newIndex === -1) return

      // Reorder layers array (UI order - top layer first)
      const newLayers = [...layers]
      const [moved] = newLayers.splice(oldIndex, 1)
      newLayers.splice(newIndex, 0, moved)
      setLayers(newLayers)

      // Update canvas z-order
      // Canvas order: index 0 = bottom, higher index = top (in front)
      // UI order: index 0 = top layer, higher index = bottom layer
      // So we need to reverse the UI order to get canvas order
      const movedLayer = layers[oldIndex]

      if (oldIndex < newIndex) {
        // Moved down in UI = moved backward in z-order (behind other objects)
        // Need to send backward
        for (let i = oldIndex; i < newIndex; i++) {
          canvas.sendObjectBackwards(movedLayer.object)
        }
      } else {
        // Moved up in UI = moved forward in z-order (in front of other objects)
        // Need to bring forward
        for (let i = newIndex; i < oldIndex; i++) {
          canvas.bringObjectForward(movedLayer.object)
        }
      }

      canvas.renderAll()
      setIsDirty(true)
    },
    [getCanvas, layers, setIsDirty]
  )

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-white/10">
        <h3 className="text-sm font-medium text-white">Layers</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {layers.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            No elements on this slide
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={layers.map((l) => l.id)}
              strategy={verticalListSortingStrategy}
            >
              {layers.map((layer) => (
                <SortableLayer
                  key={layer.id}
                  layer={layer}
                  isSelected={selectedObjectIds.includes(layer.id)}
                  onSelect={() => handleSelect(layer)}
                  onToggleVisibility={() => handleToggleVisibility(layer)}
                  onToggleLock={() => handleToggleLock(layer)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  )
}
