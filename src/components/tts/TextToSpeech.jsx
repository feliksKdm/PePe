import { useCallback, useEffect, useRef, useState } from 'react'
import { chunkText } from './chunking'
import { streamFromSpace, wakeSpace } from './remoteEngine'

const SAMPLE_TEXT =
  "Hello! I'm the text to speech tool from Feliks's lab. Type anything here and I'll read it out loud with a neural voice — generated right in your browser. Nothing is uploaded anywhere."

const MAX_CHARS = 5000

// The ten best-rated Kokoro-82M voices (by the model's own quality grades),
// balanced across gender and accent.
const VOICES = [
  { id: 'af_heart', name: 'Heart', gender: 'Female', accent: 'US', vibe: 'Warm & expressive', hue: 'from-coral to-lavender' },
  { id: 'af_bella', name: 'Bella', gender: 'Female', accent: 'US', vibe: 'Bright & confident', hue: 'from-sand to-coral' },
  { id: 'af_nicole', name: 'Nicole', gender: 'Female', accent: 'US', vibe: 'Soft, close-mic', hue: 'from-lavender to-aqua' },
  { id: 'af_aoede', name: 'Aoede', gender: 'Female', accent: 'US', vibe: 'Smooth & melodic', hue: 'from-royal to-coral' },
  { id: 'af_sarah', name: 'Sarah', gender: 'Female', accent: 'US', vibe: 'Friendly & casual', hue: 'from-mint to-aqua' },
  { id: 'bf_emma', name: 'Emma', gender: 'Female', accent: 'UK', vibe: 'Polished & articulate', hue: 'from-aqua to-royal' },
  { id: 'am_michael', name: 'Michael', gender: 'Male', accent: 'US', vibe: 'Steady narrator', hue: 'from-storm to-aqua' },
  { id: 'am_fenrir', name: 'Fenrir', gender: 'Male', accent: 'US', vibe: 'Deep & bold', hue: 'from-royal to-storm' },
  { id: 'am_puck', name: 'Puck', gender: 'Male', accent: 'US', vibe: 'Playful & upbeat', hue: 'from-mint to-sand' },
  { id: 'bm_george', name: 'George', gender: 'Male', accent: 'UK', vibe: 'Classic storyteller', hue: 'from-lavender to-storm' },
]

// Pre-rendered intros ("Hi, I'm Heart…") so previews play instantly, before
// the model has even downloaded. Generated once with the same model + voices.
const previewSrc = (id) => `${import.meta.env.BASE_URL}voices/${id}.mp3`

function encodeWav(chunks, sampleRate) {
  const length = chunks.reduce((n, c) => n + c.length, 0)
  const buffer = new ArrayBuffer(44 + length * 2)
  const view = new DataView(buffer)
  const write = (offset, str) => [...str].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)))
  write(0, 'RIFF')
  view.setUint32(4, 36 + length * 2, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, length * 2, true)
  let offset = 44
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, chunk[i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    }
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

const Slider = ({ label, value, min, max, step, onChange, format }) => (
  <label className="block">
    <span className="flex justify-between font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
      {label}
      <span className="text-aqua">{format(value)}</span>
    </span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="mt-2 w-full accent-lavender"
    />
  </label>
)

