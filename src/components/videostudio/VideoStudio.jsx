import { useEffect, useRef, useState } from 'react'
import { callSpace, wakeSpace } from '../../lib/gradio.js'
import CLIPS from './clips.json'

// Wan2.1-T2V-1.3B on a ZeroGPU Space, via the same-origin proxy. The mp4 is
// fetched straight from the Space (CORS allows this origin).
const SPACE_URL = '/hf/video-studio'
const SPACE_ORIGIN = 'https://felikskdm-video-studio.hf.space'
const MAX_PROMPT = 400

const ASPECTS = [
  { key: '16:9', w: 832, h: 480 },
  { key: '9:16', w: 480, h: 832 },
  { key: '1:1', w: 624, h: 624 },
]

const IDEAS = {
  Nature: ['ocean waves rolling onto a sandy beach at sunset, cinematic', 'a waterfall in a misty rainforest, slow camera push in'],
  Animals: ['a red fox trotting through fresh snow in a forest', 'a golden retriever puppy running through a field of flowers'],
  City: ['neon-lit Tokyo street at night in the rain, people with umbrellas', 'timelapse of clouds over a city skyline'],
  Fantasy: ['a paper boat sailing through a glowing magical river', 'a dragon flying over snowy mountains at dawn'],
}

const clipSrc = (id) => `${import.meta.env.BASE_URL}video-studio/${id}.mp4`
const posterSrc = (id) => `${import.meta.env.BASE_URL}video-studio/${id}.webp`

const Label = ({ children, right }) => (
  <div className="flex items-baseline justify-between gap-3">
    <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">{children}</p>
    {right}
  </div>
)

/** Muted looping preview that plays while hovered (or always on touch screens). */
const HoverVideo = ({ id, w, h }) => {
  const ref = useRef(null)
  return (
    <video
      ref={ref}
      src={clipSrc(id)}
      poster={posterSrc(id)}
      muted
      loop
      playsInline
      preload="none"
      onMouseEnter={() => ref.current?.play().catch(() => {})}
      onMouseLeave={() => {
        ref.current?.pause()
      }}
      // Touch screens have no hover: tap to play / pause.
      onClick={() => {
        const v = ref.current
        if (v) v.paused ? v.play().catch(() => {}) : v.pause()
      }}
      className="w-full rounded-xl bg-black object-cover"
      style={{ aspectRatio: `${w} / ${h}` }}
    />
  )
}

