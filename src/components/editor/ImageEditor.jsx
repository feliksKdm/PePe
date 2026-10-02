import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { callSpace, uploadToSpace, wakeSpace } from '../../lib/gradio.js'
import {
  DEFAULT_ADJUST,
  FILTER_PRESETS,
  applyAlpha,
  bakeStrokes,
  bakeText,
  canvasFromBlob,
  canvasToBlob,
  compositeMasked,
  crop,
  drawStrokes,
  drawText,
  fitAspect,
  flip,
  makeCanvas,
  maskFromStrokes,
  renderAdjusted,
  rotate90,
  scaledCopy,
} from './ops.js'

// AI backends, all through the same-origin proxy. Large results are fetched
// straight from the Space (CORS allows this origin) to dodge the 4.5 MB limit.
const EDITOR = { proxy: '/hf/image-editor', origin: 'https://felikskdm-image-editor.hf.space' }
const STUDIO = { proxy: '/hf/image-studio', origin: 'https://felikskdm-image-studio.hf.space' }
const AI_MAX_SIDE = 1536
const PREVIEW_MAX = 1400
const HISTORY_MAX = 30

const TOOLS = [
  { key: 'adjust', icon: '🎚️', label: 'Adjust' },
  { key: 'filters', icon: '🎨', label: 'Filters' },
  { key: 'crop', icon: '✂️', label: 'Crop' },
  { key: 'text', icon: '🔤', label: 'Text' },
  { key: 'draw', icon: '🖌️', label: 'Draw' },
  { key: 'ai-edit', icon: '✨', label: 'AI Edit', ai: true },
  { key: 'erase', icon: '🧽', label: 'Eraser', ai: true },
  { key: 'background', icon: '🪄', label: 'Remove BG', ai: true },
  { key: 'upscale', icon: '🔍', label: 'Upscale', ai: true },
]

const ASPECTS = [
  ['Free', null],
  ['1:1', 1],
  ['4:5', 4 / 5],
  ['3:2', 3 / 2],
  ['16:9', 16 / 9],
  ['9:16', 9 / 16],
]

const SLIDERS = [
  ['brightness', 'Brightness', 0, 200],
  ['contrast', 'Contrast', 0, 200],
  ['saturate', 'Saturation', 0, 200],
  ['warmth', 'Warmth', -100, 100],
  ['hue', 'Hue', -180, 180],
  ['fade', 'Fade', 0, 100],
  ['vignette', 'Vignette', 0, 100],
  ['blur', 'Blur', 0, 20],
]

const EDIT_IDEAS = [
  'Make it a snowy winter scene',
  'Turn it into a watercolor painting',
  'Change the time of day to sunset',
  'Make it look like a 1970s film photo',
  'Add dramatic storm clouds to the sky',
  'Turn it into a Studio Ghibli style illustration',
]

const SAMPLES = ['k-greenhouse', 'fisherman', 'z-street', 'k-tea-ceremony', 'barista', 'koi-pond'].map((id) => ({
  id,
  thumb: `${import.meta.env.BASE_URL}image-studio/gallery/${id}-sm.webp`,
  full: `${import.meta.env.BASE_URL}image-studio/gallery/${id}.webp`,
}))

const BG_COLORS = [null, '#ffffff', '#000000', '#7a57db', '#33c2cc', '#ea4884', '#f2efe9']
const CHECKER = 'repeating-conic-gradient(#2a2d4a 0% 25%, #1c1e36 0% 50%) 50% / 20px 20px'

const Label = ({ children, right }) => (
  <div className="flex items-baseline justify-between gap-3">
    <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">{children}</p>
    {right}
  </div>
)

const PrimaryButton = ({ children, ...props }) => (
  <button
    {...props}
    className="w-full cursor-pointer rounded-full bg-radial from-lavender to-royal px-5 py-3 text-sm font-medium hover-animation disabled:cursor-not-allowed disabled:opacity-50"
  >
    {children}
  </button>
)

const GhostButton = ({ children, active, ...props }) => (
  <button
    {...props}
    className={`cursor-pointer rounded-lg border px-3 py-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
      active ? 'border-lavender bg-lavender/20 text-white' : 'border-white/10 text-neutral-300 hover:border-aqua/40 hover:text-white'
    }`}
  >
    {children}
  </button>
)

