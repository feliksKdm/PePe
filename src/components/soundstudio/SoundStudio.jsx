import { useEffect, useMemo, useRef, useState } from 'react'
import { callSpace, wakeSpace } from '../../lib/gradio.js'
import LIBRARY from './library.json'

// Same-origin proxy to https://felikskdm-sound-studio.hf.space (api/space.js).
const SPACE_URL = '/hf/sound-studio'
const SPACE_ORIGIN = 'https://felikskdm-sound-studio.hf.space'
const MAX_PROMPT = 300

const MODES = {
  sfx: {
    label: '💥 Sound effects',
    model: 'AudioLDM2',
    min: 1,
    max: 10,
    default: 5,
    placeholder: 'Describe a sound: "heavy wooden door creaking open in an old castle"',
    ideas: {
      Nature: ['thunder rumbling over heavy rain', 'waves crashing on a rocky shore', 'birds chirping in a forest at dawn'],
      'Sci-fi': ['spaceship engine humming, then a laser blast', 'robot powering up with servo whirs', 'futuristic door sliding open with a hiss'],
      Foley: ['footsteps on gravel', 'glass shattering on a stone floor', 'a match being struck and lit'],
      City: ['busy cafe with chatter and clinking cups', 'subway train arriving at a station', 'car horn honking in traffic'],
    },
  },
  music: {
    label: '🎵 Music',
    model: 'MusicGen Medium',
    min: 5,
    max: 20,
    default: 10,
    placeholder: 'Describe a track: "lo-fi hip hop beat with mellow piano and vinyl crackle, 80 bpm"',
    ideas: {
      Chill: ['lo-fi hip hop beat with mellow piano and vinyl crackle', 'ambient pads with soft rain, calm and dreamy'],
      Cinematic: ['epic orchestral trailer music with big drums and brass', 'tense suspense score with low strings'],
      Electronic: ['80s synthwave with driving bass and retro drums', 'upbeat house track with a catchy synth lead'],
      Acoustic: ['acoustic folk guitar, warm and happy', 'smooth jazz trio with upright bass and brushed drums'],
    },
  },
}

const Label = ({ children, right }) => (
  <div className="flex items-baseline justify-between gap-3">
    <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">{children}</p>
    {right}
  </div>
)

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const BARS = 96