const VideoStudio = () => {
  const [prompt, setPrompt] = useState(IDEAS.Nature[0])
  const [aspect, setAspect] = useState('16:9')
  const [seconds, setSeconds] = useState(2)
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const [takes, setTakes] = useState([]) // { id, url, meta }
  const urls = useRef([])

  useEffect(() => {
    wakeSpace(SPACE_URL)
    const list = urls.current
    return () => list.forEach((u) => URL.revokeObjectURL(u))
  }, [])

  useEffect(() => {
    if (!busy) return
    const t0 = performance.now()
    const id = setInterval(() => setElapsed(Math.floor((performance.now() - t0) / 1000)), 250)
    return () => clearInterval(id)
  }, [busy])

  const generate = async () => {
    if (!prompt.trim() || busy) return
    setBusy(true)
    setElapsed(0)
    setError('')
    try {
      const [video, meta, apiError] = await callSpace(SPACE_URL, 'generate', [prompt.trim(), aspect, seconds, -1])
      if (apiError) throw new Error(apiError)
      const file = video?.video ?? video
      if (!file?.url) throw new Error('No video came back.')
      let res = await fetch(file.url.replace(/^https?:\/\/[^/]+/, SPACE_ORIGIN)).catch(() => null)
      if (!res?.ok) res = await fetch(file.url.replace(/^https?:\/\/[^/]+/, SPACE_URL))
      const url = URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: 'video/mp4' }))
      urls.current.push(url)
      setTakes((prev) => [{ id: Date.now(), url, meta }, ...prev].slice(0, 6))
    } catch (err) {
      setError(
        /quota|exceeded|runs limit/i.test(err.message)
          ? "The lab's GPU allowance for today is used up — videos are the most expensive thing here. Browse the gallery below and try again tomorrow."
          : err.message
      )
    } finally {
      setBusy(false)
    }
  }

  const a = ASPECTS.find((x) => x.key === aspect)
  const latest = takes[0]

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        <div className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-gradient-to-b from-storm/80 to-indigo/80 p-5 lg:sticky lg:top-28 lg:self-start">
          <div>
            <Label right={<span className="font-mono text-[10px] text-neutral-500">Wan2.1 · 1.3B</span>}>Describe the scene</Label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={MAX_PROMPT}
              rows={4}
              placeholder="A slow drone shot over a misty pine forest at sunrise…"
              className="mt-2 w-full resize-y rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-aqua/50"
            />
            <p className="text-[11px] text-neutral-500">Tip: describe motion and camera — “slow pan”, “close-up”, “drone shot”.</p>
          </div>

          <div className="flex flex-col gap-2">
            {Object.entries(IDEAS).map(([group, list]) => (
              <div key={group} className="flex items-start gap-2">
                <span className="w-16 shrink-0 pt-1.5 font-mono text-[10px] text-neutral-500 uppercase">{group}</span>
                <div className="flex min-w-0 flex-wrap gap-1.5">
                  {list.map((idea) => (
                    <button
                      key={idea}
                      onClick={() => setPrompt(idea)}
                      title={idea}
                      className={`max-w-[14rem] cursor-pointer truncate rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                        prompt === idea ? 'border-aqua/50 text-aqua' : 'border-white/10 text-neutral-400 hover:border-aqua/40 hover:text-white'
                      }`}
                    >
                      {idea}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Format</Label>
              <div className="mt-2 flex gap-1.5">
                {ASPECTS.map((x) => (
                  <button
                    key={x.key}
                    onClick={() => setAspect(x.key)}
                    className={`flex flex-1 cursor-pointer flex-col items-center gap-1 rounded-lg border py-2 ${aspect === x.key ? 'border-lavender bg-lavender/15' : 'border-white/10 hover:border-aqua/40'}`}
                  >
                    <span className={`block rounded-sm border ${aspect === x.key ? 'border-lavender' : 'border-neutral-500'}`} style={{ width: (x.w / 832) * 24, height: (x.h / 832) * 24 }} />
                    <span className="font-mono text-[10px]">{x.key}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Length</Label>
              <div className="mt-2 flex gap-1.5">
                {[2, 3, 4].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSeconds(s)}
                    className={`flex-1 cursor-pointer rounded-lg border py-2 text-sm ${seconds === s ? 'border-lavender bg-lavender/15' : 'border-white/10 hover:border-aqua/40'}`}
                  >
                    {s}s
                  </button>
                ))}
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
                Rendering… {elapsed}s
              </span>
            ) : (
              '🎬 Generate video'
            )}
          </button>
          <p className="-mt-3 text-center text-[11px] text-neutral-500">
            {busy ? 'Diffusion over every frame — usually 40–90 seconds.' : 'Each clip takes about a minute of GPU time.'}
          </p>
          {error && (
            <p className="rounded-lg border border-coral/30 bg-coral/5 p-3 text-xs text-coral" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {busy && (
            <div className="flex animate-pulse items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-storm to-indigo" style={{ aspectRatio: `${a.w} / ${a.h}`, maxHeight: '60vh' }}>
              <span className="font-mono text-xs text-neutral-400">rendering {seconds}s · {a.w}×{a.h} · {elapsed}s</span>
            </div>
          )}
          {latest ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-lavender/30 bg-gradient-to-br from-lavender/10 to-aqua/5 p-4">
              <video src={latest.url} controls autoPlay loop muted playsInline className="max-h-[60vh] w-full rounded-xl bg-black" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="line-clamp-2 min-w-0 flex-1 text-sm text-neutral-200">{latest.meta.prompt}</p>
                <a href={latest.url} download={`video-${latest.meta.seed}.mp4`} className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-neutral-300 hover:border-aqua/50 hover:text-white">
                  ↓ MP4
                </a>
              </div>
              <p className="font-mono text-[10px] text-neutral-500">
                {latest.meta.width}×{latest.meta.height} · {latest.meta.frames} frames @ {latest.meta.fps} fps · seed {latest.meta.seed} · rendered in {latest.meta.elapsed}s
              </p>
            </div>
          ) : (
            !busy && (
              <div className="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-neutral-500">
                Your clips appear here. Hover the gallery below to see what the model can do.
              </div>
            )
          )}
          {takes.length > 1 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {takes.slice(1).map((t) => (
                <video key={t.id} src={t.url} muted loop playsInline controls className="w-full rounded-lg bg-black" />
              ))}
            </div>
          )}
        </div>
      </div>

      {CLIPS.length > 0 && (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-lg font-semibold">Gallery</p>
            <p className="text-xs text-neutral-400">Made with this studio. Hover to play, click “Use prompt” to remix.</p>
          </div>
          <div className="columns-1 gap-3 sm:columns-2 lg:columns-3">
            {CLIPS.map((c) => (
              <div key={c.id} className="mb-3 break-inside-avoid rounded-2xl border border-white/10 bg-primary/50 p-2">
                <HoverVideo id={c.id} w={c.width} h={c.height} />
                <div className="flex items-start justify-between gap-2 p-2">
                  <p className="text-xs text-neutral-300">{c.prompt}</p>
                  <button
                    onClick={() => {
                      setPrompt(c.prompt)
                      setAspect(c.aspect)
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                    className="shrink-0 cursor-pointer rounded-full border border-white/15 px-2 py-0.5 text-[10px] text-neutral-300 hover:border-aqua/50 hover:text-white"
                  >
                    Use prompt
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="font-mono text-[10px] text-neutral-500">WAN2.1-T2V-1.3B (APACHE-2.0) · ZEROGPU · SAFE-FOR-WORK FILTER ON SAMPLED FRAMES</p>
    </div>
  )
}

export default VideoStudio
