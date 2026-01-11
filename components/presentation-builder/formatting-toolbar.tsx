'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePresentation } from '@/lib/presentation-context'
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ChevronDown,
  Palette,
  Droplet,
} from 'lucide-react'
import { GOOGLE_FONTS, COLOR_PRESETS, GRADIENT_PRESETS } from './utils/google-fonts'

export function FormattingToolbar() {
  const { getCanvas, setIsDirty, selectedObjectIds, canvasReady } = usePresentation()
  const [selectedObject, setSelectedObject] = useState<any>(null)
  const [objectProps, setObjectProps] = useState<any>({})
  const [showFontDropdown, setShowFontDropdown] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showFillPicker, setShowFillPicker] = useState(false)
  const [fillType, setFillType] = useState<'solid' | 'gradient'>('solid')
  const [gradientColors, setGradientColors] = useState(['#ff6b6b', '#feca57'])

  // Get selected object
  useEffect(() => {
    const canvas = getCanvas()
    if (!canvas || !canvasReady) return

    const updateSelection = () => {
      const active = canvas.getActiveObject()
      if (active) {
        setSelectedObject(active)

        // Check if fill is gradient
        const fill = active.fill
        if (fill && typeof fill === 'object' && 'type' in fill && fill.type === 'linear') {
          setFillType('gradient')
          const gradientFill = fill as any
          const colors = gradientFill.colorStops?.map((stop: any) => stop.color) || ['#000000', '#ffffff']
          setGradientColors(colors)
        } else {
          setFillType('solid')
        }

        setObjectProps({
          type: active.type,
          fill: typeof active.fill === 'string' ? active.fill : '#000000',
          stroke: active.stroke,
          strokeWidth: active.strokeWidth,
          fontSize: (active as any).fontSize,
          fontFamily: (active as any).fontFamily,
          fontWeight: (active as any).fontWeight,
          fontStyle: (active as any).fontStyle,
          underline: (active as any).underline,
          linethrough: (active as any).linethrough,
          textAlign: (active as any).textAlign,
        })
      } else {
        setSelectedObject(null)
        setObjectProps({})
      }
    }

    canvas.on('selection:created', updateSelection)
    canvas.on('selection:updated', updateSelection)
    canvas.on('selection:cleared', () => {
      setSelectedObject(null)
      setObjectProps({})
    })
    canvas.on('object:modified', updateSelection)

    updateSelection()

    return () => {
      canvas.off('selection:created', updateSelection)
      canvas.off('selection:updated', updateSelection)
      canvas.off('selection:cleared')
      canvas.off('object:modified', updateSelection)
    }
  }, [getCanvas, canvasReady])

  const updateProperty = useCallback(
    (key: string, value: any) => {
      const canvas = getCanvas()
      if (!canvas) return

      // Get fresh reference to active object
      const activeObj = canvas.getActiveObject() as any
      if (!activeObj) return

      // Special handling for text objects
      const isTextObject = activeObj.type === 'textbox' || activeObj.type === 'i-text' || activeObj.type === 'text'

      if (isTextObject && activeObj.isEditing) {
        // When editing text, apply style to selection or all text
        const selectionStart = activeObj.selectionStart || 0
        const selectionEnd = activeObj.selectionEnd || 0

        if (selectionStart !== selectionEnd) {
          // Has selection - apply to selected text only
          activeObj.setSelectionStyles({ [key]: value }, selectionStart, selectionEnd)
        } else {
          // No selection - apply to entire text and set as default for new text
          activeObj.set(key, value)
          // Also set selection styles for cursor position (affects new typing)
          activeObj.setSelectionStyles({ [key]: value })
        }
      } else {
        // Not editing or not a text object - just set the property
        activeObj.set(key, value)
      }

      activeObj.setCoords()
      canvas.requestRenderAll()
      setIsDirty(true)
      setObjectProps((prev: any) => ({ ...prev, [key]: value }))
    },
    [getCanvas, setIsDirty]
  )

  const applyGradient = useCallback(
    async (colors: string[]) => {
      const canvas = getCanvas()
      if (!canvas) return

      // Get fresh reference to active object
      const activeObj = canvas.getActiveObject()
      if (!activeObj) return

      const fabric = await import('fabric')

      const gradient = new fabric.Gradient({
        type: 'linear',
        coords: { x1: 0, y1: 0, x2: (activeObj as any).width || 100, y2: 0 },
        colorStops: colors.map((color, index) => ({
          offset: index / (colors.length - 1),
          color,
        })),
      })

      activeObj.set('fill', gradient)
      canvas.requestRenderAll()
      setIsDirty(true)
      setGradientColors(colors)
    },
    [getCanvas, setIsDirty]
  )

  const isTextObject =
    selectedObject?.type === 'textbox' || selectedObject?.type === 'text' || selectedObject?.type === 'i-text'

  const isShapeObject =
    selectedObject?.type === 'rect' ||
    selectedObject?.type === 'circle' ||
    selectedObject?.type === 'triangle' ||
    selectedObject?.type === 'path' ||
    selectedObject?.type === 'line'

  // No selection - show empty toolbar
  if (!selectedObject) {
    return (
      <div className="h-10 border-b border-white/10 bg-gray-900/30 flex items-center px-4">
        <span className="text-xs text-gray-500">Select an element to edit its properties</span>
      </div>
    )
  }

  return (
    <div className="h-10 border-b border-white/10 bg-gray-900/30 flex items-center px-4 gap-2 overflow-visible relative z-[60]">
      {/* Text Formatting */}
      {isTextObject && (
        <>
          {/* Font Family Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowFontDropdown(!showFontDropdown)}
              className="flex items-center gap-1 px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-xs text-white min-w-[120px]"
              style={{ fontFamily: objectProps.fontFamily }}
            >
              <span className="truncate">{objectProps.fontFamily || 'Inter'}</span>
              <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
            </button>
            {showFontDropdown && (
              <div className="absolute top-full left-0 mt-1 w-48 max-h-64 overflow-y-auto bg-gray-900 border border-white/10 rounded-lg shadow-xl z-[100]">
                {GOOGLE_FONTS.map((font) => (
                  <button
                    key={font.name}
                    onClick={() => {
                      updateProperty('fontFamily', font.name)
                      setShowFontDropdown(false)
                    }}
                    className={`w-full px-3 py-1.5 text-left text-sm hover:bg-white/10 ${
                      objectProps.fontFamily === font.name ? 'text-yellow-400' : 'text-white'
                    }`}
                    style={{ fontFamily: font.name }}
                  >
                    {font.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Font Size */}
          <input
            type="number"
            value={objectProps.fontSize || 32}
            onChange={(e) => updateProperty('fontSize', parseInt(e.target.value))}
            className="w-14 px-2 py-1 bg-white/5 border border-white/10 rounded text-xs text-white text-center"
            min={8}
            max={400}
          />

          <div className="w-px h-5 bg-white/10" />

          {/* Bold */}
          <button
            onClick={() => updateProperty('fontWeight', objectProps.fontWeight === 'bold' ? 'normal' : 'bold')}
            className={`p-1.5 rounded ${
              objectProps.fontWeight === 'bold' ? 'bg-yellow-500/20 text-yellow-400' : 'hover:bg-white/10 text-gray-400'
            }`}
            title="Bold"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>

          {/* Italic */}
          <button
            onClick={() => updateProperty('fontStyle', objectProps.fontStyle === 'italic' ? 'normal' : 'italic')}
            className={`p-1.5 rounded ${
              objectProps.fontStyle === 'italic' ? 'bg-yellow-500/20 text-yellow-400' : 'hover:bg-white/10 text-gray-400'
            }`}
            title="Italic"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>

          {/* Underline */}
          <button
            onClick={() => updateProperty('underline', !objectProps.underline)}
            className={`p-1.5 rounded ${
              objectProps.underline ? 'bg-yellow-500/20 text-yellow-400' : 'hover:bg-white/10 text-gray-400'
            }`}
            title="Underline"
          >
            <Underline className="w-3.5 h-3.5" />
          </button>

          {/* Strikethrough */}
          <button
            onClick={() => updateProperty('linethrough', !objectProps.linethrough)}
            className={`p-1.5 rounded ${
              objectProps.linethrough ? 'bg-yellow-500/20 text-yellow-400' : 'hover:bg-white/10 text-gray-400'
            }`}
            title="Strikethrough"
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-5 bg-white/10" />

          {/* Text Alignment */}
          <button
            onClick={() => updateProperty('textAlign', 'left')}
            className={`p-1.5 rounded ${
              objectProps.textAlign === 'left' ? 'bg-yellow-500/20 text-yellow-400' : 'hover:bg-white/10 text-gray-400'
            }`}
            title="Align Left"
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => updateProperty('textAlign', 'center')}
            className={`p-1.5 rounded ${
              objectProps.textAlign === 'center' ? 'bg-yellow-500/20 text-yellow-400' : 'hover:bg-white/10 text-gray-400'
            }`}
            title="Align Center"
          >
            <AlignCenter className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => updateProperty('textAlign', 'right')}
            className={`p-1.5 rounded ${
              objectProps.textAlign === 'right' ? 'bg-yellow-500/20 text-yellow-400' : 'hover:bg-white/10 text-gray-400'
            }`}
            title="Align Right"
          >
            <AlignRight className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-5 bg-white/10" />

          {/* Text Color */}
          <div className="relative">
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="flex items-center gap-1.5 px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-xs"
              title="Text Color"
            >
              <div
                className="w-4 h-4 rounded border border-white/20"
                style={{ backgroundColor: objectProps.fill || '#000000' }}
              />
              <span className="text-gray-400">Color</span>
            </button>
            {showColorPicker && (
              <div className="absolute top-full left-0 mt-1 p-2 bg-gray-900 border border-white/10 rounded-lg shadow-xl z-[100]">
                <input
                  type="color"
                  value={objectProps.fill || '#000000'}
                  onChange={(e) => updateProperty('fill', e.target.value)}
                  className="w-full h-8 mb-2 rounded cursor-pointer"
                />
                <div className="grid grid-cols-5 gap-1">
                  {COLOR_PRESETS.slice(0, 10).map((color) => (
                    <button
                      key={color}
                      onClick={() => {
                        updateProperty('fill', color)
                        setShowColorPicker(false)
                      }}
                      className="w-6 h-6 rounded border border-white/20 hover:scale-110 transition-transform"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Shape Formatting */}
      {isShapeObject && (
        <>
          {/* Fill Type Toggle */}
          <div className="flex items-center bg-white/5 border border-white/10 rounded overflow-hidden">
            <button
              onClick={() => {
                setFillType('solid')
                updateProperty('fill', gradientColors[0] || '#D4AF37')
              }}
              className={`px-2 py-1 text-xs ${
                fillType === 'solid' ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-400 hover:text-white'
              }`}
            >
              Solid
            </button>
            <button
              onClick={() => {
                setFillType('gradient')
                applyGradient(gradientColors)
              }}
              className={`px-2 py-1 text-xs ${
                fillType === 'gradient' ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-400 hover:text-white'
              }`}
            >
              Gradient
            </button>
          </div>

          <div className="w-px h-5 bg-white/10" />

          {/* Fill Color/Gradient */}
          <div className="relative">
            <button
              onClick={() => setShowFillPicker(!showFillPicker)}
              className="flex items-center gap-1.5 px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-xs"
              title="Fill"
            >
              {fillType === 'solid' ? (
                <div
                  className="w-4 h-4 rounded border border-white/20"
                  style={{ backgroundColor: objectProps.fill || '#D4AF37' }}
                />
              ) : (
                <div
                  className="w-4 h-4 rounded border border-white/20"
                  style={{ background: `linear-gradient(90deg, ${gradientColors.join(', ')})` }}
                />
              )}
              <Droplet className="w-3 h-3 text-gray-400" />
            </button>
            {showFillPicker && (
              <div className="absolute top-full left-0 mt-1 p-3 bg-gray-900 border border-white/10 rounded-lg shadow-xl z-[100] w-56">
                {fillType === 'solid' ? (
                  <>
                    <input
                      type="color"
                      value={objectProps.fill || '#D4AF37'}
                      onChange={(e) => updateProperty('fill', e.target.value)}
                      className="w-full h-8 mb-2 rounded cursor-pointer"
                    />
                    <div className="grid grid-cols-5 gap-1">
                      {COLOR_PRESETS.map((color) => (
                        <button
                          key={color}
                          onClick={() => {
                            updateProperty('fill', color)
                            setShowFillPicker(false)
                          }}
                          className="w-6 h-6 rounded border border-white/20 hover:scale-110 transition-transform"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1">
                        <label className="text-xs text-gray-500 block mb-1">Start</label>
                        <input
                          type="color"
                          value={gradientColors[0]}
                          onChange={(e) => {
                            const newColors = [e.target.value, gradientColors[1]]
                            setGradientColors(newColors)
                            applyGradient(newColors)
                          }}
                          className="w-full h-8 rounded cursor-pointer"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-gray-500 block mb-1">End</label>
                        <input
                          type="color"
                          value={gradientColors[1]}
                          onChange={(e) => {
                            const newColors = [gradientColors[0], e.target.value]
                            setGradientColors(newColors)
                            applyGradient(newColors)
                          }}
                          className="w-full h-8 rounded cursor-pointer"
                        />
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mb-1">Presets</div>
                    <div className="grid grid-cols-5 gap-1">
                      {GRADIENT_PRESETS.map((preset) => (
                        <button
                          key={preset.name}
                          onClick={() => {
                            applyGradient(preset.colors)
                            setShowFillPicker(false)
                          }}
                          className="h-6 rounded border border-white/20 hover:scale-110 transition-transform"
                          style={{ background: `linear-gradient(90deg, ${preset.colors.join(', ')})` }}
                          title={preset.name}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="w-px h-5 bg-white/10" />

          {/* Stroke Color */}
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={objectProps.stroke || '#000000'}
              onChange={(e) => updateProperty('stroke', e.target.value)}
              className="w-6 h-6 rounded border border-white/10 bg-transparent cursor-pointer"
              title="Stroke Color"
            />
            <input
              type="number"
              value={objectProps.strokeWidth || 0}
              onChange={(e) => updateProperty('strokeWidth', parseInt(e.target.value))}
              className="w-12 px-1.5 py-1 bg-white/5 border border-white/10 rounded text-xs text-white text-center"
              min={0}
              max={50}
              placeholder="Stroke"
              title="Stroke Width"
            />
          </div>
        </>
      )}

      {/* Close dropdowns on click outside */}
      {(showFontDropdown || showColorPicker || showFillPicker) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setShowFontDropdown(false)
            setShowColorPicker(false)
            setShowFillPicker(false)
          }}
        />
      )}
    </div>
  )
}
