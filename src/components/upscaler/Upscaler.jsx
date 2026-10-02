import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { callSpace, uploadToSpace, wakeSpace } from '../../lib/gradio.js'
import { idbAll } from '../../lib/idb.js'

// Real-ESRGAN x4 lives on the Image Studio Space (/upscale). Uploads go
// through the same-origin proxy; the (large) result is fetched straight from
// the Space, which allows this origin via CORS — the proxy caps bodies at 4.5 MB.
const SPACE_URL = '/hf/image-studio'
const SPACE_ORIGIN = 'https://felikskdm-image-studio.hf.space'
const MAX_INPUT = 1024

const SAMPLES = ['fisherman', 'glass-bird', 'robot-watch', 'koi-pond', 'anime-shrine'].map((id) => ({
  id,
  src: `${import.meta.env.BASE_URL}image-studio/gallery/${id}-sm.webp`,
}))

const Label = ({ children }) => <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">{children}</p>

/** Downscale to MAX_INPUT on the longest side and re-encode compactly for upload. */
async function prepare(blob) {
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, MAX_INPUT / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = new OffscreenCanvas(w, h)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const out = await canvas.convertToBlob({ type: 'image/webp', quality: 0.95 })
  return { blob: out, url: URL.createObjectURL(out), w, h, shrunk: scale < 1 }
}

