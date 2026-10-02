import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { callSpace, wakeSpace } from '../../lib/gradio.js'
import { idbAll, idbClear, idbDelete, idbPut } from '../../lib/idb.js'
import {
  ASPECTS,
  MAX_PROMPT,
  MODELS,
  PROMPT_IDEAS,
  SPACE_URL,
  STYLES,
  galleryImage,
  galleryThumb,
} from './config.js'
import GALLERY from './gallery.json'

const MAX_BATCH = 4
const FAVORITES_KEY = 'image-studio:favorites'

// A varied handful from the gallery for the empty Create view.
const INSPIRATION = ['floating-city', 'fisherman', 'anime-shrine', 'ramen-alley', 'koi-pond', 'robot-watch']
  .map((id) => GALLERY.find((g) => g.id === id))
  .filter(Boolean)
  .map((g) => ({ id: g.id, meta: g, thumb: galleryThumb(g.id) }))

const modelName = (key) => MODELS.find((m) => m.key === key)?.name ?? key
const styleName = (key) => STYLES.find((s) => s.key === key)?.name ?? key

function loadFavorites() {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

// ---------- small pieces ----------

const Label = ({ children, right }) => (
  <div className="flex items-baseline justify-between gap-3">
    <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">{children}</p>
    {right}
  </div>
)

const Chip = ({ active, onClick, children, title }) => (
  <button
    onClick={onClick}
    title={title}
    aria-pressed={active}
    className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs transition-all ${
      active
        ? 'border-lavender bg-lavender/20 text-white'
        : 'border-white/10 text-neutral-400 hover:border-aqua/40 hover:text-white'
    }`}
  >
    {children}
  </button>
)

/** Image that fades in once loaded, over a shimmer placeholder sized by its aspect ratio. */
const FadeImage = ({ src, alt, w, h, className = '' }) => {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="relative overflow-hidden bg-white/5" style={{ aspectRatio: `${w} / ${h}` }}>
      {!loaded && <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-storm to-indigo" />}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`h-full w-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'} ${className}`}
      />
    </div>
  )
}

function downloadUrl(url, name) {
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
}

