// Popular Google Fonts for presentations
export const GOOGLE_FONTS = [
  { name: 'Inter', category: 'sans-serif' },
  { name: 'Roboto', category: 'sans-serif' },
  { name: 'Open Sans', category: 'sans-serif' },
  { name: 'Lato', category: 'sans-serif' },
  { name: 'Montserrat', category: 'sans-serif' },
  { name: 'Poppins', category: 'sans-serif' },
  { name: 'Raleway', category: 'sans-serif' },
  { name: 'Nunito', category: 'sans-serif' },
  { name: 'Playfair Display', category: 'serif' },
  { name: 'Merriweather', category: 'serif' },
  { name: 'Lora', category: 'serif' },
  { name: 'PT Serif', category: 'serif' },
  { name: 'Source Code Pro', category: 'monospace' },
  { name: 'Fira Code', category: 'monospace' },
  { name: 'Oswald', category: 'sans-serif' },
  { name: 'Bebas Neue', category: 'display' },
  { name: 'Pacifico', category: 'handwriting' },
  { name: 'Dancing Script', category: 'handwriting' },
  { name: 'Caveat', category: 'handwriting' },
  { name: 'Permanent Marker', category: 'handwriting' },
]

// Load Google Fonts dynamically
export function loadGoogleFonts(fonts: string[] = GOOGLE_FONTS.map(f => f.name)) {
  if (typeof window === 'undefined') return

  const link = document.getElementById('google-fonts-link') as HTMLLinkElement
  if (link) return // Already loaded

  const fontFamilies = fonts.map(f => f.replace(/ /g, '+')).join('&family=')
  const href = `https://fonts.googleapis.com/css2?family=${fontFamilies}:wght@300;400;500;600;700;800&display=swap`

  const newLink = document.createElement('link')
  newLink.id = 'google-fonts-link'
  newLink.rel = 'stylesheet'
  newLink.href = href
  document.head.appendChild(newLink)
}

// Text presets for quick styling
export const TEXT_PRESETS = [
  {
    name: 'Title',
    fontSize: 72,
    fontWeight: 'bold',
    fontFamily: 'Montserrat',
    fill: '#000000',
  },
  {
    name: 'Heading 1',
    fontSize: 48,
    fontWeight: 'bold',
    fontFamily: 'Montserrat',
    fill: '#000000',
  },
  {
    name: 'Heading 2',
    fontSize: 36,
    fontWeight: '600',
    fontFamily: 'Montserrat',
    fill: '#333333',
  },
  {
    name: 'Subheading',
    fontSize: 28,
    fontWeight: '500',
    fontFamily: 'Open Sans',
    fill: '#444444',
  },
  {
    name: 'Body',
    fontSize: 18,
    fontWeight: 'normal',
    fontFamily: 'Open Sans',
    fill: '#333333',
  },
  {
    name: 'Body Large',
    fontSize: 24,
    fontWeight: 'normal',
    fontFamily: 'Open Sans',
    fill: '#333333',
  },
  {
    name: 'Caption',
    fontSize: 14,
    fontWeight: 'normal',
    fontFamily: 'Open Sans',
    fill: '#666666',
  },
  {
    name: 'Quote',
    fontSize: 28,
    fontWeight: '300',
    fontFamily: 'Playfair Display',
    fontStyle: 'italic',
    fill: '#444444',
  },
]

// Preset gradients
export const GRADIENT_PRESETS = [
  { name: 'Sunset', colors: ['#ff6b6b', '#feca57'] },
  { name: 'Ocean', colors: ['#667eea', '#764ba2'] },
  { name: 'Forest', colors: ['#11998e', '#38ef7d'] },
  { name: 'Fire', colors: ['#f12711', '#f5af19'] },
  { name: 'Purple Haze', colors: ['#7f00ff', '#e100ff'] },
  { name: 'Cool Blues', colors: ['#2193b0', '#6dd5ed'] },
  { name: 'Peach', colors: ['#ed6ea0', '#ec8c69'] },
  { name: 'Night Sky', colors: ['#0f0c29', '#302b63', '#24243e'] },
  { name: 'Gold', colors: ['#f2994a', '#f2c94c'] },
  { name: 'Silver', colors: ['#bdc3c7', '#2c3e50'] },
]

// Solid color presets
export const COLOR_PRESETS = [
  '#000000', '#ffffff', '#f44336', '#e91e63', '#9c27b0',
  '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4',
  '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b',
  '#ffc107', '#ff9800', '#ff5722', '#795548', '#607d8b',
]
