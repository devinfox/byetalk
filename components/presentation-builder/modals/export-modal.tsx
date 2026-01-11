'use client'

import { useState, useCallback } from 'react'
import { usePresentation } from '@/lib/presentation-context'
import { X, Download, FileImage, FileText, FolderArchive, Loader2 } from 'lucide-react'
import type { ExportOptions } from '@/types/presentation.types'

interface ExportModalProps {
  onClose: () => void
}

type ExportFormat = 'png' | 'pdf' | 'zip'

const FORMAT_OPTIONS: {
  format: ExportFormat
  icon: React.ReactNode
  label: string
  description: string
}[] = [
  {
    format: 'png',
    icon: <FileImage className="w-6 h-6" />,
    label: 'PNG Image',
    description: 'Export current slide as image',
  },
  {
    format: 'pdf',
    icon: <FileText className="w-6 h-6" />,
    label: 'PDF Document',
    description: 'Export all slides as PDF',
  },
  {
    format: 'zip',
    icon: <FolderArchive className="w-6 h-6" />,
    label: 'ZIP Archive',
    description: 'Download all slides as images',
  },
]

export function ExportModal({ onClose }: ExportModalProps) {
  const { presentation, slides, currentSlideIndex, getCanvas } = usePresentation()

  const [format, setFormat] = useState<ExportFormat>('png')
  const [quality, setQuality] = useState<'standard' | 'high'>('high')
  const [slideRange, setSlideRange] = useState<'all' | 'current'>('current')
  const [exporting, setExporting] = useState(false)

  const exportToPNG = useCallback(async () => {
    const canvas = getCanvas()
    if (!canvas) return

    // Export current slide
    const dataUrl = canvas.toDataURL({
      format: 'png',
      quality: quality === 'high' ? 1 : 0.8,
      multiplier: quality === 'high' ? 2 : 1,
    })

    // Download
    const link = document.createElement('a')
    link.download = `${presentation?.name || 'presentation'}-slide-${currentSlideIndex + 1}.png`
    link.href = dataUrl
    link.click()
  }, [getCanvas, presentation?.name, currentSlideIndex, quality])

  const exportToPDF = useCallback(async () => {
    const canvas = getCanvas()
    if (!canvas || !presentation) return

    const { jsPDF } = await import('jspdf')

    // Create PDF with slide dimensions
    const pdf = new jsPDF({
      orientation: presentation.canvas_width > presentation.canvas_height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [presentation.canvas_width, presentation.canvas_height],
    })

    const slidesToExport = slideRange === 'all' ? slides : [slides[currentSlideIndex]]

    for (let i = 0; i < slidesToExport.length; i++) {
      const slide = slidesToExport[i]

      // Load slide content to canvas
      await canvas.loadFromJSON(slide.canvas_json)
      canvas.backgroundColor = slide.background_color || '#FFFFFF'
      canvas.renderAll()

      // Wait for images to load
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Get canvas as image
      const dataUrl = canvas.toDataURL({
        format: 'png',
        quality: 1,
        multiplier: quality === 'high' ? 2 : 1,
      })

      if (i > 0) {
        pdf.addPage([presentation.canvas_width, presentation.canvas_height])
      }

      pdf.addImage(dataUrl, 'PNG', 0, 0, presentation.canvas_width, presentation.canvas_height)
    }

    // Reload current slide
    const currentSlide = slides[currentSlideIndex]
    if (currentSlide) {
      await canvas.loadFromJSON(currentSlide.canvas_json)
      canvas.backgroundColor = currentSlide.background_color || '#FFFFFF'
      canvas.renderAll()
    }

    pdf.save(`${presentation.name || 'presentation'}.pdf`)
  }, [getCanvas, presentation, slides, currentSlideIndex, slideRange, quality])

  const exportToZIP = useCallback(async () => {
    const canvas = getCanvas()
    if (!canvas || !presentation) return

    const JSZip = (await import('jszip')).default

    const zip = new JSZip()
    const folder = zip.folder('slides')
    if (!folder) return

    const slidesToExport = slideRange === 'all' ? slides : [slides[currentSlideIndex]]

    for (let i = 0; i < slidesToExport.length; i++) {
      const slide = slidesToExport[i]

      // Load slide content to canvas
      await canvas.loadFromJSON(slide.canvas_json)
      canvas.backgroundColor = slide.background_color || '#FFFFFF'
      canvas.renderAll()

      // Wait for images to load
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Get canvas as image
      const dataUrl = canvas.toDataURL({
        format: 'png',
        quality: 1,
        multiplier: quality === 'high' ? 2 : 1,
      })

      // Remove data URL prefix
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '')

      folder.file(`slide-${String(i + 1).padStart(3, '0')}.png`, base64Data, {
        base64: true,
      })
    }

    // Reload current slide
    const currentSlide = slides[currentSlideIndex]
    if (currentSlide) {
      await canvas.loadFromJSON(currentSlide.canvas_json)
      canvas.backgroundColor = currentSlide.background_color || '#FFFFFF'
      canvas.renderAll()
    }

    const blob = await zip.generateAsync({ type: 'blob' })
    const link = document.createElement('a')
    link.download = `${presentation.name || 'presentation'}-slides.zip`
    link.href = URL.createObjectURL(blob)
    link.click()
    URL.revokeObjectURL(link.href)
  }, [getCanvas, presentation, slides, currentSlideIndex, slideRange, quality])

  const handleExport = async () => {
    setExporting(true)

    try {
      switch (format) {
        case 'png':
          await exportToPNG()
          break
        case 'pdf':
          await exportToPDF()
          break
        case 'zip':
          await exportToZIP()
          break
      }
    } catch (error) {
      console.error('Export error:', error)
      alert('Failed to export. Please try again.')
    }

    setExporting(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-900 border border-white/10 rounded-xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-medium text-white">Export Presentation</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6">
          {/* Format Selection */}
          <div>
            <label className="text-sm font-medium text-gray-400 mb-3 block">
              Export Format
            </label>
            <div className="space-y-2">
              {FORMAT_OPTIONS.map((option) => (
                <button
                  key={option.format}
                  onClick={() => setFormat(option.format)}
                  className={`w-full flex items-center gap-4 p-3 rounded-lg border transition-colors ${
                    format === option.format
                      ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
                      : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                  }`}
                >
                  <span
                    className={
                      format === option.format ? 'text-yellow-400' : 'text-gray-400'
                    }
                  >
                    {option.icon}
                  </span>
                  <div className="text-left">
                    <div className="font-medium">{option.label}</div>
                    <div className="text-xs text-gray-500">{option.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Options */}
          {format !== 'png' && (
            <div>
              <label className="text-sm font-medium text-gray-400 mb-3 block">
                Slide Range
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setSlideRange('current')}
                  className={`flex-1 px-4 py-2 rounded-lg border text-sm transition-colors ${
                    slideRange === 'current'
                      ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
                      : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                  }`}
                >
                  Current Slide
                </button>
                <button
                  onClick={() => setSlideRange('all')}
                  className={`flex-1 px-4 py-2 rounded-lg border text-sm transition-colors ${
                    slideRange === 'all'
                      ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
                      : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                  }`}
                >
                  All Slides ({slides.length})
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-gray-400 mb-3 block">
              Quality
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setQuality('standard')}
                className={`flex-1 px-4 py-2 rounded-lg border text-sm transition-colors ${
                  quality === 'standard'
                    ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
                    : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                }`}
              >
                Standard
              </button>
              <button
                onClick={() => setQuality('high')}
                className={`flex-1 px-4 py-2 rounded-lg border text-sm transition-colors ${
                  quality === 'high'
                    ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
                    : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                }`}
              >
                High Quality (2x)
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-black"
            style={{
              background:
                'linear-gradient(135deg, #ffd700 0%, #ffec8b 20%, #daa520 50%, #b8860b 80%, #cd853f 100%)',
            }}
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {exporting ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  )
}
