// Mirrors MODELS / STYLES / ASPECTS in hf-spaces/image-studio/app.py — keys must match.

// Same-origin proxy to https://felikskdm-image-studio.hf.space (api/space.js).
export const SPACE_URL = '/hf/image-studio'
export const MAX_PROMPT = 500

const asset = (path) => `${import.meta.env.BASE_URL}image-studio/${path}`

// `space` routes each model to the ZeroGPU Space that serves it. Models with
// `probe: true` live on Spaces that report availability via /models (Krea is
// gated and only appears once its license is accepted on the Hub).
export const MODELS = [
  {
    key: 'zimage',
    name: 'Z-Image Turbo',
    tag: 'New · Photoreal',
    blurb: 'Tongyi Lab\'s 6B turbo model: top-tier photorealism and legible text in images. 8 steps.',
    steps: 8,
    space: '/hf/zimage-turbo',
    probe: true,
    cover: asset('models/zimage.webp'),
  },
  {
    key: 'krea',
    name: 'Krea 2 Turbo',
    tag: 'New · Aesthetic',
    blurb: 'Krea\'s 13B turbo model with a strong, cinematic aesthetic. 8 steps.',
    steps: 8,
    space: '/hf/krea-turbo',
    probe: true,
    cover: asset('models/krea.webp'),
  },
  {
    key: 'dreamshaper',
    name: 'DreamShaper XL',
    tag: 'Versatile',
    blurb: 'All-rounder for art, fantasy and illustration. Lightning-distilled: 6 steps.',
    steps: 6,
    space: SPACE_URL,
    cover: asset('models/dreamshaper.webp'),
  },
  {
    key: 'realvis',
    name: 'RealVisXL V4',
    tag: 'Photoreal',
    blurb: 'Photographic realism: people, products, places. Lightning-distilled: 6 steps.',
    steps: 6,
    space: SPACE_URL,
    cover: asset('models/realvis.webp'),
  },
  {
    key: 'animagine',
    name: 'Animagine XL 4.0',
    tag: 'Anime',
    blurb: 'Anime and illustration. Slower (24 steps), but true to the style.',
    steps: 24,
    space: SPACE_URL,
    cover: asset('models/animagine.webp'),
  },
]

export const STYLES = [
  { key: 'none', name: 'No style' },
  { key: 'cinematic', name: 'Cinematic' },
  { key: 'photo', name: 'Photographic' },
  { key: 'anime', name: 'Anime' },
  { key: 'digital-art', name: 'Digital Art' },
  { key: 'fantasy', name: 'Fantasy' },
  { key: 'neon-punk', name: 'Neon Punk' },
  { key: '3d', name: '3D Render' },
  { key: 'pixel-art', name: 'Pixel Art' },
  { key: 'watercolor', name: 'Watercolor' },
  { key: 'line-art', name: 'Line Art' },
].map((s) => ({ ...s, cover: asset(`styles/${s.key}.webp`) }))

export const ASPECTS = [
  { key: '1:1', w: 1024, h: 1024 },
  { key: '4:3', w: 1152, h: 896 },
  { key: '3:4', w: 896, h: 1152 },
  { key: '16:9', w: 1344, h: 768 },
  { key: '9:16', w: 768, h: 1344 },
]

export const PROMPT_IDEAS = [
  'a lighthouse on a cliff during a thunderstorm, waves crashing',
  'a cozy reading nook in a treehouse, warm lamp light, rain outside',
  'an astronaut tending a vegetable garden on the moon',
  'a red fox curled up in fresh snow, morning light',
  'a floating island city with waterfalls pouring into the clouds',
  'a vintage espresso machine on a marble counter, steam rising',
  'a samurai standing in a field of red spider lilies at dusk',
  'a tiny robot repairing a pocket watch, macro shot',
  'neon-lit ramen stall in a rainy alley at night',
  'a whale swimming through a sky full of stars',
  'an ancient library carved into a mountain, sunbeams through dust',
  'a hummingbird made of stained glass, backlit',
  'portrait of an old fisherman with a weathered face, golden hour',
  'a desert caravan crossing giant sand dunes under two moons',
  'a mechanical dragon perched on a clock tower',
  'a bowl of ramen with a soft-boiled egg, top-down food photography',
  'a fairy village built inside giant mushrooms, fireflies',
  'a modern minimalist living room with a view of snowy mountains',
  'a koi pond in a japanese garden in autumn',
  'a futuristic sports car parked under neon lights',
]

/** Static image paths for a gallery entry: full size and grid thumbnail. */
export const galleryImage = (id) => asset(`gallery/${id}.webp`)
export const galleryThumb = (id) => asset(`gallery/${id}-sm.webp`)
