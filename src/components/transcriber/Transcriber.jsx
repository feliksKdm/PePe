import { useEffect, useMemo, useRef, useState } from 'react'
import { callSpace, uploadToSpace, wakeSpace } from '../../lib/gradio.js'
import { idbAll, idbDelete, idbPut } from '../../lib/idb.js'
import { clock, toSrt, toTxt, toVtt, wordCount } from './format.js'

// Same-origin proxy to https://felikskdm-transcriber.hf.space (api/space.js).
const SPACE_URL = '/hf/transcriber'
const MAX_SECONDS = 15 * 60
const SAMPLE_RATE = 16000
const KBPS = 32 // 15 min ≈ 3.6 MB — under the proxy's 4.5 MB request limit
const HISTORY_LIMIT = 12

const LANGUAGES = [
  ['auto', 'Auto-detect'],
  ['english', 'English'],
  ['russian', 'Русский'],
  ['spanish', 'Español'],
  ['french', 'Français'],
  ['german', 'Deutsch'],
  ['italian', 'Italiano'],
  ['portuguese', 'Português'],
  ['turkish', 'Türkçe'],
  ['ukrainian', 'Українська'],
  ['polish', 'Polski'],
  ['dutch', 'Nederlands'],
  ['arabic', 'العربية'],
  ['hindi', 'हिन्दी'],
  ['chinese', '中文'],
  ['japanese', '日本語'],
  ['korean', '한국어'],
  ['kazakh', 'Қазақша'],
  ['uzbek', 'Oʻzbekcha'],
]

const STEPS = ['Extracting audio', 'Compressing', 'Uploading', 'Transcribing']

const Label = ({ children, right }) => (
  <div className="flex items-baseline justify-between gap-3">
    <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">{children}</p>
    {right}
  </div>
)

function download(text, name, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Decode any browser-playable audio/video, downmix + resample to 16 kHz mono, cap at MAX_SECONDS. */
async function extractAudio(file) {
  const ctx = new AudioContext()
  let decoded
  try {
    decoded = await ctx.decodeAudioData(await file.arrayBuffer())
  } finally {
    ctx.close()
  }
  const duration = Math.min(decoded.duration, MAX_SECONDS)
  const offline = new OfflineAudioContext(1, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE)
  const src = offline.createBufferSource()
  src.buffer = decoded
  src.connect(offline.destination)
  src.start()
  const rendered = await offline.startRendering()
  return { samples: rendered.getChannelData(0), duration, trimmed: decoded.duration > MAX_SECONDS + 0.5 }
}

function encodeMp3(samples, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./mp3.worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') onProgress(data.value)
      else {
        worker.terminate()
        resolve(data.blob)
      }
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(e.message || 'Encoding failed'))
    }
    worker.postMessage({ samples, sampleRate: SAMPLE_RATE, kbps: KBPS })
  })
}