const TextToSpeech = () => {
  const [text, setText] = useState(SAMPLE_TEXT)
  const [voiceId, setVoiceId] = useState(VOICES[0].id)
  const [speed, setSpeed] = useState(1)
  const [volume, setVolume] = useState(1)
  const [model, setModel] = useState({ status: 'idle', progress: 0, device: '' }) // idle | loading | ready | error
  const [status, setStatus] = useState('idle') // idle | buffering | speaking | paused
  const [previewing, setPreviewing] = useState(null) // voice id whose intro is playing
  const [spokenChars, setSpokenChars] = useState(0)
  const [downloadUrl, setDownloadUrl] = useState('')
  const [error, setError] = useState('')
  const [startsIn, setStartsIn] = useState(0) // seconds until gap-free playback can begin
  const [engine, setEngine] = useState('') // 'gpu' (Hugging Face Space) | 'local' (in-browser fallback)

  const workerRef = useRef(null)
  const ctxRef = useRef(null)
  const gainRef = useRef(null)
  const filesRef = useRef({})
  // Everything about the current playback run; reset on every speak/stop.
  const runRef = useRef(null)
  const runCounter = useRef(0)
  const previewRef = useRef(null)

  const stopPreview = useCallback(() => {
    previewRef.current?.pause()
    setPreviewing(null)
  }, [])

  const stopPlayback = useCallback(() => {
    const run = runRef.current
    if (run) {
      run.sources.forEach((s) => {
        try {
          s.stop()
        } catch {
          /* already stopped */
        }
      })
      cancelAnimationFrame(run.raf)
      clearTimeout(run.timer)
      run.abort.abort()
    }
    runRef.current = null
    setStartsIn(0)
    workerRef.current?.postMessage({ type: 'cancel' })
    if (ctxRef.current?.state === 'suspended') ctxRef.current.resume()
  }, [])

  const finishRun = useCallback((run) => {
    cancelAnimationFrame(run.raf)
    runRef.current = null
    setStatus('idle')
    if (run.recorded.length) {
      setSpokenChars(run.text.length)
      setDownloadUrl(URL.createObjectURL(encodeWav(run.recorded, run.sampleRate)))
    }
  }, [])

  // Drives the live highlight from the audio clock, so it freezes on pause.
  const tick = useCallback(() => {
    const run = runRef.current
    const ctx = ctxRef.current
    if (!run || !ctx) return
    const now = ctx.currentTime
    let chars = 0
    for (const seg of run.segments) {
      if (now >= seg.end) chars = seg.charEnd
      else if (now > seg.start) {
        const f = (now - seg.start) / (seg.end - seg.start)
        chars = Math.round(seg.charStart + f * (seg.charEnd - seg.charStart))
      }
    }
    setSpokenChars(chars)
    if (run.done && now >= run.nextTime) return finishRun(run)
    run.raf = requestAnimationFrame(tick)
  }, [finishRun])

  const schedule = useCallback((run, { buffer, charStart, charEnd }) => {
    const ctx = ctxRef.current
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(gainRef.current)
    const start = Math.max(run.nextTime, ctx.currentTime + 0.05)
    source.start(start)
    run.nextTime = start + buffer.duration
    run.sources.push(source)
    run.segments.push({ start, end: run.nextTime, charStart, charEnd })
  }, [])

  const startPlayback = useCallback(
    (run) => {
      if (run.started || runRef.current !== run) return
      clearTimeout(run.timer)
      run.started = true
      run.nextTime = 0
      run.pending.forEach((item) => schedule(run, item))
      run.pending = []
      setStartsIn(0)
      setStatus('speaking')
      run.raf = requestAnimationFrame(tick)
    },
    [schedule, tick]
  )

  // The GPU Space renders far ahead of playback, so this normally starts at
  // once. But the in-browser fallback usually runs on one CPU thread — often
  // ~3× slower than real time — and playing each chunk as it lands would stall
  // at every sentence break. So estimate when every remaining chunk will
  // arrive (from the speed measured so far) and hold the start back just long
  // enough that none of them is ever late.
  const planStart = useCallback(
    (run) => {
      // The first chunk carries warm-up/connection overhead; once there's a
      // second one, judge speed by the rest.
      const warm = run.chunkCount > 1
      const genSec = warm ? run.genSec - run.firstGen : run.genSec
      const chars = warm ? run.charsDone - run.firstChars : run.charsDone
      const genPerChar = (genSec / chars) * 1.2 // safety margin for speed jitter
      const audioPerChar = run.audioSec / run.charsDone
      let gen = 0
      let audioBefore = run.audioSec
      let lead = 0
      for (const c of run.plan) {
        if (c.start < run.lastEnd) continue
        const len = c.end - c.start
        gen += len * genPerChar
        lead = Math.max(lead, gen - audioBefore)
        audioBefore += len * audioPerChar
      }
      if (lead <= 0.25) return startPlayback(run)
      clearTimeout(run.timer)
      run.timer = setTimeout(() => startPlayback(run), lead * 1000)
      run.startAt = performance.now() + lead * 1000
      setStartsIn(Math.ceil(lead))
    },
    [startPlayback]
  )

  const handleMessage = useCallback(
    ({ data }) => {
      if (data.type === 'progress') {
        filesRef.current[data.file] = data
        const files = Object.values(filesRef.current)
        const loaded = files.reduce((n, f) => n + f.loaded, 0)
        const total = files.reduce((n, f) => n + f.total, 0)
        setModel((m) => ({ ...m, status: 'loading', progress: total ? loaded / total : 0 }))
        return
      }
      if (data.type === 'ready') {
        setModel({ status: 'ready', progress: 1, device: data.device })
        return
      }

      const run = runRef.current
      if (data.type === 'error') {
        if (!data.id) setModel((m) => ({ ...m, status: 'error' }))
        if (data.id && run?.id !== data.id) return
        stopPlayback()
        setStatus('idle')
        setError(`Couldn't generate speech (${data.message}).`)
        return
      }
      if (!run || data.id !== run.id) return

      if (data.type === 'chunk') {
        const ctx = ctxRef.current
        const buffer = ctx.createBuffer(1, data.audio.length, data.sampleRate)
        buffer.copyToChannel(data.audio, 0)
        run.recorded.push(data.audio)
        run.sampleRate = data.sampleRate
        run.genSec += data.genSeconds
        run.audioSec += buffer.duration
        run.charsDone += data.end - data.start
        run.lastEnd = data.end
        if (!run.chunkCount++) {
          run.firstGen = data.genSeconds
          run.firstChars = data.end - data.start
        }
        const item = { buffer, charStart: data.start, charEnd: data.end }
        if (run.started) schedule(run, item)
        else {
          run.pending.push(item)
          planStart(run)
        }
      } else if (data.type === 'done') {
        run.done = true
        if (!run.started) startPlayback(run)
      }
    },
    [planStart, schedule, startPlayback, stopPlayback]
  )

  const ensureWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('./kokoro.worker.js', import.meta.url), {
        type: 'module',
      })
      workerRef.current.addEventListener('message', handleMessage)
      workerRef.current.postMessage({ type: 'load' })
      setModel((m) => (m.status === 'ready' ? m : { ...m, status: 'loading' }))
    }
    return workerRef.current
  }, [handleMessage])

  useEffect(() => {
    // Wake the GPU Space now so it's ready by the time the visitor hits Speak.
    // The in-browser model is only downloaded if the Space can't be reached.
    wakeSpace()
    return () => {
      stopPlayback()
      previewRef.current?.pause()
      workerRef.current?.terminate()
      workerRef.current = null
      ctxRef.current?.close()
      ctxRef.current = null
    }
  }, [stopPlayback])

  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volume
    if (previewRef.current) previewRef.current.volume = volume
  }, [volume])

  useEffect(() => () => downloadUrl && URL.revokeObjectURL(downloadUrl), [downloadUrl])

  // Live countdown while playback is held back for a gap-free start.
  useEffect(() => {
    if (status !== 'buffering' || !startsIn) return
    const id = setInterval(() => {
      const run = runRef.current
      if (run?.startAt) setStartsIn(Math.max(1, Math.ceil((run.startAt - performance.now()) / 1000)))
    }, 500)
    return () => clearInterval(id)
  }, [status, startsIn])

  const speak = (sayText, voice) => {
    if (!sayText.trim()) {
      setError('Type some text first.')
      return
    }
    stopPlayback()
    stopPreview()
    setError('')
    setSpokenChars(0)
    setDownloadUrl('')

    // AudioContext must be created inside a user gesture.
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext()
      gainRef.current = ctxRef.current.createGain()
      gainRef.current.connect(ctxRef.current.destination)
    }
    gainRef.current.gain.value = volume
    ctxRef.current.resume()

    const id = ++runCounter.current
    runRef.current = {
      id,
      text: sayText,
      plan: chunkText(sayText),
      pending: [],
      started: false,
      timer: 0,
      startAt: 0,
      genSec: 0,
      audioSec: 0,
      charsDone: 0,
      chunkCount: 0,
      firstGen: 0,
      firstChars: 0,
      lastEnd: 0,
      abort: new AbortController(),
      nextTime: 0,
      sources: [],
      segments: [],
      recorded: [],
      sampleRate: 24000,
      done: false,
      raf: 0,
    }
    setStatus('buffering')
    const run = runRef.current
    const emit = (data) => handleMessage({ data: { ...data, id } })
    const runLocally = (chunks) => {
      setEngine('local')
      ensureWorker().postMessage({ type: 'generate', id, chunks, voice, speed })
    }

    streamFromSpace({
      chunks: run.plan,
      voice,
      speed,
      signal: run.abort.signal,
      onChunk: (chunk) => {
        setEngine('gpu')
        emit({ type: 'chunk', ...chunk })
      },
    })
      .then(() => emit({ type: 'done' }))
      .catch((err) => {
        if (run.abort.signal.aborted) return // stopped by the visitor
        // Space asleep, rebuilding or unreachable: finish in the browser.
        console.warn('Kokoro Space unavailable, falling back to in-browser model:', err)
        runLocally(run.plan.slice(err.received || 0))
      })
  }

  const preview = (v) => {
    setVoiceId(v.id)
    if (previewing === v.id) return stopPreview()
    stop()
    if (!previewRef.current) {
      previewRef.current = new Audio()
      previewRef.current.addEventListener('ended', () => setPreviewing(null))
    }
    const audio = previewRef.current
    audio.src = previewSrc(v.id)
    audio.volume = volume
    audio.play().catch(() => setPreviewing(null))
    setPreviewing(v.id)
  }

  const pause = () => {
    ctxRef.current?.suspend()
    setStatus('paused')
  }
  const resume = () => {
    ctxRef.current?.resume()
    setStatus('speaking')
  }
  const stop = () => {
    stopPlayback()
    setStatus('idle')
    setSpokenChars(0)
  }

  const voice = VOICES.find((v) => v.id === voiceId)
  const mainRun = status !== 'idle'
  const progress = text.length ? Math.min(spokenChars / text.length, 1) : 0
  const modelLoading = model.status === 'loading' || model.status === 'idle'

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      {/* Input + live transcript */}
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-white/10 bg-primary/60 p-5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="tts-text"
              className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase"
            >
              Your text
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setText(SAMPLE_TEXT)}
                className="cursor-pointer font-mono text-[11px] text-neutral-500 transition-colors hover:text-aqua"
              >
                sample
              </button>
              <button
                onClick={() => setText('')}
                className="cursor-pointer font-mono text-[11px] text-neutral-500 transition-colors hover:text-aqua"
              >
                clear
              </button>
              <span className="font-mono text-[11px] text-neutral-500">
                {text.length}/{MAX_CHARS}
              </span>
            </div>
          </div>
          <textarea
            id="tts-text"
            value={text}
            maxLength={MAX_CHARS}
            onChange={(e) => setText(e.target.value)}
            rows={9}
            placeholder="Type or paste anything…"
            className="mt-3 w-full resize-y rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-neutral-200 placeholder-neutral-600 outline-none transition-colors focus:border-aqua/50"
          />
        </div>

        {/* Spoken-so-far highlight */}
        {(mainRun || (downloadUrl && spokenChars > 0)) && (
          <div className="rounded-2xl border border-white/10 bg-primary/60 p-5">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
                {status === 'buffering'
                  ? startsIn
                    ? `Rendering ahead so it plays without pauses · starts in ${startsIn}s`
                    : `${voice.name} is warming up…`
                  : mainRun
                    ? `Now speaking · ${voice.name}`
                    : `Done · ${voice.name}`}
              </p>
              {downloadUrl && !mainRun && (
                <a
                  href={downloadUrl}
                  download={`tts-${voice.name.toLowerCase()}.wav`}
                  className="font-mono text-[11px] text-aqua transition-colors hover:text-white"
                >
                  ↓ download .wav
                </a>
              )}
            </div>
            <p className="mt-3 max-h-40 overflow-y-auto text-sm leading-relaxed">
              <span className="text-aqua">{text.slice(0, spokenChars)}</span>
              <span className="text-neutral-500">{text.slice(spokenChars)}</span>
            </p>
            <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-gradient-to-r from-lavender to-aqua transition-[width] duration-200"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-gradient-to-b from-storm to-indigo p-6">
        <div>
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
              Voice
            </p>
            <p className="font-mono text-[10px] text-neutral-500">tap ▶ to preview</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {VOICES.map((v) => {
              const selected = v.id === voiceId
              const isPreviewing = previewing === v.id
              return (
                <div
                  key={v.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  onClick={() => setVoiceId(v.id)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setVoiceId(v.id)}
                  className={`group flex cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 transition-all ${
                    selected
                      ? 'border-lavender bg-lavender/15 shadow-[0_0_22px_-10px_rgba(122,87,219,0.9)]'
                      : 'border-white/10 bg-white/[0.03] hover:border-aqua/40'
                  }`}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      preview(v)
                    }}
                    aria-label={isPreviewing ? `Stop ${v.name} preview` : `Preview ${v.name}`}
                    className={`grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full bg-gradient-to-br ${v.hue} text-xs text-white transition-transform hover:scale-105`}
                  >
                    {isPreviewing ? '■' : '▶'}
                  </button>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-neutral-100">
                      {v.name}{' '}
                      <span className="font-mono text-[10px] text-neutral-500">
                        {v.accent} · {v.gender === 'Female' ? 'F' : 'M'}
                      </span>
                    </span>
                    <span className="block truncate text-[11px] text-neutral-400">{v.vibe}</span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <Slider
          label="Speed"
          value={speed}
          min={0.5}
          max={2}
          step={0.1}
          onChange={setSpeed}
          format={(v) => `${v.toFixed(1)}×`}
        />
        <Slider
          label="Volume"
          value={volume}
          min={0}
          max={1}
          step={0.05}
          onChange={setVolume}
          format={(v) => `${Math.round(v * 100)}%`}
        />

        <div className="mt-1 flex flex-wrap gap-3">
          {(!mainRun || status === 'buffering') && (
            <button
              onClick={() => speak(text, voiceId)}
              disabled={!text.trim() || status === 'buffering'}
              className="flex-1 cursor-pointer rounded-full bg-radial from-lavender to-royal px-6 py-3 text-sm font-medium hover-animation disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mainRun ? (startsIn ? `Starting in ${startsIn}s…` : 'Generating…') : `▶ Speak as ${voice.name}`}
            </button>
          )}
          {mainRun && status === 'speaking' && (
            <button
              onClick={pause}
              className="flex-1 cursor-pointer rounded-full border border-white/15 px-6 py-3 text-sm hover-animation hover:border-aqua/50"
            >
              ⏸ Pause
            </button>
          )}
          {mainRun && status === 'paused' && (
            <button
              onClick={resume}
              className="flex-1 cursor-pointer rounded-full bg-radial from-lavender to-royal px-6 py-3 text-sm font-medium hover-animation"
            >
              ▶ Resume
            </button>
          )}
          {mainRun && (
            <button
              onClick={stop}
              className="cursor-pointer rounded-full border border-coral/40 px-6 py-3 text-sm text-coral hover-animation hover:border-coral"
            >
              ⏹ Stop
            </button>
          )}
        </div>

        {modelLoading && workerRef.current && (
          <div>
            <p className="font-mono text-[10px] text-neutral-400">
              GPU server unavailable — loading the in-browser model… {Math.round(model.progress * 100)}%
              <span className="text-neutral-600"> · one-time download</span>
            </p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-gradient-to-r from-lavender to-aqua transition-[width] duration-300"
                style={{ width: `${model.progress * 100}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <p className="font-mono text-xs text-coral" role="alert">
            ✗ {error}
          </p>
        )}

        <p className="border-t border-white/10 pt-4 font-mono text-[10px] leading-relaxed text-neutral-500">
          {engine === 'local' ? (
            <>
              KOKORO-82M · running in your browser
              {model.device ? ` on ${model.device === 'webgpu' ? 'WebGPU' : 'CPU (WASM)'}` : ''}.
              <br />
              The GPU server was unreachable, so your text never leaves this page.
            </>
          ) : (
            <>
              KOKORO-82M · on a Hugging Face GPU.
              <br />
              Text is only used to generate the audio — nothing is stored.
            </>
          )}
        </p>
      </div>
    </div>
  )
}

export default TextToSpeech
