import { useCallback, useEffect, useRef, useState } from 'react'

const MAX_SIDE = 2560 // larger photos are scaled down first to keep memory sane

const MODELS = [
  { key: 'general', name: 'General', detail: 'RMBG-1.4 · 44 MB · objects, products, people' },
  { key: 'portrait', name: 'Portrait', detail: 'MODNet · 7 MB · people, near-instant' },
]

const SAMPLES = ['fisherman', 'espresso', 'barista', 'fox-snow', 'sports-car'].map((id) => ({
  id,
  src: `${import.meta.env.BASE_URL}image-studio/gallery/${id}.webp`,
  thumb: `${import.meta.env.BASE_URL}image-studio/gallery/${id}-sm.webp`,
}))

const COLORS = ['#ffffff', '#000000', '#7a57db', '#33c2cc', '#ea4884', '#d6995c', '#57db96', '#e5e7eb']
const GRADIENTS = [
  ['#7a57db', '#33c2cc'],
  ['#ea4884', '#d6995c'],
  ['#1f1e39', '#5c33cc'],
  ['#57db96', '#33c2cc'],
]

const CHECKER =
  'repeating-conic-gradient(#2a2d4a 0% 25%, #1c1e36 0% 50%) 50% / 20px 20px'

const Label = ({ children, right }) => (
  <div className="flex items-baseline justify-between gap-3">
    <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">{children}</p>
    {right}
  </div>
)

async function loadBitmap(blob) {
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  if (scale === 1) return { bitmap, blob }
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale))
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const scaled = await canvas.convertToBlob({ type: 'image/png' })
  return { bitmap: await createImageBitmap(scaled), blob: scaled }
}

/** Draw background + cut-out subject onto `canvas`. */
function compose(canvas, bitmap, mask, bg, bgImage) {
  const { width, height } = bitmap
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, width, height)

  if (bg.type === 'color') {
    ctx.fillStyle = bg.value
    ctx.fillRect(0, 0, width, height)
  } else if (bg.type === 'gradient') {
    const g = ctx.createLinearGradient(0, 0, width, height)
    g.addColorStop(0, bg.value[0])
    g.addColorStop(1, bg.value[1])
    ctx.fillStyle = g
    ctx.fillRect(0, 0, width, height)
  } else if (bg.type === 'blur') {
    const r = Math.max(4, Math.round(Math.max(width, height) / 60))
    ctx.filter = `blur(${r}px)`
    // Overdraw the edges so the blur doesn't fade to transparent.
    ctx.drawImage(bitmap, -r * 2, -r * 2, width + r * 4, height + r * 4)
    ctx.filter = 'none'
  } else if (bg.type === 'image' && bgImage) {
    const s = Math.max(width / bgImage.width, height / bgImage.height)
    const w = bgImage.width * s
    const h = bgImage.height * s
    ctx.drawImage(bgImage, (width - w) / 2, (height - h) / 2, w, h)
  }

  // Subject: the original pixels with the model's alpha mask applied.
  const cut = new OffscreenCanvas(width, height)
  const cctx = cut.getContext('2d')
  cctx.drawImage(bitmap, 0, 0)
  const pixels = cctx.getImageData(0, 0, width, height)
  for (let i = 0; i < mask.alpha.length; i++) pixels.data[i * 4 + 3] = mask.alpha[i]
  cctx.putImageData(pixels, 0, 0)
  ctx.drawImage(cut, 0, 0)
}

