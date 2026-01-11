'use client'

import { useCallback } from 'react'
import { usePresentation } from '@/lib/presentation-context'
import {
  MousePointer2,
  Type,
  Square,
  Circle,
  Triangle,
  Minus,
  ArrowRight,
  Pencil,
  Image,
  Layers,
  Shapes,
  ImagePlus,
} from 'lucide-react'
import type { ToolType, PanelType } from '@/types/presentation.types'
import {
  DEFAULT_TEXT_OPTIONS,
  DEFAULT_RECT_OPTIONS,
  DEFAULT_CIRCLE_OPTIONS,
  DEFAULT_TRIANGLE_OPTIONS,
  DEFAULT_LINE_OPTIONS,
} from '@/types/presentation.types'

const TOOLS: { type: ToolType; icon: React.ReactNode; label: string }[] = [
  { type: 'select', icon: <MousePointer2 className="w-4 h-4" />, label: 'Select' },
  { type: 'text', icon: <Type className="w-4 h-4" />, label: 'Text' },
  { type: 'rect', icon: <Square className="w-4 h-4" />, label: 'Rectangle' },
  { type: 'circle', icon: <Circle className="w-4 h-4" />, label: 'Circle' },
  { type: 'triangle', icon: <Triangle className="w-4 h-4" />, label: 'Triangle' },
  { type: 'line', icon: <Minus className="w-4 h-4" />, label: 'Line' },
  { type: 'arrow', icon: <ArrowRight className="w-4 h-4" />, label: 'Arrow' },
  { type: 'draw', icon: <Pencil className="w-4 h-4" />, label: 'Draw' },
  { type: 'image', icon: <Image className="w-4 h-4" />, label: 'Image' },
]

const PANELS: { type: PanelType; icon: React.ReactNode; label: string }[] = [
  { type: 'elements', icon: <Shapes className="w-4 h-4" />, label: 'Elements' },
  { type: 'assets', icon: <ImagePlus className="w-4 h-4" />, label: 'Assets' },
  { type: 'layers', icon: <Layers className="w-4 h-4" />, label: 'Layers' },
]

export function ElementToolbar() {
  const {
    activeTool,
    setActiveTool,
    activePanel,
    setActivePanel,
    getCanvas,
    generateId,
    setIsDirty,
  } = usePresentation()

  const addElement = useCallback(
    async (type: ToolType) => {
      const canvas = getCanvas()
      if (!canvas) {
        console.error('Canvas not available')
        return
      }

      const fabric = await import('fabric')
      const id = generateId()

      // Account for zoom when calculating center
      const zoom = canvas.getZoom()
      const centerX = (canvas.width! / zoom) / 2
      const centerY = (canvas.height! / zoom) / 2

      console.log('Adding element:', type, 'at center:', centerX, centerY)

      let object: any = null

      switch (type) {
        case 'text':
          object = new fabric.Textbox('Enter text', {
            left: centerX - 150,
            top: centerY - 20,
            width: 300,
            fontSize: 32,
            fontFamily: 'Inter',
            fill: '#000000',
            textAlign: 'left',
            id,
          } as any)
          break

        case 'rect':
          object = new fabric.Rect({
            ...DEFAULT_RECT_OPTIONS,
            left: centerX - 100,
            top: centerY - 75,
            id,
          } as any)
          break

        case 'circle':
          object = new fabric.Circle({
            ...DEFAULT_CIRCLE_OPTIONS,
            left: centerX - 75,
            top: centerY - 75,
            id,
          } as any)
          break

        case 'triangle':
          object = new fabric.Triangle({
            ...DEFAULT_TRIANGLE_OPTIONS,
            left: centerX - 75,
            top: centerY - 65,
            id,
          } as any)
          break

        case 'line':
          object = new fabric.Line([0, 0, 200, 0], {
            ...DEFAULT_LINE_OPTIONS,
            left: centerX - 100,
            top: centerY,
            id,
          } as any)
          break

        case 'arrow':
          // Create arrow as a path
          const arrowPath = 'M 0 10 L 180 10 L 180 0 L 200 15 L 180 30 L 180 20 L 0 20 Z'
          object = new fabric.Path(arrowPath, {
            left: centerX - 100,
            top: centerY - 15,
            fill: '#000000',
            stroke: null,
            id,
          } as any)
          break

        case 'image':
          setActivePanel('assets')
          setActiveTool('select')
          return
      }

      if (object) {
        console.log('Adding object to canvas:', object.type)
        canvas.add(object)
        canvas.setActiveObject(object)
        canvas.renderAll()
        setIsDirty(true)
        setActiveTool('select')

        // If it's a text element, enter editing mode
        if (type === 'text' && object.enterEditing) {
          setTimeout(() => {
            object.enterEditing()
            object.selectAll()
            canvas.renderAll()
          }, 100)
        }
      }
    },
    [getCanvas, generateId, setIsDirty, setActiveTool, setActivePanel]
  )

  const handleToolClick = (tool: ToolType) => {
    if (tool === 'select' || tool === 'draw') {
      setActiveTool(tool)
    } else {
      addElement(tool)
    }
  }

  return (
    <div className="h-12 border-b border-white/10 bg-gray-900/50 flex items-center px-4 gap-1">
      {/* Tools */}
      <div className="flex items-center gap-1">
        {TOOLS.map((tool) => (
          <button
            key={tool.type}
            onClick={() => handleToolClick(tool.type)}
            className={`p-2 rounded-lg transition-colors ${
              activeTool === tool.type
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`}
            title={tool.label}
          >
            {tool.icon}
          </button>
        ))}
      </div>

      <div className="w-px h-6 bg-white/10 mx-3" />

      {/* Panel Toggles */}
      <div className="flex items-center gap-1">
        {PANELS.map((panel) => (
          <button
            key={panel.type}
            onClick={() => setActivePanel(panel.type)}
            className={`p-2 rounded-lg transition-colors ${
              activePanel === panel.type || (activePanel === null && panel.type === 'elements')
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`}
            title={panel.label}
          >
            {panel.icon}
          </button>
        ))}
      </div>
    </div>
  )
}