/** Full-screen viewer with metadata and actions. */
const Lightbox = ({ item, onClose, onPrev, onNext, onRemix, onDelete, favorite, onFavorite }) => {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev?.()
      if (e.key === 'ArrowRight') onNext?.()
    }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose, onPrev, onNext])

  const { meta } = item
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(meta.prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm md:p-8"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-primary md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black/40">
          <img src={item.full} alt={meta.prompt} className="max-h-[60vh] w-auto object-contain md:max-h-[85vh]" />
          {onPrev && (
            <button
              onClick={onPrev}
              aria-label="Previous"
              className="absolute top-1/2 left-3 grid h-10 w-10 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-black/50 text-white hover:bg-black/80"
            >
              ‹
            </button>
          )}
          {onNext && (
            <button
              onClick={onNext}
              aria-label="Next"
              className="absolute top-1/2 right-3 grid h-10 w-10 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-black/50 text-white hover:bg-black/80"
            >
              ›
            </button>
          )}
        </div>
        <div className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto p-5 md:w-80">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[11px] tracking-widest text-aqua uppercase">{modelName(meta.model)}</p>
            <button onClick={onClose} aria-label="Close" className="cursor-pointer text-xl text-neutral-400 hover:text-white">
              ×
            </button>
          </div>
          <div>
            <Label>Prompt</Label>
            <p className="mt-2 text-sm leading-relaxed text-neutral-200">{meta.prompt}</p>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            {[
              ['Style', styleName(meta.style)],
              ['Aspect', meta.aspect],
              ['Size', `${meta.width}×${meta.height}`],
              ['Seed', meta.seed],
              ['Steps', meta.steps],
              ['CFG', meta.cfg],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                <dt className="font-mono text-[10px] text-neutral-500 uppercase">{k}</dt>
                <dd className="mt-0.5 truncate text-neutral-200">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-auto flex flex-col gap-2">
            <button
              onClick={() => onRemix(meta)}
              className="w-full cursor-pointer rounded-full bg-radial from-lavender to-royal px-4 py-2.5 text-sm font-medium hover-animation"
            >
              ✨ Remix this
            </button>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={copy}
                className="cursor-pointer rounded-full border border-white/15 px-2 py-2 text-xs text-neutral-300 transition-colors hover:border-aqua/50 hover:text-white"
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
              <button
                onClick={() => downloadUrl(item.full, `image-studio-${meta.seed}.webp`)}
                className="cursor-pointer rounded-full border border-white/15 px-2 py-2 text-xs text-neutral-300 transition-colors hover:border-aqua/50 hover:text-white"
              >
                Download
              </button>
              {onDelete ? (
                <button
                  onClick={onDelete}
                  className="cursor-pointer rounded-full border border-coral/30 px-2 py-2 text-xs text-coral transition-colors hover:border-coral"
                >
                  Delete
                </button>
              ) : (
                <button
                  onClick={onFavorite}
                  className={`cursor-pointer rounded-full border px-2 py-2 text-xs transition-colors ${
                    favorite ? 'border-coral/60 text-coral' : 'border-white/15 text-neutral-300 hover:border-coral/50'
                  }`}
                >
                  {favorite ? '♥ Saved' : '♡ Save'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Masonry grid of image cards. */
const Masonry = ({ items, onOpen, favorites, empty }) =>
  items.length ? (
    <div className="columns-2 gap-3 md:columns-3 lg:columns-4">
      {items.map((item, i) => (
        <button
          key={item.id}
          onClick={() => onOpen(i)}
          className="group relative mb-3 block w-full cursor-zoom-in break-inside-avoid overflow-hidden rounded-xl border border-white/10 text-left transition-all hover:border-aqua/40"
        >
          <FadeImage src={item.thumb} alt={item.meta.prompt} w={item.meta.width} h={item.meta.height} className="transition-transform duration-500 group-hover:scale-[1.03]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
            <p className="line-clamp-2 text-xs text-neutral-200">{item.meta.prompt}</p>
            <p className="mt-1 font-mono text-[10px] text-aqua">
              {modelName(item.meta.model)} · {styleName(item.meta.style)}
            </p>
          </div>
          {favorites?.has(item.id) && (
            <span className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-coral">♥</span>
          )}
        </button>
      ))}
    </div>
  ) : (
    <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center text-sm text-neutral-500">{empty}</div>
  )

// ---------- main ----------

const ImageStudio = () => {
  const [tab, setTab] = useState('create') // create | explore | mine
  const [prompt, setPrompt] = useState(PROMPT_IDEAS[0])
  const [model, setModel] = useState('dreamshaper')
  const [style, setStyle] = useState('none')
  const [aspect, setAspect] = useState('1:1')
  const [seed, setSeed] = useState('') // '' = random
  const [count, setCount] = useState(1)

  const [jobs, setJobs] = useState([]) // current batch: { id, status, item?, error? }
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')

  const [mine, setMine] = useState([]) // { id, blob, meta, createdAt, full, thumb }
  const [favorites, setFavorites] = useState(loadFavorites)
  const [filterModel, setFilterModel] = useState('all')
  const [filterStyle, setFilterStyle] = useState('all')
  const [query, setQuery] = useState('')
  const [lightbox, setLightbox] = useState(null) // { list: 'explore' | 'mine' | 'jobs', index }

  const topRef = useRef(null)
  const urlsRef = useRef([])

  useEffect(() => {
    wakeSpace(SPACE_URL)
    idbAll('images')
      .then((rows) => {
        const items = rows
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((r) => {
            const url = URL.createObjectURL(r.blob)
            urlsRef.current.push(url)
            return { ...r, full: url, thumb: url }
          })
        setMine(items)
      })
      .catch(() => {})
    const urls = urlsRef.current
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]))
    } catch {
      /* storage unavailable */
    }
  }, [favorites])

  useEffect(() => {
    if (!busy) return
    const started = performance.now()
    const id = setInterval(() => setElapsed(Math.floor((performance.now() - started) / 1000)), 250)
    return () => clearInterval(id)
  }, [busy])

  const gallery = useMemo(
    () => GALLERY.map((g) => ({ id: g.id, meta: g, full: galleryImage(g.id), thumb: galleryThumb(g.id) })),
    []
  )

  const explore = useMemo(() => {
    const q = query.trim().toLowerCase()
    return gallery.filter(
      (g) =>
        (filterModel === 'all' || g.meta.model === filterModel) &&
        (filterStyle === 'all' || (filterStyle === 'favorites' ? favorites.has(g.id) : g.meta.style === filterStyle)) &&
        (!q || g.meta.prompt.toLowerCase().includes(q))
    )
  }, [gallery, filterModel, filterStyle, query, favorites])

  const doneJobs = jobs.filter((j) => j.status === 'done').map((j) => j.item)
  const lists = { explore, mine, jobs: doneJobs }

  const remix = useCallback((meta) => {
    setPrompt(meta.prompt)
    setModel(meta.model)
    setStyle(meta.style)
    setAspect(meta.aspect)
    setSeed(String(meta.seed))
    setCount(1)
    setLightbox(null)
    setTab('create')
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const generate = async () => {
    const text = prompt.trim()
    if (!text || busy) return
    setError('')
    setBusy(true)
    setElapsed(0)
    const batch = Array.from({ length: count }, (_, i) => ({ id: `${Date.now()}-${i}`, status: 'pending' }))
    setJobs(batch)
    const baseSeed = seed === '' ? null : Number(seed)

    for (let i = 0; i < batch.length; i++) {
      const job = batch[i]
      try {
        const [image, meta, apiError] = await callSpace(SPACE_URL, 'generate', [
          text,
          model,
          style,
          aspect,
          baseSeed === null ? -1 : baseSeed + i,
        ])
        if (apiError) throw new Error(apiError)
        if (!image?.url) throw new Error('No image came back.')
        // Through the same-origin proxy, so the blob can be stored and downloaded.
        const res = await fetch(image.url.replace(/^https?:\/\/[^/]+/, SPACE_URL))
        if (!res.ok) throw new Error(`Couldn't fetch the image (${res.status}).`)
        const blob = new Blob([await res.arrayBuffer()], { type: 'image/webp' })
        const url = URL.createObjectURL(blob)
        urlsRef.current.push(url)
        const record = { id: job.id, blob, meta, createdAt: Date.now() }
        idbPut('images', record).catch(() => {})
        const item = { ...record, full: url, thumb: url }
        setMine((prev) => [item, ...prev])
        setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, status: 'done', item } : j)))
      } catch (err) {
        const quota = /quota|exceeded|runs limit/i.test(err.message)
        const message = quota
          ? "The lab's GPU allowance for today is used up. Browse the Explore gallery, and try again tomorrow."
          : err.message
        setJobs((prev) => prev.map((j) => (j.id === job.id || j.status === 'pending' ? { ...j, status: 'error', error: message } : j)))
        setError(message)
        break
      }
    }
    setBusy(false)
  }

  const deleteMine = async (id) => {
    await idbDelete('images', id).catch(() => {})
    setMine((prev) => prev.filter((m) => m.id !== id))
    setLightbox(null)
  }

  const clearMine = async () => {
    if (!window.confirm('Delete all your generated images from this browser?')) return
    await idbClear('images').catch(() => {})
    setMine([])
  }

  const toggleFavorite = (id) =>
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const lbList = lightbox ? lists[lightbox.list] : null
  const lbItem = lbList?.[lightbox.index]
  const selectedModel = MODELS.find((m) => m.key === model)

  return (
    <div ref={topRef} className="scroll-mt-28">
      {/* Tabs */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" className="flex rounded-full border border-white/10 bg-primary/60 p-1">
          {[
            ['create', '✨ Create'],
            ['explore', `🖼️ Explore · ${gallery.length}`],
            ['mine', `📁 My images · ${mine.length}`],
          ].map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`cursor-pointer rounded-full px-4 py-1.5 text-sm transition-all ${
                tab === key
                  ? 'bg-gradient-to-r from-lavender to-royal text-white shadow-[0_0_18px_-6px_rgba(122,87,219,0.9)]'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="font-mono text-[10px] text-neutral-500">SDXL LIGHTNING · ZEROGPU · SAFE-FOR-WORK FILTER</p>
      </div>

      {tab === 'create' && (
        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
          {/* Controls */}
          <div className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-gradient-to-b from-storm/80 to-indigo/80 p-5 lg:sticky lg:top-28 lg:self-start">
            <div>
              <Label
                right={
                  <button
                    onClick={() => setPrompt(PROMPT_IDEAS[Math.floor(Math.random() * PROMPT_IDEAS.length)])}
                    className="cursor-pointer font-mono text-[11px] text-neutral-400 transition-colors hover:text-aqua"
                  >
                    🎲 surprise me
                  </button>
                }
              >
                Prompt
              </Label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate()
                }}
                maxLength={MAX_PROMPT}
                rows={4}
                placeholder="Describe the image you want…"
                className="mt-2 w-full resize-y rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-neutral-200 placeholder-neutral-600 outline-none transition-colors focus:border-aqua/50"
              />
              <p className="text-right font-mono text-[10px] text-neutral-600">
                {prompt.length}/{MAX_PROMPT} · Ctrl+Enter to generate
              </p>
            </div>

            <div>
              <Label>Model</Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {MODELS.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setModel(m.key)}
                    aria-pressed={model === m.key}
                    className={`group cursor-pointer overflow-hidden rounded-xl border text-left transition-all ${
                      model === m.key ? 'border-lavender shadow-[0_0_22px_-10px_rgba(122,87,219,1)]' : 'border-white/10 hover:border-aqua/40'
                    }`}
                  >
                    <div className="aspect-square overflow-hidden bg-white/5">
                      <img src={m.cover} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    </div>
                    <div className={`p-2 ${model === m.key ? 'bg-lavender/20' : 'bg-primary/60'}`}>
                      <p className="truncate text-[11px] font-medium">{m.name}</p>
                      <p className="font-mono text-[9px] text-neutral-400 uppercase">{m.tag}</p>
                    </div>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-neutral-500">{selectedModel.blurb}</p>
            </div>

            <div>
              <Label>Style</Label>
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {STYLES.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setStyle(s.key)}
                    aria-pressed={style === s.key}
                    title={s.name}
                    className={`group relative cursor-pointer overflow-hidden rounded-lg border transition-all ${
                      style === s.key ? 'border-lavender ring-1 ring-lavender' : 'border-white/10 hover:border-aqua/40'
                    }`}
                  >
                    <img src={s.cover} alt="" loading="lazy" className="aspect-square w-full object-cover opacity-80 transition-opacity group-hover:opacity-100" />
                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-1 py-0.5 text-center text-[9px] text-neutral-200">
                      {s.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Aspect ratio</Label>
              <div className="mt-2 flex gap-2">
                {ASPECTS.map((a) => (
                  <button
                    key={a.key}
                    onClick={() => setAspect(a.key)}
                    aria-pressed={aspect === a.key}
                    className={`flex flex-1 cursor-pointer flex-col items-center gap-1.5 rounded-lg border py-2 transition-all ${
                      aspect === a.key ? 'border-lavender bg-lavender/15' : 'border-white/10 hover:border-aqua/40'
                    }`}
                  >
                    <span
                      className={`block rounded-sm border ${aspect === a.key ? 'border-lavender' : 'border-neutral-500'}`}
                      style={{ width: (a.w / 1344) * 26, height: (a.h / 1344) * 26 }}
                    />
                    <span className="font-mono text-[10px] text-neutral-300">{a.key}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Images</Label>
                <div className="mt-2 flex gap-1">
                  {Array.from({ length: MAX_BATCH }, (_, i) => i + 1).map((n) => (
                    <Chip key={n} active={count === n} onClick={() => setCount(n)}>
                      {n}
                    </Chip>
                  ))}
                </div>
              </div>
              <div>
                <Label>Seed</Label>
                <div className="mt-2 flex gap-1">
                  <input
                    value={seed}
                    onChange={(e) => setSeed(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="random"
                    inputMode="numeric"
                    className="w-full min-w-0 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 font-mono text-xs outline-none focus:border-aqua/50"
                  />
                  {seed !== '' && (
                    <button onClick={() => setSeed('')} title="Random seed" className="cursor-pointer px-1 text-neutral-400 hover:text-white">
                      🎲
                    </button>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={generate}
              disabled={busy || !prompt.trim()}
              className="w-full cursor-pointer rounded-full bg-radial from-lavender to-royal px-6 py-3.5 text-sm font-medium hover-animation disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Generating… {elapsed}s
                </span>
              ) : (
                `✨ Generate ${count > 1 ? `${count} images` : 'image'}`
              )}
            </button>
            {busy && elapsed >= 8 && (
              <p className="-mt-3 text-center text-[11px] text-neutral-500">The first image can take up to a minute while the GPU wakes up.</p>
            )}
            {error && (
              <p className="rounded-lg border border-coral/30 bg-coral/5 p-3 text-xs text-coral" role="alert">
                {error}
              </p>
            )}
          </div>

          {/* Results */}
          <div className="min-w-0">
            {jobs.length ? (
              <div className={`grid gap-3 ${jobs.length > 1 ? 'sm:grid-cols-2' : ''}`}>
                {jobs.map((job, i) => {
                  const a = ASPECTS.find((x) => x.key === aspect)
                  if (job.status === 'pending')
                    return (
                      <div
                        key={job.id}
                        className="flex animate-pulse items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-storm to-indigo"
                        style={{ aspectRatio: `${a.w} / ${a.h}` }}
                      >
                        <span className="font-mono text-xs text-neutral-400">{i === 0 || jobs[i - 1].status === 'done' ? 'painting…' : 'queued'}</span>
                      </div>
                    )
                  if (job.status === 'error')
                    return (
                      <div
                        key={job.id}
                        className="flex items-center justify-center rounded-xl border border-coral/30 bg-coral/5 p-6 text-center text-xs text-coral"
                        style={{ aspectRatio: `${a.w} / ${a.h}` }}
                      >
                        {job.error}
                      </div>
                    )
                  const idx = doneJobs.indexOf(job.item)
                  return (
                    <button
                      key={job.id}
                      onClick={() => setLightbox({ list: 'jobs', index: idx })}
                      className="group relative cursor-zoom-in overflow-hidden rounded-xl border border-white/10 transition-all hover:border-aqua/40"
                    >
                      <FadeImage src={job.item.full} alt={job.item.meta.prompt} w={job.item.meta.width} h={job.item.meta.height} />
                      <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[10px] text-neutral-300">
                        seed {job.item.meta.seed} · {job.item.meta.seconds}s
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-primary/40 p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold">Need inspiration?</p>
                    <p className="text-xs text-neutral-400">Click any image to load its exact prompt, model, style and seed.</p>
                  </div>
                  <button
                    onClick={() => setTab('explore')}
                    className="shrink-0 cursor-pointer font-mono text-[11px] text-neutral-400 transition-colors hover:text-aqua"
                  >
                    full gallery →
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {INSPIRATION.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => remix(g.meta)}
                      className="group relative aspect-square cursor-pointer overflow-hidden rounded-xl border border-white/10 transition-all hover:border-aqua/50"
                    >
                      <img src={g.thumb} alt={g.meta.prompt} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2 text-left text-[10px] leading-snug text-neutral-200 opacity-0 transition-opacity group-hover:opacity-100">
                        ✨ Remix · {modelName(g.meta.model)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'explore' && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-primary/60 p-4">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search prompts…"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-aqua/50"
            />
            <div className="flex flex-wrap gap-1.5">
              <Chip active={filterModel === 'all'} onClick={() => setFilterModel('all')}>
                All models
              </Chip>
              {MODELS.map((m) => (
                <Chip key={m.key} active={filterModel === m.key} onClick={() => setFilterModel(m.key)}>
                  {m.name}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={filterStyle === 'all'} onClick={() => setFilterStyle('all')}>
                All styles
              </Chip>
              <Chip active={filterStyle === 'favorites'} onClick={() => setFilterStyle('favorites')}>
                ♥ Saved
              </Chip>
              {STYLES.filter((s) => GALLERY.some((g) => g.style === s.key)).map((s) => (
                <Chip key={s.key} active={filterStyle === s.key} onClick={() => setFilterStyle(s.key)}>
                  {s.name}
                </Chip>
              ))}
            </div>
          </div>
          <Masonry
            items={explore}
            favorites={favorites}
            onOpen={(index) => setLightbox({ list: 'explore', index })}
            empty="Nothing matches those filters."
          />
        </div>
      )}

      {tab === 'mine' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-neutral-500">Saved only in this browser. Nothing is uploaded or shared.</p>
            {mine.length > 0 && (
              <button onClick={clearMine} className="cursor-pointer font-mono text-[11px] text-neutral-500 transition-colors hover:text-coral">
                delete all
              </button>
            )}
          </div>
          <Masonry
            items={mine}
            onOpen={(index) => setLightbox({ list: 'mine', index })}
            empty="Images you generate will appear here."
          />
        </div>
      )}

      {lbItem && (
        <Lightbox
          item={lbItem}
          onClose={() => setLightbox(null)}
          onPrev={lightbox.index > 0 ? () => setLightbox({ ...lightbox, index: lightbox.index - 1 }) : null}
          onNext={lightbox.index < lbList.length - 1 ? () => setLightbox({ ...lightbox, index: lightbox.index + 1 }) : null}
          onRemix={remix}
          onDelete={lightbox.list === 'explore' ? null : () => deleteMine(lbItem.id)}
          favorite={favorites.has(lbItem.id)}
          onFavorite={() => toggleFavorite(lbItem.id)}
        />
      )}
    </div>
  )
}

export default ImageStudio
