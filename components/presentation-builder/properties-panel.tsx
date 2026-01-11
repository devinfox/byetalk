'use client'

import { usePresentation } from '@/lib/presentation-context'
import { ElementsPanel } from './panels/elements-panel'
import { AssetsPanel } from './panels/assets-panel'
import { LayersPanel } from './panels/layers-panel'

export function PropertiesPanel() {
  const { activePanel } = usePresentation()

  // Always show active panel or default to elements
  // Element properties are handled by the top formatting toolbar
  return (
    <div className="w-72 border-l border-white/10 bg-gray-900/50 flex flex-col overflow-hidden">
      {activePanel === 'assets' ? (
        <AssetsPanel />
      ) : activePanel === 'layers' ? (
        <LayersPanel />
      ) : (
        <ElementsPanel />
      )}
    </div>
  )
}
