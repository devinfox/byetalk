'use client'

import { useCallback, useEffect } from 'react'
import { usePresentation } from '@/lib/presentation-context'
import {
  Type,
  Square,
  Circle,
  Triangle,
  Minus,
  ArrowRight,
  Star,
  Hexagon,
} from 'lucide-react'
import { loadGoogleFonts, TEXT_PRESETS, GRADIENT_PRESETS } from '../utils/google-fonts'

const BASIC_SHAPES = [
  { type: 'rect', icon: <Square className="w-6 h-6" />, label: 'Rectangle' },
  { type: 'circle', icon: <Circle className="w-6 h-6" />, label: 'Circle' },
  { type: 'triangle', icon: <Triangle className="w-6 h-6" />, label: 'Triangle' },
  { type: 'line', icon: <Minus className="w-6 h-6" />, label: 'Line' },
]

export function ElementsPanel() {
  const { getCanvas, generateId, setIsDirty, setActiveTool } = usePresentation()

  // Load Google Fonts on mount
  useEffect(() => {
    loadGoogleFonts()
  }, [])

  const addText = useCallback(
    async (preset: typeof TEXT_PRESETS[0]) => {
      const canvas = getCanvas()
      if (!canvas) return

      const fabric = await import('fabric')
      const id = generateId()

      const zoom = canvas.getZoom()
      const centerX = (canvas.width! / zoom) / 2
      const centerY = (canvas.height! / zoom) / 2

      const object = new fabric.Textbox(preset.name === 'Title' ? 'Your Title Here' : 'Enter text', {
        left: centerX - 200,
        top: centerY - preset.fontSize / 2,
        width: 400,
        fontSize: preset.fontSize,
        fontFamily: preset.fontFamily,
        fontWeight: preset.fontWeight,
        fontStyle: (preset as any).fontStyle || 'normal',
        fill: preset.fill,
        textAlign: 'center',
        id,
      } as any)

      canvas.add(object)
      canvas.setActiveObject(object)
      canvas.renderAll()
      setIsDirty(true)
      setActiveTool('select')

      // Enter editing mode
      setTimeout(() => {
        object.enterEditing()
        object.selectAll()
        canvas.renderAll()
      }, 100)
    },
    [getCanvas, generateId, setIsDirty, setActiveTool]
  )

  const addShape = useCallback(
    async (type: string, gradient?: { colors: string[] }) => {
      const canvas = getCanvas()
      if (!canvas) return

      const fabric = await import('fabric')
      const id = generateId()

      const zoom = canvas.getZoom()
      const centerX = (canvas.width! / zoom) / 2
      const centerY = (canvas.height! / zoom) / 2

      let object: any = null
      const baseColor = '#D4AF37'

      // Create gradient if specified
      let fill: any = baseColor
      if (gradient) {
        fill = new fabric.Gradient({
          type: 'linear',
          coords: { x1: 0, y1: 0, x2: 200, y2: 0 },
          colorStops: gradient.colors.map((color, index) => ({
            offset: index / (gradient.colors.length - 1),
            color,
          })),
        })
      }

      switch (type) {
        case 'rect':
          object = new fabric.Rect({
            left: centerX - 100,
            top: centerY - 75,
            width: 200,
            height: 150,
            fill,
            rx: 8,
            ry: 8,
            id,
          } as any)
          break

        case 'circle':
          object = new fabric.Circle({
            left: centerX - 75,
            top: centerY - 75,
            radius: 75,
            fill,
            id,
          } as any)
          break

        case 'triangle':
          object = new fabric.Triangle({
            left: centerX - 75,
            top: centerY - 65,
            width: 150,
            height: 130,
            fill,
            id,
          } as any)
          break

        case 'line':
          object = new fabric.Line([0, 0, 200, 0], {
            left: centerX - 100,
            top: centerY,
            stroke: '#000000',
            strokeWidth: 3,
            id,
          } as any)
          break

        case 'star':
          const starPath = createStarPath(5, 60, 30)
          object = new fabric.Path(starPath, {
            left: centerX - 60,
            top: centerY - 60,
            fill,
            id,
          } as any)
          break

        case 'hexagon':
          const hexPath = createPolygonPath(6, 50)
          object = new fabric.Path(hexPath, {
            left: centerX - 50,
            top: centerY - 50,
            fill,
            id,
          } as any)
          break

        case 'arrow':
          const arrowPath = 'M 0 10 L 160 10 L 160 0 L 200 15 L 160 30 L 160 20 L 0 20 Z'
          object = new fabric.Path(arrowPath, {
            left: centerX - 100,
            top: centerY - 15,
            fill: '#000000',
            id,
          } as any)
          break
      }

      if (object) {
        canvas.add(object)
        canvas.setActiveObject(object)
        canvas.renderAll()
        setIsDirty(true)
      }
    },
    [getCanvas, generateId, setIsDirty]
  )

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-white/10">
        <h3 className="text-sm font-medium text-white">Elements</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Text Presets */}
        <div>
          <h4 className="text-xs text-gray-500 uppercase tracking-wide mb-3">
            Text Styles
          </h4>
          <div className="space-y-2">
            {TEXT_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => addText(preset)}
                className="w-full px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-left transition-colors"
              >
                <span
                  className="text-white block truncate"
                  style={{
                    fontFamily: preset.fontFamily,
                    fontSize: Math.min(preset.fontSize * 0.4, 18),
                    fontWeight: preset.fontWeight as any,
                    fontStyle: (preset as any).fontStyle || 'normal',
                  }}
                >
                  {preset.name}
                </span>
                <span className="text-xs text-gray-500">
                  {preset.fontFamily} · {preset.fontSize}px
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Basic Shapes */}
        <div>
          <h4 className="text-xs text-gray-500 uppercase tracking-wide mb-3">
            Basic Shapes
          </h4>
          <div className="grid grid-cols-4 gap-2">
            {BASIC_SHAPES.map((shape) => (
              <button
                key={shape.type}
                onClick={() => addShape(shape.type)}
                className="aspect-square flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
                title={shape.label}
              >
                {shape.icon}
              </button>
            ))}
          </div>
        </div>

        {/* More Shapes */}
        <div>
          <h4 className="text-xs text-gray-500 uppercase tracking-wide mb-3">
            More Shapes
          </h4>
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => addShape('star')}
              className="aspect-square flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
              title="Star"
            >
              <Star className="w-6 h-6" />
            </button>
            <button
              onClick={() => addShape('hexagon')}
              className="aspect-square flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
              title="Hexagon"
            >
              <Hexagon className="w-6 h-6" />
            </button>
            <button
              onClick={() => addShape('arrow')}
              className="aspect-square flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
              title="Arrow"
            >
              <ArrowRight className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Gradient Shapes */}
        <div>
          <h4 className="text-xs text-gray-500 uppercase tracking-wide mb-3">
            Gradient Shapes
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {GRADIENT_PRESETS.slice(0, 6).map((gradient) => (
              <button
                key={gradient.name}
                onClick={() => addShape('rect', gradient)}
                className="h-12 rounded-lg border border-white/10 hover:border-white/30 transition-colors overflow-hidden"
                style={{
                  background: `linear-gradient(90deg, ${gradient.colors.join(', ')})`,
                }}
                title={gradient.name}
              >
                <span className="sr-only">{gradient.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// Helper functions for creating shape paths
function createStarPath(points: number, outerR: number, innerR: number): string {
  let path = ''
  const step = Math.PI / points

  for (let i = 0; i < 2 * points; i++) {
    const r = i % 2 === 0 ? outerR : innerR
    const angle = i * step - Math.PI / 2
    const x = outerR + r * Math.cos(angle)
    const y = outerR + r * Math.sin(angle)

    if (i === 0) {
      path = `M ${x} ${y}`
    } else {
      path += ` L ${x} ${y}`
    }
  }
  path += ' Z'
  return path
}

function createPolygonPath(sides: number, radius: number): string {
  let path = ''
  const step = (2 * Math.PI) / sides

  for (let i = 0; i < sides; i++) {
    const angle = i * step - Math.PI / 2
    const x = radius + radius * Math.cos(angle)
    const y = radius + radius * Math.sin(angle)

    if (i === 0) {
      path = `M ${x} ${y}`
    } else {
      path += ` L ${x} ${y}`
    }
  }
  path += ' Z'
  return path
}