const BgRemover = () => {
  const [model, setModel] = useState('general')
  const [source, setSource] = useState(null) // { url, name, bitmap, blob }
  const [mask, setMask] = useState(null) // { width, height, alpha, model }
  const [status, setStatus] = useState('idle') // idle | working | done
  const [progress, setProgress] = useState(null) // download progress 0..1 while a model loads
  const [device, setDevice] = useState('')
  const [ms, setMs] = useState(0)
  const [bg, setBg] = useState({ type: 'transparent' })
  const [bgImage, setBgImage] = useState(null) // ImageBitmap
  const [split, setSplit] = useState(50)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const workerRef = useRef(null)
  const canvasRef = useRef(null)
  const inputRef = useRef(null)
  const bgInputRef = useRef(null)
  const jobRef = useRef(0)
  const stageRef = useRef(null)

  useEffect(() => {
    const worker = new Worker(new URL('./bg.worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') setProgress(data.value)
      else if (data.type === 'ready') {
        setProgress(null)
        setDevice(data.device)
      } else if (data.id !== jobRef.current) return
      else if (data.type === 'result') {
        setMask({ width: data.width, height: data.height, alpha: data.alpha })
        setMs(data.ms)
        setStatus('done')
      } else if (data.type === 'error') {
        setError(`Couldn't process this image (${data.message}).`)
        setStatus('idle')
        setProgress(null)
      }
    }
    workerRef.current = worker
    return () => worker.terminate()
  }, [])

  useEffect(() => () => source?.url && URL.revokeObjectURL(source.url), [source])

  const run = useCallback((src, m) => {
    const id = ++jobRef.current
    setMask(null)
    setError('')
    setStatus('working')
    setSplit(50)
    workerRef.current.postMessage({ type: 'run', id, model: m, blob: src.blob })
  }, [])

  const open = async (blob, name) => {
    if (!blob?.type?.startsWith('image/')) {
      setError('That isn’t an image file.')
      return
    }
    try {
      const { bitmap, blob: scaled } = await loadBitmap(blob)
      const src = { url: URL.createObjectURL(scaled), name, bitmap, blob: scaled }
      setSource(src)
      run(src, model)
    } catch {
      setError('Couldn’t open that image. Try a JPG, PNG or WEBP.')
    }
  }

  const openSample = async (s) => {
    const res = await fetch(s.src)
    open(await res.blob(), `${s.id}.webp`)
  }

  const switchModel = (m) => {
    setModel(m)
    if (source) run(source, m)
  }

  // Recompose whenever the mask or background changes.
  useEffect(() => {
    if (status === 'done' && mask && source && canvasRef.current) compose(canvasRef.current, source.bitmap, mask, bg, bgImage)
  }, [status, mask, source, bg, bgImage])

  const pickBgImage = async (file) => {
    if (!file?.type?.startsWith('image/')) return
    const bitmap = await createImageBitmap(file)
    setBgImage(bitmap)
    setBg({ type: 'image' })
  }

  const download = () => {
    canvasRef.current?.toBlob((blob) => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${(source?.name || 'image').replace(/\.[^.]+$/, '')}-cutout.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    }, 'image/png')
  }

  const dragSplit = (e) => {
    const rect = stageRef.current.getBoundingClientRect()
    setSplit(Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)))
  }

  const isBg = (type, value) => bg.type === type && (value === undefined || JSON.stringify(bg.value) === JSON.stringify(value))

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      {/* Stage */}
      <div className="min-w-0">
        {source ? (
          <div className="flex flex-col gap-3">
            <div
              ref={stageRef}
              className="relative mx-auto max-h-[70vh] w-full touch-none overflow-hidden rounded-2xl border border-white/10 select-none"
              style={{ aspectRatio: `${source.bitmap.width} / ${source.bitmap.height}`, background: CHECKER, maxWidth: `calc(70vh * ${source.bitmap.width / source.bitmap.height})` }}
              onPointerDown={(e) => {
                if (status !== 'done') return
                e.currentTarget.setPointerCapture(e.pointerId)
                dragSplit(e)
              }}
              onPointerMove={(e) => e.buttons === 1 && status === 'done' && dragSplit(e)}
            >
              <canvas ref={canvasRef} className={`absolute inset-0 h-full w-full ${status === 'done' ? '' : 'hidden'}`} />
              <img
                src={source.url}
                alt="Original"
                draggable={false}
                className="absolute inset-0 h-full w-full"
                style={status === 'done' ? { clipPath: `inset(0 ${100 - split}% 0 0)` } : undefined}
              />
              {status === 'done' && (
                <>
                  <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_12px_rgba(0,0,0,0.8)]" style={{ left: `${split}%` }}>
                    <span className="absolute top-1/2 left-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-xs font-bold text-primary shadow-lg">
                      ⇆
                    </span>
                  </div>
                  <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[10px]">BEFORE</span>
                  <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[10px]">AFTER</span>
                </>
              )}
              {status === 'working' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-primary/60 backdrop-blur-[2px]">
                  <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  <p className="text-sm">
                    {progress != null ? `Downloading the model… ${Math.round(progress * 100)}% (one time)` : 'Removing background…'}
                  </p>
                </div>
              )}
            </div>
            {status === 'done' && (
              <p className="text-center font-mono text-[10px] text-neutral-500">
                Drag across the image to compare · processed in {(ms / 1000).toFixed(1)}s on your {device === 'webgpu' ? 'GPU (WebGPU)' : 'CPU'}
              </p>
            )}
          </div>
        ) : (
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
            <span className="text-5xl">✂️</span>
            <span className="text-lg font-medium">Drop an image or click to upload</span>
            <span className="text-sm text-neutral-500">JPG, PNG, WEBP · processed on your device, never uploaded</span>
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) open(f, f.name)
            e.target.value = ''
          }}
        />
        {error && (
          <p className="mt-3 rounded-lg border border-coral/30 bg-coral/5 p-3 text-xs text-coral" role="alert">
            {error}
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-gradient-to-b from-storm/80 to-indigo/80 p-5 lg:sticky lg:top-28 lg:self-start">
        <div>
          <Label>Model</Label>
          <div className="mt-2 flex flex-col gap-2">
            {MODELS.map((m) => (
              <button
                key={m.key}
                onClick={() => switchModel(m.key)}
                disabled={status === 'working'}
                aria-pressed={model === m.key}
                className={`cursor-pointer rounded-xl border p-3 text-left transition-all disabled:cursor-wait ${
                  model === m.key ? 'border-lavender bg-lavender/15' : 'border-white/10 hover:border-aqua/40'
                }`}
              >
                <p className="text-sm font-medium">{m.name}</p>
                <p className="text-[11px] text-neutral-400">{m.detail}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>Background</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() => setBg({ type: 'transparent' })}
              title="Transparent"
              className={`h-9 w-9 cursor-pointer rounded-lg border-2 ${isBg('transparent') ? 'border-aqua' : 'border-white/10'}`}
              style={{ background: CHECKER }}
            />
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setBg({ type: 'color', value: c })}
                title={c}
                className={`h-9 w-9 cursor-pointer rounded-lg border-2 ${isBg('color', c) ? 'border-aqua' : 'border-white/10'}`}
                style={{ background: c }}
              />
            ))}
            <label
              title="Custom color"
              className={`relative grid h-9 w-9 cursor-pointer place-items-center overflow-hidden rounded-lg border-2 text-xs ${
                bg.type === 'color' && !COLORS.includes(bg.value) ? 'border-aqua' : 'border-white/10'
              }`}
              style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}
            >
              <input
                type="color"
                onChange={(e) => setBg({ type: 'color', value: e.target.value })}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
            {GRADIENTS.map((g) => (
              <button
                key={g.join()}
                onClick={() => setBg({ type: 'gradient', value: g })}
                className={`h-9 w-9 cursor-pointer rounded-lg border-2 ${isBg('gradient', g) ? 'border-aqua' : 'border-white/10'}`}
                style={{ background: `linear-gradient(135deg, ${g[0]}, ${g[1]})` }}
              />
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              onClick={() => setBg({ type: 'blur' })}
              className={`cursor-pointer rounded-lg border px-3 py-2 text-xs transition-colors ${isBg('blur') ? 'border-aqua text-white' : 'border-white/10 text-neutral-400 hover:text-white'}`}
            >
              🌫️ Blur original
            </button>
            <button
              onClick={() => bgInputRef.current?.click()}
              className={`cursor-pointer rounded-lg border px-3 py-2 text-xs transition-colors ${isBg('image') ? 'border-aqua text-white' : 'border-white/10 text-neutral-400 hover:text-white'}`}
            >
              🖼️ Your image
            </button>
            <input ref={bgInputRef} type="file" accept="image/*" hidden onChange={(e) => pickBgImage(e.target.files?.[0])} />
          </div>
        </div>

        <button
          onClick={download}
          disabled={status !== 'done'}
          className="w-full cursor-pointer rounded-full bg-radial from-lavender to-royal px-6 py-3.5 text-sm font-medium hover-animation disabled:cursor-not-allowed disabled:opacity-50"
        >
          ↓ Download PNG
        </button>
        {source && (
          <button
            onClick={() => inputRef.current?.click()}
            className="-mt-2 cursor-pointer text-xs text-neutral-400 transition-colors hover:text-white"
          >
            Use another image
          </button>
        )}

        <div>
          <Label>Or try a sample</Label>
          <div className="mt-2 grid grid-cols-5 gap-1.5">
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                onClick={() => openSample(s)}
                disabled={status === 'working'}
                className="aspect-square cursor-pointer overflow-hidden rounded-lg border border-white/10 transition-all hover:border-aqua/50 disabled:cursor-wait"
              >
                <img src={s.thumb} alt={s.id} loading="lazy" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        <p className="border-t border-white/10 pt-4 font-mono text-[10px] leading-relaxed text-neutral-500">
          RUNS 100% IN YOUR BROWSER · images never leave your device. RMBG-1.4 by BRIA AI (non-commercial license),
          MODNet (Apache-2.0).
        </p>
      </div>
    </div>
  )
}

export default BgRemover