const Upscaler = () => {
  const [source, setSource] = useState(null) // { blob, url, w, h, name, shrunk }
  const [scale, setScale] = useState(4)
  const [result, setResult] = useState(null) // { url, meta }
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const [split, setSplit] = useState(50)
  const [zoom, setZoom] = useState(false)
  const [origin, setOrigin] = useState('50% 50%')
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)
  const stageRef = useRef(null)

  const [params] = useSearchParams()

  useEffect(() => wakeSpace(SPACE_URL), [])

  // Arriving from Image Studio's "Upscale" button: ?from=gallery:<id> or mine:<id>.
  useEffect(() => {
    const from = params.get('from')
    if (!from) return
    const [kind, id] = from.split(':')
    ;(async () => {
      try {
        if (kind === 'gallery' && /^[\w-]+$/.test(id)) {
          const res = await fetch(`${import.meta.env.BASE_URL}image-studio/gallery/${id}.webp`)
          if (res.ok) open(await res.blob(), `${id}.webp`)
        } else if (kind === 'mine') {
          const rec = (await idbAll('images')).find((r) => r.id === id)
          if (rec) open(rec.blob, `image-studio-${rec.meta.seed}.webp`)
        }
      } catch {
        /* fall back to the empty state */
      }
    })()
  }, [params])
  useEffect(() => () => source?.url && URL.revokeObjectURL(source.url), [source])
  useEffect(() => () => result?.url && URL.revokeObjectURL(result.url), [result])
  useEffect(() => {
    if (!busy) return
    const t0 = performance.now()
    const id = setInterval(() => setElapsed(Math.floor((performance.now() - t0) / 1000)), 250)
    return () => clearInterval(id)
  }, [busy])

  const open = async (blob, name) => {
    if (!blob?.type?.startsWith('image/')) {
      setError('That isn’t an image file.')
      return
    }
    setError('')
    setResult(null)
    try {
      setSource({ ...(await prepare(blob)), name })
    } catch {
      setError('Couldn’t open that image. Try a JPG, PNG or WEBP.')
    }
  }

  const run = async () => {
    if (!source || busy) return
    setBusy(true)
    setElapsed(0)
    setError('')
    setResult(null)
    try {
      const file = await uploadToSpace(SPACE_URL, source.blob, 'input.webp')
      const [image, meta, apiError] = await callSpace(SPACE_URL, 'upscale', [file, scale])
      if (apiError) throw new Error(apiError)
      const direct = image.url.replace(/^https?:\/\/[^/]+/, SPACE_ORIGIN)
      let res = await fetch(direct).catch(() => null)
      if (!res?.ok) res = await fetch(image.url.replace(/^https?:\/\/[^/]+/, SPACE_URL))
      if (!res.ok) throw new Error(`Couldn't download the result (${res.status}).`)
      const blob = new Blob([await res.arrayBuffer()], { type: 'image/webp' })
      setResult({ url: URL.createObjectURL(blob), meta, size: blob.size })
      setSplit(50)
    } catch (err) {
      setError(
        /quota|exceeded|runs limit/i.test(err.message)
          ? "The lab's GPU allowance for today is used up. Please try again tomorrow."
          : err.message
      )
    } finally {
      setBusy(false)
    }
  }

  const download = () => {
    const a = document.createElement('a')
    a.href = result.url
    a.download = `${(source.name || 'image').replace(/\.[^.]+$/, '')}-x${result.meta.scale}.webp`
    a.click()
  }

  const onMove = (e) => {
    const rect = stageRef.current.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * 100
    const py = ((e.clientY - rect.top) / rect.height) * 100
    if (zoom) setOrigin(`${px}% ${py}%`)
    else if (e.buttons === 1) setSplit(Math.min(100, Math.max(0, px)))
  }

  const layer = { transform: zoom ? 'scale(3)' : 'none', transformOrigin: origin }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        {source ? (
          <div className="flex flex-col gap-3">
            <div
              ref={stageRef}
              onPointerDown={(e) => {
                if (!result || zoom) return
                e.currentTarget.setPointerCapture(e.pointerId)
                onMove(e)
              }}
              onPointerMove={(e) => result && onMove(e)}
              className={`relative mx-auto w-full touch-none overflow-hidden rounded-2xl border border-white/10 bg-black select-none ${zoom ? 'cursor-zoom-in' : result ? 'cursor-ew-resize' : ''}`}
              style={{ aspectRatio: `${source.w} / ${source.h}`, maxWidth: `calc(70vh * ${source.w / source.h})` }}
            >
              {result && <img src={result.url} alt="Upscaled" draggable={false} className="absolute inset-0 h-full w-full" style={layer} />}
              <img
                src={source.url}
                alt="Original"
                draggable={false}
                className="absolute inset-0 h-full w-full"
                style={{ ...layer, ...(result ? { clipPath: `inset(0 ${100 - split}% 0 0)` } : {}) }}
              />
              {result && (
                <>
                  <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_12px_rgba(0,0,0,0.8)]" style={{ left: `${split}%` }} />
                  <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[10px]">
                    ORIGINAL {source.w}×{source.h}
                  </span>
                  <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[10px]">
                    ×{result.meta.scale} {result.meta.width}×{result.meta.height}
                  </span>
                </>
              )}
              {busy && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-primary/60 backdrop-blur-[2px]">
                  <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  <p className="text-sm">Upscaling on the GPU… {elapsed}s</p>
                  {elapsed > 10 && <p className="text-xs text-neutral-400">The first run can take up to a minute while the GPU wakes up.</p>}
                </div>
              )}
            </div>
            {result && (
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={() => setZoom((z) => !z)}
                  className={`cursor-pointer rounded-full border px-4 py-1.5 text-xs transition-colors ${zoom ? 'border-aqua text-aqua' : 'border-white/15 text-neutral-300 hover:text-white'}`}
                >
                  🔍 {zoom ? 'Zoom on — move over the image' : 'Zoom ×3 to inspect detail'}
                </button>
                <p className="font-mono text-[10px] text-neutral-500">
                  {zoom ? 'drag is off while zoomed' : 'drag to compare'} · {result.meta.seconds}s on GPU · {(result.size / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
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
            <span className="text-5xl">🔍</span>
            <span className="text-lg font-medium">Drop a low-resolution image</span>
            <span className="text-sm text-neutral-500">JPG, PNG, WEBP · up to {MAX_INPUT}px in, up to {MAX_INPUT * 4}px out</span>
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

      <div className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-gradient-to-b from-storm/80 to-indigo/80 p-5 lg:sticky lg:top-28 lg:self-start">
        <div>
          <Label>Scale</Label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[2, 4].map((s) => (
              <button
                key={s}
                onClick={() => setScale(s)}
                className={`cursor-pointer rounded-xl border p-3 text-left transition-all ${scale === s ? 'border-lavender bg-lavender/15' : 'border-white/10 hover:border-aqua/40'}`}
              >
                <p className="text-lg font-semibold">×{s}</p>
                <p className="text-[11px] text-neutral-400">{source ? `${source.w * s}×${source.h * s}` : s === 2 ? 'sharper, smaller file' : 'maximum detail'}</p>
              </button>
            ))}
          </div>
        </div>
        {source?.shrunk && <p className="-mt-2 text-[11px] text-sand">Large input was resized to {MAX_INPUT}px first.</p>}
        <button
          onClick={run}
          disabled={!source || busy}
          className="w-full cursor-pointer rounded-full bg-radial from-lavender to-royal px-6 py-3.5 text-sm font-medium hover-animation disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? `Upscaling… ${elapsed}s` : `⤢ Upscale ×${scale}`}
        </button>
        {result && (
          <button
            onClick={download}
            className="-mt-2 w-full cursor-pointer rounded-full border border-white/15 py-2.5 text-sm text-neutral-200 transition-colors hover:border-aqua/50"
          >
            ↓ Download {result.meta.width}×{result.meta.height}
          </button>
        )}
        {source && (
          <button onClick={() => inputRef.current?.click()} className="-mt-2 cursor-pointer text-xs text-neutral-400 hover:text-white">
            Use another image
          </button>
        )}
        <div>
          <Label>Or try a 512px sample</Label>
          <div className="mt-2 grid grid-cols-5 gap-1.5">
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                disabled={busy}
                onClick={async () => open(await (await fetch(s.src)).blob(), `${s.id}.webp`)}
                className="aspect-square cursor-pointer overflow-hidden rounded-lg border border-white/10 transition-all hover:border-aqua/50"
              >
                <img src={s.src} alt={s.id} loading="lazy" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
        <p className="border-t border-white/10 pt-4 font-mono text-[10px] leading-relaxed text-neutral-500">
          REAL-ESRGAN ×4 (BSD-3) on a Hugging Face ZeroGPU Space · images are processed and discarded, never stored.
        </p>
      </div>
    </div>
  )
}

export default Upscaler
