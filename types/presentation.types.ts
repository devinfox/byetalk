// ============================================================================
// PRESENTATION CREATOR TYPES
// ============================================================================

// ============================================================================
// ENUMS
// ============================================================================

export type PresentationStatus = 'draft' | 'published' | 'archived'

export type ElementType =
  | 'textbox'
  | 'image'
  | 'rect'
  | 'circle'
  | 'triangle'
  | 'line'
  | 'path'
  | 'group'

export type AssetSourceType = 'upload' | 'unsplash' | 'url'

// ============================================================================
// PRESENTATION
// ============================================================================

export interface Presentation {
  id: string
  name: string
  description: string | null
  status: PresentationStatus
  canvas_width: number
  canvas_height: number
  background_color: string
  template_id: string | null
  is_template: boolean
  template_category: string | null
  thumbnail_url: string | null
  entity_type: string
  entity_id: string | null
  deal_id: string | null
  lead_id: string | null
  contact_id: string | null
  organization_id: string | null
  owner_id: string
  slide_count: number
  total_views: number
  last_viewed_at: string | null
  is_deleted: boolean
  created_at: string
  updated_at: string
}

export interface PresentationInsert {
  name: string
  description?: string
  status?: PresentationStatus
  canvas_width?: number
  canvas_height?: number
  background_color?: string
  template_id?: string
  is_template?: boolean
  template_category?: string
  owner_id: string
  entity_type?: string
  entity_id?: string
  deal_id?: string
  lead_id?: string
  contact_id?: string
}

export interface PresentationUpdate {
  name?: string
  description?: string
  status?: PresentationStatus
  canvas_width?: number
  canvas_height?: number
  background_color?: string
  thumbnail_url?: string
  is_template?: boolean
  template_category?: string
}

// ============================================================================
// SLIDE
// ============================================================================

export interface Slide {
  id: string
  presentation_id: string
  slide_order: number
  name: string | null
  background_color: string
  background_image_url: string | null
  canvas_json: FabricCanvasJSON
  thumbnail_url: string | null
  notes: string | null
  transition_type: string
  transition_duration: number
  created_at: string
  updated_at: string
}

export interface SlideInsert {
  presentation_id: string
  slide_order: number
  name?: string
  background_color?: string
  background_image_url?: string
  canvas_json?: FabricCanvasJSON
  notes?: string
  transition_type?: string
  transition_duration?: number
}

export interface SlideUpdate {
  slide_order?: number
  name?: string
  background_color?: string
  background_image_url?: string
  canvas_json?: FabricCanvasJSON
  thumbnail_url?: string
  notes?: string
  transition_type?: string
  transition_duration?: number
}

// ============================================================================
// FABRIC.JS CANVAS JSON
// ============================================================================

export interface FabricCanvasJSON {
  version: string
  objects: FabricObject[]
  background?: string
  backgroundImage?: FabricObject
}

export interface FabricObject {
  type: string
  version?: string
  originX?: string
  originY?: string
  left: number
  top: number
  width?: number
  height?: number
  fill?: string | null
  stroke?: string | null
  strokeWidth?: number
  strokeDashArray?: number[] | null
  strokeLineCap?: string
  strokeLineJoin?: string
  angle?: number
  flipX?: boolean
  flipY?: boolean
  opacity?: number
  shadow?: FabricShadow | null
  visible?: boolean
  backgroundColor?: string
  scaleX?: number
  scaleY?: number
  skewX?: number
  skewY?: number
  // Custom properties
  id?: string
  name?: string
  locked?: boolean
  // Text specific
  text?: string
  fontSize?: number
  fontWeight?: string | number
  fontFamily?: string
  fontStyle?: string
  underline?: boolean
  linethrough?: boolean
  textAlign?: string
  lineHeight?: number
  charSpacing?: number
  // Image specific
  src?: string
  crossOrigin?: string | null
  filters?: FabricFilter[]
  assetId?: string
  unsplashId?: string
  // Shape specific
  rx?: number
  ry?: number
  radius?: number
  // Line specific
  x1?: number
  y1?: number
  x2?: number
  y2?: number
  // Group specific
  objects?: FabricObject[]
  // Path specific
  path?: Array<(string | number)[]>
}

export interface FabricShadow {
  color: string
  blur: number
  offsetX: number
  offsetY: number
}

export interface FabricFilter {
  type: string
  [key: string]: unknown
}

// ============================================================================
// PRESENTATION ASSET
// ============================================================================

export interface PresentationAsset {
  id: string
  presentation_id: string
  asset_type: 'image' | 'video' | 'audio'
  source_type: AssetSourceType
  original_url: string
  storage_url: string | null
  thumbnail_url: string | null
  file_name: string | null
  file_size_bytes: number | null
  width: number | null
  height: number | null
  unsplash_id: string | null
  unsplash_author: string | null
  unsplash_author_url: string | null
  usage_count: number
  created_at: string
}

