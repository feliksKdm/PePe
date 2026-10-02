// Canvas operations for the Photo Editor. Every op takes a source canvas and
// returns a NEW canvas, so history snapshots stay immutable.

export const MAX_EDIT_SIDE = 3000 // larger images are scaled down on open

export function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

export function cloneCanvas(src) {
  const c = makeCanvas(src.width, src.height)
  c.getContext('2d').drawImage(src, 0, 0)
  return c
}

/** Decode a Blob/File into a canvas, capped at MAX_EDIT_SIDE. */
export async function canvasFromBlob(blob, maxSide = MAX_EDIT_SIDE) {
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const c = makeCanvas(bitmap.width * scale, bitmap.height * scale)
  const ctx = c.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, c.width, c.height)
  bitmap.close()
  return { canvas: c, scaled: scale < 1 }
}

export const canvasToBlob = (canvas, type = 'image/png', quality) =>
  new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), type, quality))

/** Downscaled copy (for previews and uploads). */
export function scaledCopy(src, maxSide) {
  const s = Math.min(1, maxSide / Math.max(src.width, src.height))
  if (s === 1) return src
  const c = makeCanvas(src.width * s, src.height * s)
  const ctx = c.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, c.width, c.height)
  return c
}

// ---------- adjustments ----------

export const DEFAULT_ADJUST = { brightness: 100, contrast: 100, saturate: 100, hue: 0, warmth: 0, blur: 0, vignette: 0, fade: 0 }

export const FILTER_PRESETS = [
  { key: 'original', name: 'Original', adjust: {} },
  { key: 'vivid', name: 'Vivid', adjust: { contrast: 112, saturate: 140, brightness: 104 } },
  { key: 'warm', name: 'Golden', adjust: { warmth: 35, saturate: 115, brightness: 104 } },
  { key: 'cool', name: 'Nordic', adjust: { warmth: -30, saturate: 90, contrast: 105 } },
  { key: 'mono', name: 'Mono', adjust: { saturate: 0, contrast: 110 } },
  { key: 'noir', name: 'Noir', adjust: { saturate: 0, contrast: 150, brightness: 92, vignette: 55 } },
  { key: 'vintage', name: 'Vintage', adjust: { saturate: 75, warmth: 30, fade: 30, contrast: 92, vignette: 35 } },
  { key: 'fade', name: 'Matte', adjust: { fade: 40, contrast: 90, saturate: 90 } },
  { key: 'dramatic', name: 'Drama', adjust: { contrast: 135, saturate: 115, brightness: 95, vignette: 45 } },
  { key: 'dreamy', name: 'Dreamy', adjust: { brightness: 108, saturate: 110, blur: 1, fade: 20, warmth: 10 } },
]

const isDefault = (a) => Object.entries(DEFAULT_ADJUST).every(([k, v]) => (a[k] ?? v) === v)

/**
 * Render `src` with adjustments onto a new canvas of size w×h (defaults to the
 * source size). Uses canvas filters plus overlays for warmth, fade and vignette.
 */
export function renderAdjusted(src, adjust, w = src.width, h = src.height) {
  const a = { ...DEFAULT_ADJUST, ...adjust }
  const c = makeCanvas(w, h)
  const ctx = c.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  if (isDefault(a)) {
    ctx.drawImage(src, 0, 0, w, h)
    return c
  }
  const blurPx = a.blur * (Math.max(w, h) / 1000)
  ctx.filter = `brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturate}%) hue-rotate(${a.hue}deg)${blurPx > 0 ? ` blur(${blurPx}px)` : ''}`
  ctx.drawImage(src, 0, 0, w, h)
  ctx.filter = 'none'
  if (a.warmth) {
    // Warm = amber, cool = blue, blended softly.
    ctx.globalCompositeOperation = 'soft-light'
    ctx.fillStyle = a.warmth > 0 ? `rgba(255, 160, 40, ${a.warmth / 100})` : `rgba(40, 120, 255, ${-a.warmth / 100})`
    ctx.fillRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'source-over'
  }
  if (a.fade) {
    ctx.fillStyle = `rgba(235, 230, 225, ${a.fade / 250})`
    ctx.fillRect(0, 0, w, h)
  }
  if (a.vignette) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) / 2)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, `rgba(0,0,0,${a.vignette / 100})`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
  return c
}

// ---------- geometry ----------

export function rotate90(src, dir = 1) {
  const c = makeCanvas(src.height, src.width)
  const ctx = c.getContext('2d')
  ctx.translate(c.width / 2, c.height / 2)
  ctx.rotate((dir * Math.PI) / 2)
  ctx.drawImage(src, -src.width / 2, -src.height / 2)
  return c
}

export function flip(src, horizontal = true) {
  const c = makeCanvas(src.width, src.height)
  const ctx = c.getContext('2d')
  ctx.translate(horizontal ? c.width : 0, horizontal ? 0 : c.height)
  ctx.scale(horizontal ? -1 : 1, horizontal ? 1 : -1)
  ctx.drawImage(src, 0, 0)
  return c
}