const Transcriber = () => {
  const [file, setFile] = useState(null) // { file, url, name, isVideo }
  const [language, setLanguage] = useState('auto')
  const [step, setStep] = useState(-1) // index into STEPS while running
  const [progress, setProgress] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null) // { id, name, createdAt, data }
  const [history, setHistory] = useState([])
  const [query, setQuery] = useState('')
  const [view, setView] = useState('segments') // segments | text
  const [current, setCurrent] = useState(-1)
  const [follow, setFollow] = useState(true)
  const [copied, setCopied] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [recording, setRecording] = useState(null) // { seconds }

  const mediaRef = useRef(null)
  const listRef = useRef(null)
  const inputRef = useRef(null)
  const recorderRef = useRef(null)
  const busy = step >= 0

  useEffect(() => {
    wakeSpace(SPACE_URL)
    idbAll('transcripts')
      .then((rows) => setHistory(rows.sort((a, b) => b.createdAt - a.createdAt)))
      .catch(() => {})
    return () => recorderRef.current?.stop()
  }, [])

  useEffect(() => () => file?.url && URL.revokeObjectURL(file.url), [file])

  useEffect(() => {
    if (!busy) return
    const started = performance.now()
    const id = setInterval(() => setElapsed(Math.floor((performance.now() - started) / 1000)), 250)
    return () => clearInterval(id)
  }, [busy])

  const segments = useMemo(() => result?.data.segments ?? [], [result])

  // Keep the active line in view while the media plays.
  useEffect(() => {
    if (!follow || current < 0) return
    listRef.current?.querySelector(`[data-seg="${current}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [current, follow])

  const pickFile = (f) => {
    if (!f) return
    if (!/^(audio|video)\//.test(f.type) && !/\.(mp3|wav|m4a|aac|ogg|opus|flac|webm|mp4|mov|mkv)$/i.test(f.name)) {
      setError('That doesn’t look like an audio or video file.')
      return
    }
    if (f.size > 1024 * 1024 * 1024) {
      setError('That file is over 1 GB. Trim it or extract the audio first.')
      return
    }
    setError('')
    setNotice('')
    setResult(null)
    setFile({ file: f, url: URL.createObjectURL(f), name: f.name, isVideo: f.type.startsWith('video/') })
  }

  const startRecording = async () => {
    setError('')
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('Microphone access was blocked. Allow it in your browser, or upload a file instead.')
      return
    }
    const recorder = new MediaRecorder(stream)
    const parts = []
    const started = performance.now()
    const timer = setInterval(() => {
      const seconds = (performance.now() - started) / 1000
      setRecording({ seconds })
      if (seconds >= MAX_SECONDS) recorder.stop()
    }, 200)
    recorder.ondataavailable = (e) => e.data.size && parts.push(e.data)
    recorder.onstop = () => {
      clearInterval(timer)
      stream.getTracks().forEach((t) => t.stop())
      recorderRef.current = null
      setRecording(null)
      if (parts.length) {
        const blob = new Blob(parts, { type: recorder.mimeType })
        pickFile(new File([blob], `Recording ${new Date().toLocaleTimeString()}.webm`, { type: blob.type }))
      }
    }
    recorderRef.current = recorder
    recorder.start()
    setRecording({ seconds: 0 })
  }

  const transcribe = async () => {
    if (!file || busy) return
    setError('')
    setNotice('')
    setResult(null)
    setProgress(0)
    try {
      setStep(0)
      let audio
      try {
        audio = await extractAudio(file.file)
      } catch {
        throw new Error("Couldn't read the audio from this file. Try an MP3, WAV, M4A or MP4.")
      }
      if (audio.trimmed) setNotice(`Only the first ${MAX_SECONDS / 60} minutes are transcribed.`)

      setStep(1)
      const mp3 = await encodeMp3(audio.samples, setProgress)

      setStep(2)
      const uploaded = await uploadToSpace(SPACE_URL, mp3, 'audio.mp3')

      setStep(3)
      const [data, apiError] = await callSpace(SPACE_URL, 'transcribe', [uploaded, language])
      if (apiError) throw new Error(apiError)
      if (!data?.segments) throw new Error('No transcript came back.')

      const record = { id: `${Date.now()}`, name: file.name, createdAt: Date.now(), data }
      setResult(record)
      setHistory((prev) => [record, ...prev].slice(0, HISTORY_LIMIT))
      idbPut('transcripts', record).catch(() => {})
    } catch (err) {
      setError(
        /quota|exceeded|runs limit/i.test(err.message)
          ? "The lab's GPU allowance for today is used up. Please try again tomorrow."
          : err.message
      )
    } finally {
      setStep(-1)
    }
  }

  const openHistory = (record) => {
    setResult(record)
    setFile(null)
    setCurrent(-1)
  }

  const removeHistory = (id) => {
    idbDelete('transcripts', id).catch(() => {})
    setHistory((prev) => prev.filter((h) => h.id !== id))
    if (result?.id === id) setResult(null)
  }

  const onTime = (t) => {
    // Last segment that has started.
    let idx = -1
    for (let i = 0; i < segments.length && segments[i].start <= t; i++) idx = i
    setCurrent(idx)
  }

  const seek = (s) => {
    const m = mediaRef.current
    if (!m) return
    m.currentTime = s.start
    m.play().catch(() => {})
  }

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(toTxt(segments))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked */
    }
  }

  const q = query.trim().toLowerCase()
  const base = result ? result.name.replace(/\.[^.]+$/, '') : 'transcript'
  const showMedia = file && result && !busy

  const highlight = (text) => {
    if (!q) return text
    const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'))
    return parts.map((p, i) =>
      p.toLowerCase() === q ? (
        <mark key={i} className="rounded bg-sand/40 px-0.5 text-white">
          {p}
        </mark>
      ) : (
        p
      )
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      {/* ---------- left: input ---------- */}
      <div className="flex flex-col gap-5 lg:sticky lg:top-28 lg:self-start">
        <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-gradient-to-b from-storm/80 to-indigo/80 p-5">
          <Label>1 · Your file</Label>
          {recording ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-coral/40 bg-coral/5 p-6">
              <span className="h-3 w-3 animate-pulse rounded-full bg-coral" />
              <p className="font-mono text-sm text-coral">● REC {clock(recording.seconds)}</p>
              <button
                onClick={() => recorderRef.current?.stop()}
                className="cursor-pointer rounded-full border border-coral/50 px-5 py-2 text-sm text-coral transition-colors hover:border-coral hover:bg-coral/10"
              >
                ■ Stop
              </button>
            </div>
          ) : (
            <>
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
                  pickFile(e.dataTransfer.files?.[0])
                }}
                disabled={busy}
                className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center transition-all ${
                  dragOver ? 'border-aqua bg-aqua/10' : 'border-white/20 bg-white/[0.03] hover:border-aqua/50'
                }`}
              >
                <span className="text-3xl">{file ? (file.isVideo ? '🎬' : '🎧') : '📂'}</span>
                <span className="max-w-full truncate text-sm font-medium">{file ? file.name : 'Drop a video or audio file'}</span>
                <span className="text-xs text-neutral-500">
                  {file ? `${(file.file.size / 1024 / 1024).toFixed(1)} MB · click to replace` : 'MP4, MOV, WEBM, MP3, WAV, M4A… up to 15 min'}
                </span>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="audio/*,video/*"
                hidden
                onChange={(e) => {
                  pickFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              <button
                onClick={startRecording}
                disabled={busy}
                className="cursor-pointer rounded-full border border-white/15 py-2 text-xs text-neutral-300 transition-colors hover:border-coral/50 hover:text-white disabled:opacity-50"
              >
                🎤 or record from your microphone
              </button>
            </>
          )}

          <div>
            <Label>2 · Language</Label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={busy}
              className="mt-2 w-full cursor-pointer rounded-lg border border-white/10 bg-primary/80 p-2.5 text-sm outline-none focus:border-aqua/50"
            >
              {LANGUAGES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={transcribe}
            disabled={!file || busy}
            className="w-full cursor-pointer rounded-full bg-radial from-lavender to-royal px-6 py-3.5 text-sm font-medium hover-animation disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? `Working… ${elapsed}s` : '✍️ Transcribe'}
          </button>

          {busy && (
            <ol className="flex flex-col gap-2">
              {STEPS.map((s, i) => (
                <li key={s} className={`flex items-center gap-2 text-xs ${i < step ? 'text-mint' : i === step ? 'text-white' : 'text-neutral-600'}`}>
                  <span className="w-4 text-center">
                    {i < step ? '✓' : i === step ? <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : '·'}
                  </span>
                  {s}
                  {i === step && i === 1 && <span className="font-mono text-neutral-400">{Math.round(progress * 100)}%</span>}
                  {i === step && i === 3 && elapsed > 10 && <span className="text-neutral-500">(waking the GPU can take ~1 min)</span>}
                </li>
              ))}
            </ol>
          )}
          {notice && <p className="text-xs text-sand">{notice}</p>}
          {error && (
            <p className="rounded-lg border border-coral/30 bg-coral/5 p-3 text-xs text-coral" role="alert">
              {error}
            </p>
          )}
        </div>

        {history.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-primary/60 p-5">
            <Label>Recent · this browser only</Label>
            <ul className="mt-3 flex flex-col gap-1">
              {history.map((h) => (
                <li key={h.id} className="group flex items-center gap-2">
                  <button
                    onClick={() => openHistory(h)}
                    className={`min-w-0 flex-1 cursor-pointer truncate rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                      result?.id === h.id ? 'bg-lavender/20 text-white' : 'text-neutral-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {h.name} <span className="text-neutral-600">· {clock(h.data.duration)}</span>
                  </button>
                  <button
                    onClick={() => removeHistory(h.id)}
                    aria-label={`Delete ${h.name}`}
                    className="cursor-pointer px-1 text-neutral-600 opacity-0 transition-opacity group-hover:opacity-100 hover:text-coral"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ---------- right: transcript ---------- */}
      <div className="min-w-0">
        {result ? (
          <div className="flex flex-col gap-4">
            {showMedia &&
              (file.isVideo ? (
                <video
                  ref={mediaRef}
                  src={file.url}
                  controls
                  onTimeUpdate={(e) => onTime(e.currentTarget.currentTime)}
                  className="max-h-[50vh] w-full rounded-2xl border border-white/10 bg-black"
                />
              ) : (
                <audio ref={mediaRef} src={file.url} controls onTimeUpdate={(e) => onTime(e.currentTarget.currentTime)} className="w-full" />
              ))}

            <div className="flex flex-wrap gap-2">
              {[
                ['Duration', clock(result.data.duration)],
                ['Words', wordCount(result.data.text).toLocaleString()],
                ['Language', result.data.language ? result.data.language[0].toUpperCase() + result.data.language.slice(1) : '—'],
                ['Processed in', `${result.data.seconds}s`],
              ].map(([k, v]) => (
                <span key={k} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs">
                  <span className="text-neutral-500">{k}</span> <span className="text-neutral-200">{v}</span>
                </span>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-primary/60 p-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the transcript…"
                className="min-w-40 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm outline-none focus:border-aqua/50"
              />
              <div className="flex rounded-full border border-white/10 p-0.5">
                {[
                  ['segments', 'Lines'],
                  ['text', 'Text'],
                ].map(([k, l]) => (
                  <button
                    key={k}
                    onClick={() => setView(k)}
                    className={`cursor-pointer rounded-full px-3 py-1 text-xs ${view === k ? 'bg-lavender/30 text-white' : 'text-neutral-400'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <button onClick={copyAll} className="cursor-pointer rounded-full border border-white/15 px-3 py-1.5 text-xs text-neutral-300 hover:border-aqua/50 hover:text-white">
                {copied ? '✓ Copied' : 'Copy'}
              </button>
              {[
                ['TXT', () => download(toTxt(segments), `${base}.txt`)],
                ['SRT', () => download(toSrt(segments), `${base}.srt`, 'application/x-subrip')],
                ['VTT', () => download(toVtt(segments), `${base}.vtt`, 'text/vtt')],
              ].map(([l, fn]) => (
                <button key={l} onClick={fn} className="cursor-pointer rounded-full border border-white/15 px-3 py-1.5 font-mono text-xs text-neutral-300 hover:border-aqua/50 hover:text-white">
                  ↓ {l}
                </button>
              ))}
            </div>

            {view === 'segments' ? (
              <div ref={listRef} className="max-h-[60vh] overflow-y-auto rounded-2xl border border-white/10 bg-primary/40 p-2">
                {showMedia && (
                  <label className="flex items-center gap-2 px-2 pb-2 text-[11px] text-neutral-500">
                    <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} className="accent-lavender" />
                    Follow playback
                  </label>
                )}
                {segments.map((s, i) =>
                  q && !s.text.toLowerCase().includes(q) ? null : (
                    <button
                      key={i}
                      data-seg={i}
                      onClick={() => seek(s)}
                      disabled={!showMedia}
                      className={`flex w-full gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors ${
                        i === current ? 'bg-lavender/20' : showMedia ? 'cursor-pointer hover:bg-white/5' : ''
                      }`}
                    >
                      <span className="shrink-0 pt-0.5 font-mono text-[11px] text-aqua">{clock(s.start)}</span>
                      <span className={i === current ? 'text-white' : 'text-neutral-300'}>{highlight(s.text)}</span>
                    </button>
                  )
                )}
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto rounded-2xl border border-white/10 bg-primary/40 p-5 text-sm leading-relaxed whitespace-pre-wrap text-neutral-200">
                {highlight(toTxt(segments).replace(/\n/g, ' '))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 p-8 text-center">
            <p className="text-4xl">{busy ? '⏳' : '📝'}</p>
            <p className="max-w-sm text-sm text-neutral-400">
              {busy
                ? 'Your transcript will appear here. Audio is compressed in your browser before upload, so only a small file leaves your device.'
                : 'Drop in a video or audio file and get a timestamped transcript. Click any line to jump to that moment, then export subtitles.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default Transcriber