export interface PresentationAssetInsert {
  presentation_id: string
  asset_type: 'image' | 'video' | 'audio'
  source_type: AssetSourceType
  original_url: string
  storage_url?: string
  thumbnail_url?: string
  file_name?: string
  file_size_bytes?: number
  width?: number
  height?: number
  unsplash_id?: string
  unsplash_author?: string
  unsplash_author_url?: string
}

// ============================================================================
// UNSPLASH
// ============================================================================

export interface UnsplashPhoto {
  id: string
  created_at: string
  width: number
  height: number
  color: string
  blur_hash: string
  description: string | null
  alt_description: string | null
  urls: {
    raw: string
    full: string
    regular: string
    small: string
    thumb: string
  }
  user: {
    id: string
    username: string
    name: string
    portfolio_url: string | null
    links: {
      html: string
    }
  }
  links: {
    download_location: string
  }
}

export interface UnsplashSearchResponse {
  total: number
  total_pages: number
  results: UnsplashPhoto[]
}

// ============================================================================
// CONTEXT STATE
// ============================================================================

export interface PresentationState {
  presentation: Presentation | null
  slides: Slide[]
  currentSlideIndex: number
  selectedObjectIds: string[]
  clipboard: FabricObject[] | null
  isDirty: boolean
  isSaving: boolean
  isLoading: boolean
  zoom: number
  activeTool: ToolType
  activePanel: PanelType | null
}

export type ToolType =
  | 'select'
  | 'text'
  | 'rect'
  | 'circle'
  | 'triangle'
  | 'line'
  | 'arrow'
  | 'draw'
  | 'image'

export type PanelType =
  | 'elements'
  | 'assets'
  | 'templates'
  | 'layers'

export interface HistoryEntry {
  slideId: string
  canvasJson: FabricCanvasJSON
  timestamp: number
}

// ============================================================================
// EXPORT OPTIONS
// ============================================================================

export interface ExportOptions {
  format: 'pdf' | 'png' | 'zip'
  quality: 'standard' | 'high' | 'print'
  slideRange: 'all' | 'current' | 'custom'
  customRange?: number[]
  includeNotes?: boolean
  // PDF specific
  pageSize?: 'slide' | 'letter' | 'a4'
  orientation?: 'landscape' | 'portrait'
}

export interface ExportResult {
  url: string
  filename: string
  size: number
  pageCount?: number
}

// ============================================================================
// TEMPLATE CATEGORY
// ============================================================================

export interface TemplateCategory {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  display_order: number
  created_at: string
}

// ============================================================================
// DEFAULT ELEMENT OPTIONS
// ============================================================================

export const DEFAULT_TEXT_OPTIONS: Partial<FabricObject> = {
  type: 'textbox',
  text: 'Enter text',
  fontSize: 32,
  fontFamily: 'Inter',
  fontWeight: 'normal',
  fill: '#000000',
  width: 300,
  textAlign: 'left',
}

export const DEFAULT_RECT_OPTIONS: Partial<FabricObject> = {
  type: 'rect',
  width: 200,
  height: 150,
  fill: '#D4AF37',
  stroke: '#000000',
  strokeWidth: 0,
  rx: 8,
  ry: 8,
}

export const DEFAULT_CIRCLE_OPTIONS: Partial<FabricObject> = {
  type: 'circle',
  radius: 75,
  fill: '#D4AF37',
  stroke: '#000000',
  strokeWidth: 0,
}

export const DEFAULT_TRIANGLE_OPTIONS: Partial<FabricObject> = {
  type: 'triangle',
  width: 150,
  height: 130,
  fill: '#D4AF37',
  stroke: '#000000',
  strokeWidth: 0,
}

export const DEFAULT_LINE_OPTIONS: Partial<FabricObject> = {
  type: 'line',
  x1: 0,
  y1: 0,
  x2: 200,
  y2: 0,
  stroke: '#000000',
  strokeWidth: 3,
}

// ============================================================================
// CANVAS PRESETS
// ============================================================================

export const CANVAS_PRESETS = {
  '16:9': { width: 1920, height: 1080, label: 'Widescreen (16:9)' },
  '4:3': { width: 1600, height: 1200, label: 'Standard (4:3)' },
  '1:1': { width: 1080, height: 1080, label: 'Square (1:1)' },
  'A4': { width: 1654, height: 2339, label: 'A4 Portrait' },
  'Letter': { width: 1700, height: 2200, label: 'Letter Portrait' },
} as const

export type CanvasPreset = keyof typeof CANVAS_PRESETS