/** rect in image pixels: { x, y, w, h } */
export function crop(src, rect) {
  const c = makeCanvas(rect.w, rect.h)
  c.getContext('2d').drawImage(src, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h)
  return c
}

export function resize(src, w, h) {
  const c = makeCanvas(w, h)
  const ctx = c.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, w, h)
  return c
}

/** Largest centered rect with the given aspect (w/h); null aspect = whole image. */
export function fitAspect(w, h, aspect) {
  if (!aspect) return { x: 0, y: 0, w, h }
  let cw = w
  let ch = w / aspect
  if (ch > h) {
    ch = h
    cw = h * aspect
  }
  return { x: (w - cw) / 2, y: (h - ch) / 2, w: cw, h: ch }
}

// ---------- strokes, text, masks ----------

/** strokes: [{ color, size, opacity, points: [[x,y]...] }] in image pixels. */
export function drawStrokes(ctx, strokes) {
  for (const s of strokes) {
    ctx.save()
    ctx.globalAlpha = s.opacity ?? 1
    ctx.strokeStyle = s.color
    ctx.fillStyle = s.color
    ctx.lineWidth = s.size
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const pts = s.points
    if (pts.length === 1) {
      ctx.beginPath()
      ctx.arc(pts[0][0], pts[0][1], s.size / 2, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.moveTo(pts[0][0], pts[0][1])
      for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y)
      ctx.stroke()
    }
    ctx.restore()
  }
}

export function bakeStrokes(src, strokes) {
  const c = cloneCanvas(src)
  drawStrokes(c.getContext('2d'), strokes)
  return c
}

export const FONTS = {
  sans: '"Funnel Display", ui-sans-serif, system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "JetBrains Mono", monospace',
  impact: 'Impact, "Arial Black", sans-serif',
}

/** text: { value, x, y, size, color, font, weight, shadow } in image pixels (x,y = center). */
export function drawText(ctx, t) {
  if (!t.value.trim()) return
  ctx.save()
  ctx.font = `${t.weight} ${t.size}px ${FONTS[t.font]}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (t.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.55)'
    ctx.shadowBlur = t.size * 0.12
    ctx.shadowOffsetY = t.size * 0.04
  }
  ctx.fillStyle = t.color
  const lines = t.value.split('\n')
  lines.forEach((line, i) => ctx.fillText(line, t.x, t.y + (i - (lines.length - 1) / 2) * t.size * 1.15))
  ctx.restore()
}

export function bakeText(src, t) {
  const c = cloneCanvas(src)
  drawText(c.getContext('2d'), t)
  return c
}

/** White-on-black mask canvas from brush strokes (for the AI eraser). */
export function maskFromStrokes(w, h, strokes) {
  const c = makeCanvas(w, h)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  drawStrokes(ctx, strokes.map((s) => ({ ...s, color: '#fff', opacity: 1 })))
  return c
}

/**
 * Paste `patch` (an AI result covering the whole image, possibly at lower
 * resolution) into `src` only where `mask` is white, with a feathered edge —
 * so the rest of the photo keeps its full resolution.
 */
export function compositeMasked(src, patch, mask, feather = 8) {
  const w = src.width
  const h = src.height
  // Luminance of the white-on-black mask becomes alpha.
  const m = makeCanvas(w, h)
  const mctx = m.getContext('2d')
  mctx.drawImage(mask, 0, 0, w, h)
  const data = mctx.getImageData(0, 0, w, h)
  for (let i = 0; i < data.data.length; i += 4) data.data[i + 3] = data.data[i]
  mctx.putImageData(data, 0, 0)
  // Patch, clipped to the (feathered) mask.
  const layer = makeCanvas(w, h)
  const lctx = layer.getContext('2d')
  lctx.imageSmoothingQuality = 'high'
  lctx.drawImage(patch, 0, 0, w, h)
  lctx.globalCompositeOperation = 'destination-in'
  lctx.filter = `blur(${feather}px)`
  lctx.drawImage(m, 0, 0)
  const out = cloneCanvas(src)
  out.getContext('2d').drawImage(layer, 0, 0)
  return out
}

/** Apply an alpha mask (Uint8 per pixel, same size) to make a cut-out. */
export function applyAlpha(src, alpha, background) {
  const c = makeCanvas(src.width, src.height)
  const ctx = c.getContext('2d')
  const cut = cloneCanvas(src)
  const cctx = cut.getContext('2d')
  const px = cctx.getImageData(0, 0, cut.width, cut.height)
  for (let i = 0; i < alpha.length; i++) px.data[i * 4 + 3] = alpha[i]
  cctx.putImageData(px, 0, 0)
  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, c.width, c.height)
  }
  ctx.drawImage(cut, 0, 0)
  return c
}
