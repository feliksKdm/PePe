import { useCallback, useEffect, useRef, useState } from 'react'
import { callSpace, uploadToSpace, wakeSpace } from '../../lib/gradio.js'
import { toReferenceWav } from '../../lib/wav.js'
import { MAX_CHARS, PRESETS, SCRIPTS, SPACE_URL, STYLES, prerenderedClip, previewSrc } from './presets.js'

const MAX_TAKES = 5
const MAX_RECORD_SECONDS = 10

// ---------- small presentational pieces ----------

const Icon = ({ d, className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
    <path d={d} />
  </svg>
)
const PLAY = 'M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z'
const PAUSE = 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z'
const STOP = 'M7 7h10v10H7z'
const MIC = 'M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 1 0-7 0v5A3.5 3.5 0 0 0 12 15Zm6-3.5a1 1 0 1 1 2 0 8 8 0 0 1-7 7.94V21a1 1 0 1 1-2 0v-1.56A8 8 0 0 1 4 11.5a1 1 0 1 1 2 0 6 6 0 0 0 12 0Z'
const UPLOAD = 'M12 3a1 1 0 0 1 .7.29l4 4a1 1 0 1 1-1.4 1.42L13 6.41V15a1 1 0 1 1-2 0V6.41L8.7 8.71A1 1 0 1 1 7.3 7.29l4-4A1 1 0 0 1 12 3ZM4 14a1 1 0 0 1 1 1v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3a1 1 0 1 1 2 0v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-3a1 1 0 0 1 1-1Z'
const DOWNLOAD = 'M12 3a1 1 0 0 1 1 1v8.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.42l2.3 2.3V4a1 1 0 0 1 1-1ZM5 19a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1Z'

const Label = ({ children, right }) => (
  <div className="flex items-baseline justify-between gap-3">
    <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">{children}</p>
    {right}
  </div>
)

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** Styled audio player: play/pause, seekable progress, time, optional download. */
const Player = ({ src, autoPlay = false, download, compact = false }) => {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const a = audioRef.current
    if (autoPlay && a) a.play().catch(() => {})
  }, [src, autoPlay])

  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (a.paused) {
      // Only one player audible at a time.
      document.querySelectorAll('audio[data-vl]').forEach((el) => el !== a && el.pause())
      a.play().catch(() => {})
    } else a.pause()
  }

  const seek = (e) => {
    const a = audioRef.current
    if (!a || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    a.currentTime = ((e.clientX - rect.left) / rect.width) * duration
  }

  return (
    <div className="flex items-center gap-3">
      <audio
        ref={audioRef}
        data-vl
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      />
      <button
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
        className={`grid shrink-0 cursor-pointer place-items-center rounded-full bg-gradient-to-br from-lavender to-royal text-white shadow-[0_0_24px_-8px_rgba(122,87,219,0.9)] transition-transform hover:scale-105 ${
          compact ? 'h-9 w-9' : 'h-12 w-12'
        }`}
      >
        <Icon d={playing ? PAUSE : PLAY} className={compact ? 'h-3.5 w-3.5' : 'h-5 w-5'} />
      </button>
      <div className="min-w-0 flex-1">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          onClick={seek}
          onKeyDown={(e) => {
            const a = audioRef.current
            if (!a) return
            if (e.key === 'ArrowRight') a.currentTime = Math.min(duration, a.currentTime + 2)
            if (e.key === 'ArrowLeft') a.currentTime = Math.max(0, a.currentTime - 2)
          }}
          className="group relative h-2 cursor-pointer rounded-full bg-white/10"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-lavender to-aqua"
            style={{ width: `${duration ? (time / duration) * 100 : 0}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[10px] text-neutral-500">
          <span>{fmt(time)}</span>
          <span>{duration ? fmt(duration) : '–:––'}</span>
        </div>
      </div>
      {download && (
        <a
          href={src}
          download={download}
          aria-label="Download"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 text-neutral-300 transition-colors hover:border-aqua/60 hover:text-white"
        >
          <Icon d={DOWNLOAD} />
        </a>
      )}
    </div>
  )
}

/** Live input-level bars while recording. */
const LevelMeter = ({ analyser }) => {
  const [levels, setLevels] = useState(() => Array(24).fill(0))
  useEffect(() => {
    if (!analyser) return
    const data = new Uint8Array(analyser.frequencyBinCount)
    let raf
    const loop = () => {
      analyser.getByteFrequencyData(data)
      const step = Math.floor(data.length / 24)
      setLevels(Array.from({ length: 24 }, (_, i) => data[i * step] / 255))
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [analyser])
  return (
    <div className="flex h-10 items-center gap-[3px]">
      {levels.map((l, i) => (
        <span
          key={i}
          className="w-1.5 rounded-full bg-gradient-to-t from-coral to-sand transition-[height] duration-75"
          style={{ height: `${12 + l * 88}%` }}
        />
      ))}
    </div>
  )
}

// ---------- main component ----------

const VoiceLab = () => {
  const [tab, setTab] = useState('presets') // presets | clone
  const [presetKey, setPresetKey] = useState(PRESETS[0].key)
  const [previewing, setPreviewing] = useState(null)

  const [text, setText] = useState(PRESETS[0].sample)
  const [speed, setSpeed] = useState(PRESETS[0].speed)
  const [seed, setSeed] = useState(0)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Clone-your-own-voice state
  const [ref, setRef] = useState(null) // { blob, url, duration, trimmed, name }
  const [transcript, setTranscript] = useState('')
  const [transcribing, setTranscribing] = useState(false)
  const [style, setStyle] = useState('natural')
  const [consent, setConsent] = useState(false)
  const [recording, setRecording] = useState(null) // { seconds, analyser }
  const [dragOver, setDragOver] = useState(false)

  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [takes, setTakes] = useState([]) // newest first
  const [error, setError] = useState('')

  const previewRef = useRef(null)
  const recorderRef = useRef(null)
  const refUpload = useRef(null) // { blob, promise } — the uploaded reference, reused across calls
  const transcriptEdited = useRef(false)
  const fileInput = useRef(null)
  const abortRef = useRef(null)
  // Results of this session's generations, keyed by everything that affects
  // the audio — asking for the same thing twice never spends GPU time again.
  const resultCache = useRef(new Map())

  const preset = PRESETS.find((p) => p.key === presetKey)

  useEffect(() => {
    wakeSpace(SPACE_URL)
    return () => {
      previewRef.current?.pause()
      abortRef.current?.abort()
      recorderRef.current?.stop()
    }
  }, [])

  // Revoke object URLs when they're replaced or the takes are dropped.
  useEffect(() => () => ref?.url && URL.revokeObjectURL(ref.url), [ref])
  useEffect(() => {
    const cache = resultCache.current
    return () => cache.forEach((src) => src.startsWith('blob:') && URL.revokeObjectURL(src))
  }, [])

  useEffect(() => {
    if (!busy) return
    const started = performance.now()
    const id = setInterval(() => setElapsed(Math.floor((performance.now() - started) / 1000)), 250)
    return () => clearInterval(id)
  }, [busy])

  // ----- presets -----

  const choosePreset = (p) => {
    setPresetKey(p.key)
    setSpeed(p.speed)
    // Swap the script only if it's still one of the sample lines.
    if (!text.trim() || PRESETS.some((x) => x.sample === text)) setText(p.sample)
  }

  const togglePreview = (p) => {
    choosePreset(p)
    if (previewing === p.key) {
      previewRef.current?.pause()
      setPreviewing(null)
      return
    }
    if (!previewRef.current) {
      previewRef.current = new Audio()
      previewRef.current.addEventListener('ended', () => setPreviewing(null))
    }
    document.querySelectorAll('audio[data-vl]').forEach((el) => el.pause())
    previewRef.current.src = previewSrc(p.key)
    previewRef.current.play().catch(() => setPreviewing(null))
    setPreviewing(p.key)
  }

  // ----- reference clip (clone tab) -----

  const uploadRef = useCallback((blob) => {
    if (refUpload.current?.blob !== blob) {
      refUpload.current = { blob, promise: uploadToSpace(SPACE_URL, blob, 'reference.wav') }
      refUpload.current.promise.catch(() => (refUpload.current = null))
    }
    return refUpload.current.promise
  }, [])

  const loadReference = async (input, name) => {
    setError('')
    try {
      const { blob, duration, trimmed } = await toReferenceWav(input, { maxSeconds: MAX_RECORD_SECONDS })
      if (duration < 2) {
        setError('That clip is too short. Use 5–10 seconds of clear speech.')
        return
      }
      setRef({ blob, url: URL.createObjectURL(blob), duration, trimmed, name })
      setTranscript('')
      transcriptEdited.current = false
      setTranscribing(true)
      try {
        const file = await uploadRef(blob)
        const [detected, apiError] = await callSpace(SPACE_URL, 'transcribe', [file])
        if (apiError) throw new Error(apiError)
        if (!transcriptEdited.current) setTranscript(detected || '')
      } catch (err) {
        setError(`Couldn't auto-detect the words (${err.message}). You can type them in, or leave it empty.`)
      } finally {
        setTranscribing(false)
      }
    } catch {
      setError("Couldn't read that file. Try a WAV, MP3 or M4A recording.")
    }
  }

  const onFiles = (files) => {
    const file = files?.[0]
    if (file) loadReference(file, file.name)
  }

  const startRecording = async () => {
    setError('')
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('Microphone access was blocked. Allow it in your browser, or upload a clip instead.')
      return
    }
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    ctx.createMediaStreamSource(stream).connect(analyser)

    const recorder = new MediaRecorder(stream)
    const parts = []
    const started = performance.now()
    const timer = setInterval(() => {
      const seconds = (performance.now() - started) / 1000
      setRecording((r) => r && { ...r, seconds })
      if (seconds >= MAX_RECORD_SECONDS) recorder.stop()
    }, 100)
    recorder.ondataavailable = (e) => e.data.size && parts.push(e.data)
    recorder.onstop = () => {
      clearInterval(timer)
      stream.getTracks().forEach((t) => t.stop())
      ctx.close()
      recorderRef.current = null
      setRecording(null)
      if (parts.length) loadReference(new Blob(parts, { type: recorder.mimeType }), 'Your recording')
    }
    recorderRef.current = recorder
    recorder.start()
    setRecording({ seconds: 0, analyser })
  }

  const clearReference = () => {
    setRef(null)
    setTranscript('')
    refUpload.current = null
  }

  // ----- generate -----

  const canGenerate =
    text.trim() &&
    text.length <= MAX_CHARS &&
    !busy &&
    (tab === 'presets' || (ref && consent && !transcribing))

  const addTake = (src, label, instant) =>
    setTakes((prev) => [{ id: Date.now(), src, label, text, instant }, ...prev].slice(0, MAX_TAKES))

  const generate = async () => {
    if (!canGenerate) return
    setError('')
    previewRef.current?.pause()
    setPreviewing(null)

    const style_ = STYLES.find((x) => x.key === style)
    const label = tab === 'presets' ? `${preset.emoji} ${preset.name}` : `🎧 Your voice · ${style_.label}`
    const key =
      tab === 'presets'
        ? ['preset', presetKey, text.trim(), speed, seed].join('|')
        : ['clone', ref.url, style, transcript.trim(), text.trim(), speed, seed].join('|')

    // Free paths first: a pre-rendered file, or something already made.
    const ready = resultCache.current.get(key) || (tab === 'presets' && prerenderedClip(preset, text, speed, seed))
    if (ready) {
      addTake(ready, label, true)
      return
    }

    setBusy(true)
    setElapsed(0)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const result =
        tab === 'presets'
          ? await callSpace(SPACE_URL, 'preset', [text, presetKey, speed, seed], { signal: controller.signal })
          : await callSpace(
              SPACE_URL,
              'clone',
              [text, await uploadRef(ref.blob), transcript, style, speed, seed],
              { signal: controller.signal }
            )
      // Endpoints return [audio, errorMessage] — errors travel as data.
      const [output, apiError] = result
      if (apiError) throw new Error(apiError)
      if (!output?.url) throw new Error('No audio came back.')
      // Fetch through the same-origin proxy into a blob, so the download
      // button works (the Space doesn't send CORS headers for files).
      let src = output.url
      try {
        const res = await fetch(output.url.replace(/^https?:\/\/[^/]+/, SPACE_URL), { signal: controller.signal })
        if (res.ok) src = URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: 'audio/wav' }))
      } catch {
        /* fall back to streaming straight from the Space */
      }
      resultCache.current.set(key, src)
      addTake(src, label, false)
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(
          /quota|exceeded|runs limit/i.test(err.message)
            ? "The lab's GPU allowance for today is used up. Presets with the ready-made lines below still play instantly — please try custom text again tomorrow."
            : `Couldn't generate speech: ${err.message}`
        )
      }
    } finally {
      setBusy(false)
    }
  }

  const latest = takes[0]
  const instant = tab === 'presets' && Boolean(prerenderedClip(preset, text, speed, seed))

  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      {/* ---------- left: choose a voice ---------- */}
      <div className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-gradient-to-b from-storm/80 to-indigo/80 p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Label>Step 1 · Choose a voice</Label>
          <div role="tablist" className="flex rounded-full border border-white/10 bg-primary/60 p-1">
            {[
              ['presets', '🎭 Presets'],
              ['clone', '🎧 Your voice'],
            ].map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => {
                  setTab(key)
                  setError('')
                  if (key === 'clone' && !ref) setSpeed(1)
                  if (key === 'presets') setSpeed(preset.speed)
                }}
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
        </div>

        {tab === 'presets' ? (
          <>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {PRESETS.map((p) => {
                const selected = p.key === presetKey
                const isPreviewing = previewing === p.key
                return (
                  <div
                    key={p.key}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected}
                    onClick={() => choosePreset(p)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        choosePreset(p)
                      }
                    }}
                    className={`group flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all ${
                      selected
                        ? 'border-lavender bg-lavender/15 shadow-[0_0_26px_-12px_rgba(122,87,219,1)]'
                        : 'border-white/10 bg-white/[0.03] hover:-translate-y-0.5 hover:border-aqua/40'
                    }`}
                  >
                    <span
                      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br ${p.hue} text-xl`}
                    >
                      {p.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-neutral-100">{p.name}</span>
                      <span className="block truncate text-xs text-neutral-400">{p.tone}</span>
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        togglePreview(p)
                      }}
                      aria-label={isPreviewing ? `Stop ${p.name} sample` : `Hear ${p.name} sample`}
                      className={`grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full border transition-all ${
                        isPreviewing
                          ? 'border-aqua bg-aqua/20 text-aqua'
                          : 'border-white/15 text-neutral-300 hover:border-aqua/60 hover:text-white'
                      }`}
                    >
                      <Icon d={isPreviewing ? STOP : PLAY} className="h-3 w-3" />
                    </button>
                  </div>
                )
              })}
            </div>

            <div className="rounded-xl border border-white/10 bg-primary/50 p-4">
              <p className="text-base font-semibold">
                {preset.emoji} {preset.name}
              </p>
              <p className="mt-1 text-sm text-neutral-400">{preset.blurb}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-aqua/30 px-2.5 py-1 font-mono text-[10px] text-aqua">
                  VOICE · {preset.voice}
                </span>
                <span className="rounded-full border border-lavender/40 px-2.5 py-1 font-mono text-[10px] text-[#b9a3f5]">
                  TONE · {preset.tone}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Reference clip */}
            {ref ? (
              <div className="rounded-xl border border-white/10 bg-primary/50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-medium">
                    🎧 {ref.name}
                    <span className="ml-2 font-mono text-[10px] text-neutral-500">{ref.duration.toFixed(1)}s</span>
                  </p>
                  <button
                    onClick={clearReference}
                    className="cursor-pointer font-mono text-[11px] text-neutral-500 transition-colors hover:text-coral"
                  >
                    replace
                  </button>
                </div>
                <Player src={ref.url} compact />
                {ref.trimmed && (
                  <p className="mt-2 text-[11px] text-sand">Trimmed to the first {MAX_RECORD_SECONDS} seconds.</p>
                )}
              </div>
            ) : recording ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-coral/40 bg-coral/5 p-6">
                <LevelMeter analyser={recording.analyser} />
                <p className="font-mono text-sm text-coral">
                  ● REC {recording.seconds.toFixed(1)}s / {MAX_RECORD_SECONDS}s
                </p>
                <button
                  onClick={() => recorderRef.current?.stop()}
                  className="cursor-pointer rounded-full border border-coral/50 px-5 py-2 text-sm text-coral transition-colors hover:border-coral hover:bg-coral/10"
                >
                  ■ Stop recording
                </button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  onClick={startRecording}
                  className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-6 transition-all hover:-translate-y-0.5 hover:border-coral/50"
                >
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-coral to-sand text-white">
                    <Icon d={MIC} className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-medium">Record yourself</span>
                  <span className="text-xs text-neutral-500">up to {MAX_RECORD_SECONDS} seconds</span>
                </button>
                <button
                  onClick={() => fileInput.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragOver(true)
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOver(false)
                    onFiles(e.dataTransfer.files)
                  }}
                  className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed p-6 transition-all hover:-translate-y-0.5 ${
                    dragOver ? 'border-aqua bg-aqua/10' : 'border-white/20 bg-white/[0.03] hover:border-aqua/50'
                  }`}
                >
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-aqua to-royal text-white">
                    <Icon d={UPLOAD} className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-medium">Upload a clip</span>
                  <span className="text-xs text-neutral-500">drop a file or click · WAV, MP3, M4A</span>
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="audio/*"
                  hidden
                  onChange={(e) => {
                    onFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
              </div>
            )}

            {/* Transcript */}
            <div>
              <Label
                right={
                  transcribing && <span className="font-mono text-[10px] text-aqua">detecting words…</span>
                }
              >
                What your clip says <span className="normal-case tracking-normal text-neutral-600">(optional)</span>
              </Label>
              <textarea
                value={transcript}
                onChange={(e) => {
                  transcriptEdited.current = true
                  setTranscript(e.target.value)
                }}
                rows={2}
                disabled={!ref}
                placeholder={ref ? 'Fills in automatically. Exact words give the closest clone.' : 'Add a clip first'}
                className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-neutral-200 placeholder-neutral-600 outline-none transition-colors focus:border-aqua/50 disabled:opacity-50"
              />
            </div>

            {/* Tone */}
            <div>
              <Label>Tone</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {STYLES.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setStyle(s.key)}
                    aria-pressed={style === s.key}
                    className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm transition-all ${
                      style === s.key
                        ? 'border-lavender bg-lavender/20 text-white'
                        : 'border-white/10 text-neutral-400 hover:border-aqua/40 hover:text-white'
                    }`}
                  >
                    {s.emoji} {s.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-lavender"
              />
              This is my own voice, or I have explicit permission to clone it.
            </label>
          </div>
        )}
      </div>

      {/* ---------- right: script + result ---------- */}
      <div className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-primary/60 p-5 md:p-6 lg:sticky lg:top-28 lg:self-start">
        <div>
          <Label
            right={
              <span className={`font-mono text-[11px] ${text.length > MAX_CHARS ? 'text-coral' : 'text-neutral-500'}`}>
                {text.length}/{MAX_CHARS}
              </span>
            }
          >
            Step 2 · Write the script
          </Label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="Type anything for the voice to say…"
            className="mt-2 w-full resize-y rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-neutral-200 placeholder-neutral-600 outline-none transition-colors focus:border-aqua/50"
          />
          <p className="mt-2 text-[11px] text-neutral-500">
            ⚡ These lines (and each preset&apos;s own sample) are pre-rendered for every preset, so they play
            instantly.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SCRIPTS.map((line) => (
              <button
                key={line}
                onClick={() => setText(line)}
                title={line}
                className={`max-w-full cursor-pointer truncate rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  text === line
                    ? 'border-aqua/50 text-aqua'
                    : 'border-white/10 text-neutral-400 hover:border-aqua/40 hover:text-white'
                }`}
              >
                ⚡ {line.slice(0, 30)}…
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="flex justify-between font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
            Speed
            <span className="text-aqua">{speed.toFixed(2)}×</span>
          </span>
          <input
            type="range"
            min={0.7}
            max={1.3}
            step={0.05}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="mt-2 w-full accent-lavender"
          />
        </label>

        <div>
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="cursor-pointer font-mono text-[11px] tracking-widest text-neutral-500 uppercase transition-colors hover:text-white"
          >
            {showAdvanced ? '▾' : '▸'} Advanced
          </button>
          {showAdvanced && (
            <div className="mt-3 flex items-center gap-2">
              <span className="font-mono text-[11px] text-neutral-400">SEED</span>
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(Number(e.target.value) || 0)}
                className="w-32 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-sm outline-none focus:border-aqua/50"
              />
              <button
                onClick={() => setSeed(Math.floor(Math.random() * 1e8))}
                className="cursor-pointer rounded-full border border-white/15 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:border-aqua/50 hover:text-white"
              >
                🎲 Random
              </button>
            </div>
          )}
        </div>

        <button
          onClick={generate}
          disabled={!canGenerate}
          className="relative w-full cursor-pointer overflow-hidden rounded-full bg-radial from-lavender to-royal px-6 py-3.5 text-sm font-medium hover-animation disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Generating… {elapsed}s
            </span>
          ) : instant ? (
            '⚡ Play instantly'
          ) : (
            '▶ Generate speech'
          )}
        </button>
        {busy && elapsed >= 6 && (
          <p className="-mt-2 text-center text-[11px] text-neutral-500">
            The first run can take up to a minute while the GPU wakes up.
          </p>
        )}
        {tab === 'clone' && !busy && !canGenerate && text.trim() && (
          <p className="-mt-2 text-center text-[11px] text-neutral-500">
            {!ref
              ? 'Record or upload a clip of your voice first.'
              : transcribing
                ? 'Waiting for the transcript…'
                : 'Confirm the voice is yours to continue.'}
          </p>
        )}

        {error && (
          <p className="rounded-lg border border-coral/30 bg-coral/5 p-3 text-xs text-coral" role="alert">
            {error}
          </p>
        )}

        {latest && (
          <div className="rounded-xl border border-lavender/30 bg-gradient-to-br from-lavender/10 to-aqua/5 p-4">
            <Label
              right={
                latest.instant && (
                  <span className="rounded-full border border-mint/40 px-2 py-0.5 font-mono text-[10px] text-mint">
                    ⚡ INSTANT
                  </span>
                )
              }
            >
              Result · {latest.label}
            </Label>
            <p className="mt-2 mb-4 line-clamp-2 text-sm text-neutral-300">“{latest.text}”</p>
            <Player key={latest.id} src={latest.src} autoPlay download={`voice-lab-${latest.id}.wav`} />
          </div>
        )}

        {takes.length > 1 && (
          <div>
            <Label>Earlier takes</Label>
            <div className="mt-3 flex flex-col gap-3">
              {takes.slice(1).map((t) => (
                <div key={t.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="mb-2 truncate text-xs text-neutral-400">
                    {t.label} · “{t.text}”
                  </p>
                  <Player src={t.src} compact download={`voice-lab-${t.id}.wav`} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default VoiceLab