/** Waveform player: peaks drawn as bars, click to seek, played part highlighted. */
const Waveform = ({ src, autoPlay = false, download }) => {
  const audioRef = useRef(null)
  const [peaks, setPeaks] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const buf = await (await fetch(src)).arrayBuffer()
        const ctx = new AudioContext()
        const audio = await ctx.decodeAudioData(buf)
        ctx.close()
        const data = audio.getChannelData(0)
        const step = Math.floor(data.length / BARS) || 1
        // RMS per bar reads closer to perceived loudness than the raw peak.
        const p = Array.from({ length: BARS }, (_, i) => {
          let sum = 0
          let n = 0
          for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j++, n++) sum += data[j] * data[j]
          return Math.sqrt(sum / (n || 1))
        })
        const max = Math.max(...p) || 1
        if (!cancelled) {
          setPeaks(p.map((v) => v / max))
          setDur((d) => d || audio.duration)
        }
      } catch {
        if (!cancelled) setPeaks(Array(BARS).fill(0.3))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [src])

  useEffect(() => {
    if (autoPlay) audioRef.current?.play().catch(() => {})
  }, [src, autoPlay])

  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (a.paused) {
      document.querySelectorAll('audio[data-ss]').forEach((el) => el !== a && el.pause())
      a.play().catch(() => {})
    } else a.pause()
  }

  const seek = (e) => {
    const a = audioRef.current
    if (!a || !dur) return
    const rect = e.currentTarget.getBoundingClientRect()
    a.currentTime = ((e.clientX - rect.left) / rect.width) * dur
    if (a.paused) toggle()
  }

  const progress = dur ? t / dur : 0
  return (
    <div className="flex items-center gap-3">
      <audio
        ref={audioRef}
        data-ss
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
      />
      <button
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
        className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full bg-gradient-to-br from-lavender to-royal text-white shadow-[0_0_24px_-8px_rgba(122,87,219,0.9)] transition-transform hover:scale-105"
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <div className="min-w-0 flex-1">
        <div onClick={seek} className="flex h-12 cursor-pointer items-center gap-[2px]" role="slider" aria-label="Seek" aria-valuenow={Math.round(t)} tabIndex={0}>
          {(peaks || Array(BARS).fill(0.08)).map((v, i) => (
            <span
              key={i}
              className={`flex-1 rounded-full transition-colors ${i / BARS < progress ? 'bg-aqua' : 'bg-white/25'}`}
              style={{ height: `${Math.max(6, v * 100)}%` }}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-neutral-500">
          <span>{fmt(t)}</span>
          <span>{dur ? fmt(dur) : '–:––'}</span>
        </div>
      </div>
      {download && (
        <a
          href={src}
          download={download}
          aria-label="Download"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 text-neutral-300 transition-colors hover:border-aqua/60 hover:text-white"
        >
          ↓
        </a>
      )}
    </div>
  )
}

const SoundStudio = () => {
  const [mode, setMode] = useState('sfx')
  const [prompt, setPrompt] = useState(MODES.sfx.ideas.Nature[0])
  const [seconds, setSeconds] = useState(MODES.sfx.default)
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const [takes, setTakes] = useState([]) // { id, src, meta }
  const [filter, setFilter] = useState('all')
  const urls = useRef([])
  const m = MODES[mode]

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

  const switchMode = (k) => {
    setMode(k)
    setSeconds(MODES[k].default)
    setPrompt(Object.values(MODES[k].ideas)[0][0])
    setError('')
  }

  const generate = async () => {
    if (!prompt.trim() || busy) return
    setBusy(true)
    setElapsed(0)
    setError('')
    try {
      const [audio, meta, apiError] = await callSpace(SPACE_URL, 'generate', [prompt.trim(), mode, seconds, -1])
      if (apiError) throw new Error(apiError)
      const direct = audio.url.replace(/^https?:\/\/[^/]+/, SPACE_ORIGIN)
      let res = await fetch(direct).catch(() => null)
      if (!res?.ok) res = await fetch(audio.url.replace(/^https?:\/\/[^/]+/, SPACE_URL))
      const url = URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: 'audio/mpeg' }))
      urls.current.push(url)
      setTakes((prev) => [{ id: Date.now(), src: url, meta }, ...prev].slice(0, 8))
    } catch (err) {
      setError(
        /quota|exceeded|runs limit/i.test(err.message)
          ? "The lab's GPU allowance for today is used up. The library below still plays instantly — try generating again tomorrow."
          : err.message
      )
    } finally {
      setBusy(false)
    }
  }

  const library = useMemo(() => LIBRARY.filter((s) => filter === 'all' || s.kind === filter), [filter])

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Create */}
        <div className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-gradient-to-b from-storm/80 to-indigo/80 p-5 md:p-6">
          <div role="tablist" className="flex w-fit rounded-full border border-white/10 bg-primary/60 p-1">
            {Object.entries(MODES).map(([k, v]) => (
              <button
                key={k}
                role="tab"
                aria-selected={mode === k}
                onClick={() => switchMode(k)}
                className={`cursor-pointer rounded-full px-4 py-1.5 text-sm transition-all ${
                  mode === k ? 'bg-gradient-to-r from-lavender to-royal text-white' : 'text-neutral-400 hover:text-white'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          <div>
            <Label right={<span className="font-mono text-[10px] text-neutral-500">{m.model}</span>}>Describe it</Label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate()
              }}
              maxLength={MAX_PROMPT}
              rows={3}
              placeholder={m.placeholder}
              className="mt-2 w-full resize-y rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-aqua/50"
            />
          </div>

          <div className="flex flex-col gap-2">
            {Object.entries(m.ideas).map(([group, list]) => (
              <div key={group} className="flex items-start gap-2">
                <span className="w-20 shrink-0 pt-1.5 font-mono text-[10px] text-neutral-500 uppercase">{group}</span>
                <div className="flex min-w-0 flex-wrap gap-1.5">
                {list.map((idea) => (
                  <button
                    key={idea}
                    onClick={() => setPrompt(idea)}
                    title={idea}
                    className={`max-w-[15rem] cursor-pointer truncate rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
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

          <label className="block">
            <span className="flex justify-between font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
              Duration
              <span className="text-aqua">{seconds}s</span>
            </span>
            <input type="range" min={m.min} max={m.max} value={seconds} onChange={(e) => setSeconds(+e.target.value)} className="mt-2 w-full accent-lavender" />
          </label>

          <button
            onClick={generate}
            disabled={busy || !prompt.trim()}
            className="w-full cursor-pointer rounded-full bg-radial from-lavender to-royal px-6 py-3.5 text-sm font-medium hover-animation disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Composing… {elapsed}s
              </span>
            ) : mode === 'sfx' ? (
              '💥 Generate sound effect'
            ) : (
              '🎵 Generate music'
            )}
          </button>
          {busy && elapsed > 10 && <p className="-mt-3 text-center text-[11px] text-neutral-500">The first run can take up to a minute while the GPU wakes up.</p>}
          {error && (
            <p className="rounded-lg border border-coral/30 bg-coral/5 p-3 text-xs text-coral" role="alert">
              {error}
            </p>
          )}
        </div>

        {/* Results */}
        <div className="flex flex-col gap-3">
          <Label>Your sounds · this session</Label>
          {takes.length ? (
            takes.map((tk, i) => (
              <div key={tk.id} className={`rounded-2xl border p-4 ${i === 0 ? 'border-lavender/40 bg-gradient-to-br from-lavender/10 to-aqua/5' : 'border-white/10 bg-primary/50'}`}>
                <p className="mb-3 line-clamp-2 text-sm text-neutral-200">
                  {tk.meta.kind === 'sfx' ? '💥' : '🎵'} {tk.meta.prompt}
                </p>
                <Waveform src={tk.src} autoPlay={i === 0} download={`${tk.meta.kind}-${tk.meta.seed}.mp3`} />
                <p className="mt-2 font-mono text-[10px] text-neutral-500">
                  {tk.meta.model} · {tk.meta.seconds}s · seed {tk.meta.seed} · made in {tk.meta.elapsed}s
                </p>
              </div>
            ))
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-neutral-500">
              Generated sounds appear here. Meanwhile, browse the library below — every clip plays instantly.
            </div>
          )}
        </div>
      </div>

      {/* Library */}
      {LIBRARY.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-lg font-semibold">Sound library</p>
              <p className="text-xs text-neutral-400">Made with this studio. Click “Use prompt” to remix one.</p>
            </div>
            <div className="flex gap-1.5">
              {[
                ['all', 'All'],
                ['sfx', '💥 Effects'],
                ['music', '🎵 Music'],
              ].map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs ${filter === k ? 'border-lavender bg-lavender/20' : 'border-white/10 text-neutral-400 hover:text-white'}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {library.map((s) => (
              <div key={s.id} className="rounded-2xl border border-white/10 bg-primary/50 p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <p className="text-sm text-neutral-200">
                    {s.kind === 'sfx' ? '💥' : '🎵'} {s.prompt}
                  </p>
                  <button
                    onClick={() => {
                      switchMode(s.kind)
                      setPrompt(s.prompt)
                      setSeconds(s.seconds)
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                    className="shrink-0 cursor-pointer rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-neutral-300 hover:border-aqua/50 hover:text-white"
                  >
                    Use prompt
                  </button>
                </div>
                <Waveform src={`${import.meta.env.BASE_URL}sound-studio/${s.id}.mp3`} download={`${s.id}.mp3`} />
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="font-mono text-[10px] leading-relaxed text-neutral-500">
        AUDIOLDM2 (CC BY-NC-SA 4.0) · MUSICGEN MEDIUM BY META (CC BY-NC 4.0) · ZEROGPU · for demos and personal,
        non-commercial use.
      </p>
    </div>
  )
}

export default SoundStudio