async function fetchResult(url, space) {
  const path = url.replace(/^https?:\/\/[^/]+/, '')
  let res = await fetch(space.origin + path).catch(() => null)
  if (!res?.ok) res = await fetch(space.proxy + path)
  if (!res.ok) throw new Error(`Couldn't download the result (${res.status}).`)
  return (await canvasFromBlob(await res.blob())).canvas
}

const ImageEditor = () => {
  const [history, setHistory] = useState([]) // [{ canvas, label }]
  const [index, setIndex] = useState(-1)
  const [name, setName] = useState('image')
  const [tool, setTool] = useState('adjust')
  const [adjust, setAdjust] = useState(DEFAULT_ADJUST)
  const [preset, setPreset] = useState('original')
  const [aspect, setAspect] = useState(null)
  const [cropRect, setCropRect] = useState(null)
  const [text, setText] = useState({ value: 'Your text', x: 0, y: 0, size: 64, color: '#ffffff', font: 'sans', weight: 700, shadow: true })
  const [brush, setBrush] = useState({ color: '#ea4884', size: 18, opacity: 1 })
  const [strokes, setStrokes] = useState([])
  const [eraseSize, setEraseSize] = useState(40)
  const [instruction, setInstruction] = useState('')
  const [bgColor, setBgColor] = useState(null)
  const [scale, setScale] = useState(2)
  const [compare, setCompare] = useState(false)
  const [busy, setBusy] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [aiTools, setAiTools] = useState(new Set())
  const [exportType, setExportType] = useState('image/png')
  const [quality, setQuality] = useState(0.92)
  const [dragOver, setDragOver] = useState(false)

  const displayRef = useRef(null)
  const stageRef = useRef(null)
  const inputRef = useRef(null)
  const drag = useRef(null)
  const bgWorker = useRef(null)
  const bgJob = useRef(0)

  const doc = history[index]?.canvas || null
  const original = history[0]?.canvas || null

  // ---------- history ----------
  const commit = useCallback(
    (canvas, label) => {
      setHistory((h) => [...h.slice(0, index + 1), { canvas, label }].slice(-HISTORY_MAX))
      setIndex((i) => Math.min(i + 1, HISTORY_MAX - 1))
    },
    [index]
  )
  const undo = () => setIndex((i) => Math.max(0, i - 1))
  const redo = () => setIndex((i) => Math.min(history.length - 1, i + 1))

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || /input|textarea/i.test(e.target.tagName)) return
      e.preventDefault()
      if (e.shiftKey) setIndex((i) => Math.min(history.length - 1, i + 1))
      else setIndex((i) => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [history.length])

  // Reset per-tool scratch state whenever the image or tool changes.
  useEffect(() => {
    setAdjust(DEFAULT_ADJUST)
    setPreset('original')
    setStrokes([])
    setError('')
    if (doc) {
      setCropRect(fitAspect(doc.width, doc.height, aspect))
      setText((t) => ({ ...t, x: doc.width / 2, y: doc.height / 2, size: Math.round(Math.max(24, doc.width / 14)) }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, tool])

  useEffect(() => {
    wakeSpace(EDITOR.proxy)
    callSpace(EDITOR.proxy, 'models', [])
      .then(([keys]) => Array.isArray(keys) && setAiTools(new Set(keys)))
      .catch(() => {})
    return () => bgWorker.current?.terminate()
  }, [])

  useEffect(() => {
    if (!busy) return
    const t0 = performance.now()
    const id = setInterval(() => setElapsed(Math.floor((performance.now() - t0) / 1000)), 250)
    return () => clearInterval(id)
  }, [busy])

  // ---------- open ----------
  const open = async (blob, fileName) => {
    if (!blob?.type?.startsWith('image/')) {
      setError('That isn’t an image file.')
      return
    }
    try {
      const { canvas, scaled } = await canvasFromBlob(blob)
      setHistory([{ canvas, label: 'Original' }])
      setIndex(0)
      setName(fileName.replace(/\.[^.]+$/, '') || 'image')
      setNotice(scaled ? 'Large image scaled to 3000px for editing.' : '')
      setError('')
    } catch {
      setError('Couldn’t open that image. Try a JPG, PNG or WEBP.')
    }
  }

  // ---------- preview rendering ----------
  const previewSize = useMemo(() => {
    if (!doc) return null
    const s = Math.min(1, PREVIEW_MAX / Math.max(doc.width, doc.height))
    return { w: Math.round(doc.width * s), h: Math.round(doc.height * s), s }
  }, [doc])

  useEffect(() => {
    const canvas = displayRef.current
    if (!canvas || !doc || !previewSize) return
    const { w, h, s } = previewSize
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, w, h)
    if (compare && original) {
      ctx.drawImage(original, 0, 0, w, h)
      return
    }
    const active = tool === 'adjust' || tool === 'filters' ? adjust : DEFAULT_ADJUST
    ctx.drawImage(renderAdjusted(doc, active, w, h), 0, 0)
    ctx.save()
    ctx.scale(s, s)
    if (tool === 'draw') drawStrokes(ctx, strokes)
    if (tool === 'erase') drawStrokes(ctx, strokes.map((st) => ({ ...st, color: 'rgba(234,72,132,1)', opacity: 0.55 })))
    if (tool === 'text') drawText(ctx, text)
    if (tool === 'crop' && cropRect) {
      ctx.fillStyle = 'rgba(3,4,18,0.6)'
      ctx.beginPath()
      ctx.rect(0, 0, doc.width, doc.height)
      ctx.rect(cropRect.x, cropRect.y, cropRect.w, cropRect.h)
      ctx.fill('evenodd')
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2 / s
      ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h)
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.lineWidth = 1 / s
      for (const f of [1 / 3, 2 / 3]) {
        ctx.beginPath()
        ctx.moveTo(cropRect.x + cropRect.w * f, cropRect.y)
        ctx.lineTo(cropRect.x + cropRect.w * f, cropRect.y + cropRect.h)
        ctx.moveTo(cropRect.x, cropRect.y + cropRect.h * f)
        ctx.lineTo(cropRect.x + cropRect.w, cropRect.y + cropRect.h * f)
        ctx.stroke()
      }
      ctx.fillStyle = '#ffffff'
      const hs = 12 / s
      for (const [cx, cy] of [
        [cropRect.x, cropRect.y],
        [cropRect.x + cropRect.w, cropRect.y],
        [cropRect.x, cropRect.y + cropRect.h],
        [cropRect.x + cropRect.w, cropRect.y + cropRect.h],
      ])
        ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs)
    }
    ctx.restore()
  }, [doc, original, previewSize, tool, adjust, strokes, text, cropRect, compare])

  // ---------- pointer interaction (in image pixels) ----------
  const toImage = (e) => {
    const r = displayRef.current.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * doc.width, ((e.clientY - r.top) / r.height) * doc.height]
  }

  const onPointerDown = (e) => {
    if (!doc || busy) return
    const [x, y] = toImage(e)
    e.currentTarget.setPointerCapture(e.pointerId)
    if (tool === 'draw' || tool === 'erase') {
      const size = tool === 'erase' ? (eraseSize * doc.width) / 1000 : (brush.size * doc.width) / 1000
      setStrokes((s) => [...s, { color: brush.color, opacity: brush.opacity, size, points: [[x, y]] }])
      drag.current = { mode: 'stroke' }
    } else if (tool === 'text') {
      drag.current = { mode: 'text', dx: text.x - x, dy: text.y - y }
    } else if (tool === 'crop' && cropRect) {
      const r = displayRef.current.getBoundingClientRect()
      const tol = (16 / r.width) * doc.width
      const corners = {
        nw: [cropRect.x, cropRect.y],
        ne: [cropRect.x + cropRect.w, cropRect.y],
        sw: [cropRect.x, cropRect.y + cropRect.h],
        se: [cropRect.x + cropRect.w, cropRect.y + cropRect.h],
      }
      const corner = Object.entries(corners).find(([, [cx, cy]]) => Math.abs(cx - x) < tol && Math.abs(cy - y) < tol)?.[0]
      const inside = x > cropRect.x && x < cropRect.x + cropRect.w && y > cropRect.y && y < cropRect.y + cropRect.h
      drag.current = corner ? { mode: corner, start: cropRect } : inside ? { mode: 'move', start: cropRect, x, y } : null
    }
  }

  const onPointerMove = (e) => {
    const d = drag.current
    if (!d || !doc) return
    const [x, y] = toImage(e)
    if (d.mode === 'stroke') {
      setStrokes((s) => {
        const last = s[s.length - 1]
        return [...s.slice(0, -1), { ...last, points: [...last.points, [x, y]] }]
      })
    } else if (d.mode === 'text') {
      setText((t) => ({ ...t, x: x + d.dx, y: y + d.dy }))
    } else if (d.mode === 'move') {
      const nx = Math.min(Math.max(0, d.start.x + x - d.x), doc.width - d.start.w)
      const ny = Math.min(Math.max(0, d.start.y + y - d.y), doc.height - d.start.h)
      setCropRect({ ...d.start, x: nx, y: ny })
    } else {
      // Resize from a corner, keeping the opposite corner fixed.
      const s = d.start
      const fx = d.mode.includes('w') ? s.x + s.w : s.x
      const fy = d.mode.includes('n') ? s.y + s.h : s.y
      const cx = Math.min(Math.max(0, x), doc.width)
      const cy = Math.min(Math.max(0, y), doc.height)
      let w = Math.max(20, Math.abs(cx - fx))
      let h = Math.max(20, Math.abs(cy - fy))
      if (aspect) {
        if (w / h > aspect) w = h * aspect
        else h = w / aspect
      }
      const nx = d.mode.includes('w') ? fx - w : fx
      const ny = d.mode.includes('n') ? fy - h : fy
      if (nx >= 0 && ny >= 0 && nx + w <= doc.width && ny + h <= doc.height) setCropRect({ x: nx, y: ny, w, h })
    }
  }

  const onPointerUp = () => {
    drag.current = null
  }

  // ---------- local tools ----------
  const applyAdjust = () => commit(renderAdjusted(doc, adjust), tool === 'filters' ? `Filter: ${FILTER_PRESETS.find((p) => p.key === preset)?.name}` : 'Adjust')
  const applyCrop = () =>
    commit(
      crop(doc, { x: Math.round(cropRect.x), y: Math.round(cropRect.y), w: Math.round(cropRect.w), h: Math.round(cropRect.h) }),
      'Crop'
    )

  const filterThumbs = useMemo(() => {
    if (!doc || tool !== 'filters') return {}
    const small = scaledCopy(doc, 120)
    return Object.fromEntries(FILTER_PRESETS.map((p) => [p.key, renderAdjusted(small, p.adjust).toDataURL('image/jpeg', 0.8)]))
  }, [doc, tool])

  // ---------- AI tools ----------
  const runAi = async (label, fn) => {
    setBusy(label)
    setElapsed(0)
    setError('')
    try {
      await fn()
    } catch (err) {
      setError(
        /quota|exceeded|runs limit/i.test(err.message)
          ? "The lab's GPU allowance for today is used up. Local tools still work — try the AI tools again tomorrow."
          : err.message
      )
    } finally {
      setBusy('')
    }
  }

  const upload = async (canvas, space, type = 'image/jpeg') => {
    const small = scaledCopy(canvas, AI_MAX_SIDE)
    const blob = await canvasToBlob(small, type, 0.92)
    return uploadToSpace(space.proxy, blob, type === 'image/png' ? 'image.png' : 'image.jpg')
  }

  const aiEdit = (text) =>
    runAi('Editing with FLUX.1 Kontext…', async () => {
      const file = await upload(doc, EDITOR)
      const [image, meta, apiError] = await callSpace(EDITOR.proxy, 'edit', [file, text, -1])
      if (apiError) throw new Error(apiError)
      commit(await fetchResult(image.url, EDITOR), `AI: ${meta.instruction.slice(0, 32)}`)
    })

  const aiErase = () =>
    runAi('Removing with LaMa…', async () => {
      const mask = maskFromStrokes(doc.width, doc.height, strokes)
      const [file, maskFile] = await Promise.all([upload(doc, EDITOR), upload(mask, EDITOR, 'image/png')])
      const [image, , apiError] = await callSpace(EDITOR.proxy, 'erase', [file, maskFile])
      if (apiError) throw new Error(apiError)
      const patch = await fetchResult(image.url, EDITOR)
      // Only the painted area changes; the rest keeps full resolution.
      commit(compositeMasked(doc, patch, mask, Math.max(2, doc.width / 400)), 'Magic eraser')
      setStrokes([])
    })

  const aiUpscale = () =>
    runAi(`Upscaling ×${scale} with Real-ESRGAN…`, async () => {
      const small = scaledCopy(doc, 1024)
      const file = await uploadToSpace(STUDIO.proxy, await canvasToBlob(small, 'image/png'), 'image.png')
      const [image, , apiError] = await callSpace(STUDIO.proxy, 'upscale', [file, scale])
      if (apiError) throw new Error(apiError)
      commit(await fetchResult(image.url, STUDIO), `Upscale ×${scale}`)
    })

  const removeBackground = () =>
    runAi('Removing the background on your device…', async () => {
      if (!bgWorker.current) bgWorker.current = new Worker(new URL('../bgremover/bg.worker.js', import.meta.url), { type: 'module' })
      const id = ++bgJob.current
      const blob = await canvasToBlob(doc, 'image/png')
      const alpha = await new Promise((resolve, reject) => {
        bgWorker.current.onmessage = ({ data }) => {
          if (data.id !== id) return
          if (data.type === 'result') resolve(data.alpha)
          if (data.type === 'error') reject(new Error(data.message))
        }
        bgWorker.current.postMessage({ type: 'run', id, model: 'general', blob })
      })
      commit(applyAlpha(doc, alpha, bgColor), 'Remove background')
    })

  // ---------- export ----------
  const download = async () => {
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[exportType]
    let out = doc
    if (exportType === 'image/jpeg') {
      // JPEG has no alpha: flatten onto white.
      out = makeCanvas(doc.width, doc.height)
      const ctx = out.getContext('2d')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, out.width, out.height)
      ctx.drawImage(doc, 0, 0)
    }
    const blob = await canvasToBlob(out, exportType, quality)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${name}-edited.${ext}`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  // ---------- render ----------
  if (!doc) {
    return (
      <div className="flex flex-col gap-5">
        <button
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const f = e.dataTransfer.files?.[0]
            if (f) open(f, f.name)
          }}
          className={`flex min-h-96 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-8 text-center transition-all ${
            dragOver ? 'border-aqua bg-aqua/10' : 'border-white/20 bg-white/[0.03] hover:border-aqua/50'
          }`}
        >
          <span className="text-5xl">🖼️</span>
          <span className="text-lg font-medium">Drop a photo to start editing</span>
          <span className="text-sm text-neutral-500">JPG, PNG, WEBP · local edits never leave your device</span>
        </button>
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && open(e.target.files[0], e.target.files[0].name)} />
        <div>
          <Label>Or try one of these</Label>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                onClick={async () => open(await (await fetch(s.full)).blob(), s.id)}
                className="aspect-square cursor-pointer overflow-hidden rounded-xl border border-white/10 transition-all hover:border-aqua/50"
              >
                <img src={s.thumb} alt={s.id} loading="lazy" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
        {error && <p className="text-xs text-coral">{error}</p>}
      </div>
    )
  }

  const toolDef = TOOLS.find((t) => t.key === tool)
  const aiNeeded = { 'ai-edit': 'edit', erase: 'erase' }[tool]
  const aiReady = !aiNeeded || aiTools.has(aiNeeded)
  const cursor = tool === 'draw' || tool === 'erase' ? 'cursor-crosshair' : tool === 'text' ? 'cursor-move' : ''

  return (
    <div className="flex flex-col gap-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-primary/70 p-2">
        <GhostButton onClick={() => inputRef.current?.click()} disabled={!!busy}>
          📂 Open
        </GhostButton>
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && open(e.target.files[0], e.target.files[0].name)} />
        <span className="mx-1 h-6 w-px bg-white/10" />
        <GhostButton onClick={undo} disabled={index <= 0 || !!busy} title="Undo (Ctrl+Z)">
          ↶ Undo
        </GhostButton>
        <GhostButton onClick={redo} disabled={index >= history.length - 1 || !!busy} title="Redo (Ctrl+Shift+Z)">
          ↷ Redo
        </GhostButton>
        <button
          onPointerDown={() => setCompare(true)}
          onPointerUp={() => setCompare(false)}
          onPointerLeave={() => setCompare(false)}
          disabled={index === 0}
          className="cursor-pointer rounded-lg border border-white/10 px-3 py-2 text-xs text-neutral-300 select-none hover:border-aqua/40 disabled:opacity-40"
        >
          👁 Hold to compare
        </button>
        <span className="ml-auto font-mono text-[10px] text-neutral-500">
          {doc.width}×{doc.height} · {history[index]?.label}
        </span>
        <select value={exportType} onChange={(e) => setExportType(e.target.value)} className="rounded-lg border border-white/10 bg-primary px-2 py-2 text-xs">
          <option value="image/png">PNG</option>
          <option value="image/jpeg">JPEG</option>
          <option value="image/webp">WEBP</option>
        </select>
        {exportType !== 'image/png' && (
          <input type="range" min={0.5} max={1} step={0.02} value={quality} onChange={(e) => setQuality(+e.target.value)} title={`Quality ${Math.round(quality * 100)}%`} className="w-20 accent-lavender" />
        )}
        <button onClick={download} disabled={!!busy} className="cursor-pointer rounded-lg bg-radial from-lavender to-royal px-4 py-2 text-xs font-medium hover-animation">
          ↓ Download
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[84px_1fr_300px]">
        {/* Tool rail */}
        <div className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
          {TOOLS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTool(t.key)}
              disabled={!!busy}
              className={`flex min-w-[70px] cursor-pointer flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11px] transition-all ${
                tool === t.key ? 'border-lavender bg-lavender/20 text-white' : 'border-white/10 text-neutral-400 hover:border-aqua/40 hover:text-white'
              }`}
            >
              <span className="text-lg">{t.icon}</span>
              {t.label}
              {t.ai && <span className="font-mono text-[8px] text-aqua">AI</span>}
            </button>
          ))}
        </div>

        {/* Canvas */}
        <div
          ref={stageRef}
          className="relative flex min-h-80 items-center justify-center overflow-hidden rounded-2xl border border-white/10 p-3"
          style={{ background: CHECKER }}
        >
          <canvas
            ref={displayRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className={`max-h-[70vh] max-w-full touch-none shadow-2xl ${cursor}`}
          />
          {compare && <span className="absolute top-3 left-3 rounded-full bg-black/70 px-2 py-0.5 font-mono text-[10px]">ORIGINAL</span>}
          {busy && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-primary/70 backdrop-blur-[2px]">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              <p className="text-sm">
                {busy} {elapsed}s
              </p>
              {elapsed > 12 && <p className="text-xs text-neutral-400">The first run can take up to a minute while the GPU wakes up.</p>}
            </div>
          )}
        </div>

        {/* Properties */}
        <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-gradient-to-b from-storm/80 to-indigo/80 p-4 lg:self-start">
          <p className="text-base font-semibold">
            {toolDef.icon} {toolDef.label}
          </p>

          {tool === 'adjust' && (
            <>
              {SLIDERS.map(([key, label, min, max]) => (
                <label key={key} className="block">
                  <span className="flex justify-between text-xs text-neutral-300">
                    {label}
                    <span className="font-mono text-aqua">{adjust[key]}</span>
                  </span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    value={adjust[key]}
                    onChange={(e) => setAdjust((a) => ({ ...a, [key]: +e.target.value }))}
                    onDoubleClick={() => setAdjust((a) => ({ ...a, [key]: DEFAULT_ADJUST[key] }))}
                    className="mt-1 w-full accent-lavender"
                  />
                </label>
              ))}
              <div className="grid grid-cols-2 gap-2">
                <GhostButton onClick={() => setAdjust(DEFAULT_ADJUST)}>Reset</GhostButton>
                <PrimaryButton onClick={applyAdjust}>Apply</PrimaryButton>
              </div>
              <p className="text-[11px] text-neutral-500">Double-click a slider to reset it.</p>
            </>
          )}

          {tool === 'filters' && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {FILTER_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => {
                      setPreset(p.key)
                      setAdjust({ ...DEFAULT_ADJUST, ...p.adjust })
                    }}
                    className={`cursor-pointer overflow-hidden rounded-lg border text-[10px] transition-all ${preset === p.key ? 'border-lavender ring-1 ring-lavender' : 'border-white/10 hover:border-aqua/40'}`}
                  >
                    {filterThumbs[p.key] && <img src={filterThumbs[p.key]} alt="" className="aspect-square w-full object-cover" />}
                    <span className="block py-1">{p.name}</span>
                  </button>
                ))}
              </div>
              <PrimaryButton onClick={applyAdjust} disabled={preset === 'original'}>
                Apply filter
              </PrimaryButton>
            </>
          )}

          {tool === 'crop' && (
            <>
              <div>
                <Label>Aspect</Label>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ASPECTS.map(([label, value]) => (
                    <GhostButton
                      key={label}
                      active={aspect === value}
                      onClick={() => {
                        setAspect(value)
                        setCropRect(fitAspect(doc.width, doc.height, value))
                      }}
                    >
                      {label}
                    </GhostButton>
                  ))}
                </div>
              </div>
              <div>
                <Label>Rotate & flip</Label>
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  <GhostButton onClick={() => commit(rotate90(doc, -1), 'Rotate left')}>⟲</GhostButton>
                  <GhostButton onClick={() => commit(rotate90(doc, 1), 'Rotate right')}>⟳</GhostButton>
                  <GhostButton onClick={() => commit(flip(doc, true), 'Flip horizontal')}>⇋</GhostButton>
                  <GhostButton onClick={() => commit(flip(doc, false), 'Flip vertical')}>⇵</GhostButton>
                </div>
              </div>
              {cropRect && (
                <p className="font-mono text-[11px] text-neutral-400">
                  {Math.round(cropRect.w)}×{Math.round(cropRect.h)} px · drag the frame or its corners
                </p>
              )}
              <PrimaryButton onClick={applyCrop}>Apply crop</PrimaryButton>
            </>
          )}

          {tool === 'text' && (
            <>
              <textarea
                value={text.value}
                onChange={(e) => setText((t) => ({ ...t, value: e.target.value }))}
                rows={2}
                className="w-full rounded-lg border border-white/10 bg-white/5 p-2 text-sm outline-none focus:border-aqua/50"
              />
              <div className="grid grid-cols-2 gap-2">
                <select value={text.font} onChange={(e) => setText((t) => ({ ...t, font: e.target.value }))} className="rounded-lg border border-white/10 bg-primary px-2 py-2 text-xs">
                  <option value="sans">Sans</option>
                  <option value="serif">Serif</option>
                  <option value="mono">Mono</option>
                  <option value="impact">Impact</option>
                </select>
                <select value={text.weight} onChange={(e) => setText((t) => ({ ...t, weight: +e.target.value }))} className="rounded-lg border border-white/10 bg-primary px-2 py-2 text-xs">
                  <option value={400}>Regular</option>
                  <option value={700}>Bold</option>
                  <option value={900}>Black</option>
                </select>
              </div>
              <label className="block text-xs text-neutral-300">
                Size <span className="font-mono text-aqua">{text.size}px</span>
                <input type="range" min={12} max={Math.round(doc.width / 3)} value={text.size} onChange={(e) => setText((t) => ({ ...t, size: +e.target.value }))} className="mt-1 w-full accent-lavender" />
              </label>
              <div className="flex items-center gap-3 text-xs text-neutral-300">
                <input type="color" value={text.color} onChange={(e) => setText((t) => ({ ...t, color: e.target.value }))} className="h-8 w-10 cursor-pointer rounded border border-white/10 bg-transparent" />
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={text.shadow} onChange={(e) => setText((t) => ({ ...t, shadow: e.target.checked }))} className="accent-lavender" /> Shadow
                </label>
              </div>
              <p className="text-[11px] text-neutral-500">Drag on the image to position the text.</p>
              <PrimaryButton onClick={() => commit(bakeText(doc, text), 'Text')} disabled={!text.value.trim()}>
                Add text
              </PrimaryButton>
            </>
          )}

          {tool === 'draw' && (
            <>
              <div className="flex items-center gap-3 text-xs text-neutral-300">
                <input type="color" value={brush.color} onChange={(e) => setBrush((b) => ({ ...b, color: e.target.value }))} className="h-8 w-10 cursor-pointer rounded border border-white/10 bg-transparent" />
                Brush color
              </div>
              <label className="block text-xs text-neutral-300">
                Size <span className="font-mono text-aqua">{brush.size}</span>
                <input type="range" min={2} max={120} value={brush.size} onChange={(e) => setBrush((b) => ({ ...b, size: +e.target.value }))} className="mt-1 w-full accent-lavender" />
              </label>
              <label className="block text-xs text-neutral-300">
                Opacity <span className="font-mono text-aqua">{Math.round(brush.opacity * 100)}%</span>
                <input type="range" min={0.1} max={1} step={0.05} value={brush.opacity} onChange={(e) => setBrush((b) => ({ ...b, opacity: +e.target.value }))} className="mt-1 w-full accent-lavender" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <GhostButton onClick={() => setStrokes([])} disabled={!strokes.length}>
                  Clear
                </GhostButton>
                <PrimaryButton onClick={() => commit(bakeStrokes(doc, strokes), 'Drawing')} disabled={!strokes.length}>
                  Apply
                </PrimaryButton>
              </div>
            </>
          )}

          {tool === 'ai-edit' && (
            <>
              <p className="text-xs text-neutral-400">Describe the change. FLUX.1 Kontext keeps the rest of the photo intact.</p>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={3}
                maxLength={400}
                placeholder="e.g. Make it a snowy winter scene"
                className="w-full rounded-lg border border-white/10 bg-white/5 p-2 text-sm outline-none focus:border-aqua/50"
              />
              <div className="flex flex-wrap gap-1.5">
                {EDIT_IDEAS.map((idea) => (
                  <button
                    key={idea}
                    onClick={() => setInstruction(idea)}
                    className="cursor-pointer rounded-full border border-white/10 px-2 py-1 text-[10px] text-neutral-400 hover:border-aqua/40 hover:text-white"
                  >
                    {idea}
                  </button>
                ))}
              </div>
              <PrimaryButton onClick={() => aiEdit(instruction.trim())} disabled={!aiReady || !instruction.trim() || !!busy}>
                ✨ Apply AI edit
              </PrimaryButton>
              <p className="text-[11px] text-neutral-500">Works at ~1 megapixel. Undo is one click away.</p>
            </>
          )}

          {tool === 'erase' && (
            <>
              <p className="text-xs text-neutral-400">Paint over people, objects or text to remove. LaMa fills the gap with matching background.</p>
              <label className="block text-xs text-neutral-300">
                Brush <span className="font-mono text-aqua">{eraseSize}</span>
                <input type="range" min={8} max={150} value={eraseSize} onChange={(e) => setEraseSize(+e.target.value)} className="mt-1 w-full accent-lavender" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <GhostButton onClick={() => setStrokes([])} disabled={!strokes.length}>
                  Clear mask
                </GhostButton>
                <PrimaryButton onClick={aiErase} disabled={!aiReady || !strokes.length || !!busy}>
                  🧽 Erase
                </PrimaryButton>
              </div>
            </>
          )}

          {tool === 'background' && (
            <>
              <p className="text-xs text-neutral-400">Runs RMBG-1.4 on your device. Pick a new background, or keep it transparent.</p>
              <div className="flex flex-wrap gap-2">
                {BG_COLORS.map((c) => (
                  <button
                    key={c || 'none'}
                    onClick={() => setBgColor(c)}
                    title={c || 'Transparent'}
                    className={`h-8 w-8 cursor-pointer rounded-lg border-2 ${bgColor === c ? 'border-aqua' : 'border-white/10'}`}
                    style={{ background: c || CHECKER }}
                  />
                ))}
              </div>
              <PrimaryButton onClick={removeBackground} disabled={!!busy}>
                🪄 Remove background
              </PrimaryButton>
              <p className="text-[11px] text-neutral-500">First use downloads a 44 MB model (cached afterwards). Export as PNG to keep transparency.</p>
            </>
          )}

          {tool === 'upscale' && (
            <>
              <p className="text-xs text-neutral-400">Real-ESRGAN on a GPU. The image is first fitted to 1024px, then enlarged.</p>
              <div className="grid grid-cols-2 gap-2">
                {[2, 4].map((s) => (
                  <GhostButton key={s} active={scale === s} onClick={() => setScale(s)}>
                    ×{s} →{' '}
                    {Math.round(scaledCopy(doc, 1024).width * s)}px
                  </GhostButton>
                ))}
              </div>
              <PrimaryButton onClick={aiUpscale} disabled={!!busy}>
                🔍 Upscale
              </PrimaryButton>
            </>
          )}

          {aiNeeded && !aiReady && (
            <p className="rounded-lg border border-sand/30 bg-sand/5 p-2 text-[11px] text-sand">This AI tool is starting up or not available yet. Try again in a minute.</p>
          )}
          {notice && <p className="text-[11px] text-sand">{notice}</p>}
          {error && (
            <p className="rounded-lg border border-coral/30 bg-coral/5 p-2 text-xs text-coral" role="alert">
              {error}
            </p>
          )}

          <div className="border-t border-white/10 pt-3">
            <Label>History</Label>
            <ol className="mt-2 flex max-h-40 flex-col gap-0.5 overflow-y-auto">
              {history.map((h, i) => (
                <li key={i}>
                  <button
                    onClick={() => setIndex(i)}
                    className={`w-full cursor-pointer truncate rounded px-2 py-1 text-left text-[11px] ${
                      i === index ? 'bg-lavender/25 text-white' : i > index ? 'text-neutral-600' : 'text-neutral-400 hover:bg-white/5'
                    }`}
                  >
                    {i + 1}. {h.label}
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ImageEditor
