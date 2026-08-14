import { useEffect, useMemo, useRef, useState } from 'react'

const SAMPLE_TEXT =
  "Hello! I'm the text to speech tool from Feliks's lab. Type anything here and I'll read it out loud — right in your browser. Nothing is uploaded anywhere."

const MAX_CHARS = 5000

// Chrome silently stops long utterances; speaking sentence-sized chunks
// queued back-to-back is the reliable cross-browser approach.
function chunkText(text) {
  const sentences = text.match(/[^.!?\n]+[.!?]*\s*/g) || [text]
  const chunks = []
  let current = ''
  for (const sentence of sentences) {
    if ((current + sentence).length > 200 && current) {
      chunks.push(current)
      current = sentence
    } else {
      current += sentence
    }
  }
  if (current.trim()) chunks.push(current)
  return chunks
}

function voiceScore(voice) {
  // Prefer neural/natural voices, then English, then anything else
  let score = 0
  if (/natural|neural/i.test(voice.name)) score += 4
  if (/google/i.test(voice.name)) score += 2
  if (voice.lang?.startsWith('en')) score += 1
  return score
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
  const [supported] = useState(
    () => typeof window !== 'undefined' && 'speechSynthesis' in window
  )
  const [voices, setVoices] = useState([])
  const [voiceURI, setVoiceURI] = useState('')
  const [text, setText] = useState(SAMPLE_TEXT)
  const [rate, setRate] = useState(1)
  const [pitch, setPitch] = useState(1)
  const [volume, setVolume] = useState(1)
  const [status, setStatus] = useState('idle') // idle | speaking | paused
  const [spokenChars, setSpokenChars] = useState(0)
  const [error, setError] = useState('')
  const defaultPicked = useRef(false)

  useEffect(() => {
    if (!supported) return
    const synth = window.speechSynthesis

    const loadVoices = () => {
      const list = synth.getVoices()
      if (!list.length) return
      setVoices(list)
      if (!defaultPicked.current) {
        defaultPicked.current = true
        const best = [...list].sort((a, b) => voiceScore(b) - voiceScore(a))[0]
        if (best) setVoiceURI(best.voiceURI)
      }
    }

    loadVoices()
    synth.addEventListener('voiceschanged', loadVoices)
    return () => {
      synth.removeEventListener('voiceschanged', loadVoices)
      synth.cancel()
    }
  }, [supported])

  const sortedVoices = useMemo(() => {
    const english = voices.filter((v) => v.lang?.startsWith('en'))
    const rest = voices.filter((v) => !v.lang?.startsWith('en'))
    return [...english, ...rest]
  }, [voices])

  const speak = () => {
    const synth = window.speechSynthesis
    synth.cancel()
    setError('')
    setSpokenChars(0)

    const chunks = chunkText(text)
    if (!chunks.length || !text.trim()) {
      setError('Type some text first.')
      return
    }

    const voice = voices.find((v) => v.voiceURI === voiceURI)
    let offset = 0
    const offsets = chunks.map((c) => {
      const o = offset
      offset += c.length
      return o
    })

    setStatus('speaking')
    chunks.forEach((chunk, i) => {
      const utterance = new SpeechSynthesisUtterance(chunk)
      if (voice) utterance.voice = voice
      utterance.rate = rate
      utterance.pitch = pitch
      utterance.volume = volume
      utterance.onboundary = (e) => setSpokenChars(offsets[i] + e.charIndex)
      if (i === chunks.length - 1) {
        utterance.onend = () => {
          setStatus('idle')
          setSpokenChars(text.length)
        }
      }
      utterance.onerror = (e) => {
        if (e.error !== 'interrupted' && e.error !== 'canceled') {
          setStatus('idle')
          setError(`Speech failed (${e.error}). Try a different voice.`)
        }
      }
      synth.speak(utterance)
    })
  }

  const pause = () => {
    window.speechSynthesis.pause()
    setStatus('paused')
  }
  const resume = () => {
    window.speechSynthesis.resume()
    setStatus('speaking')
  }
  const stop = () => {
    window.speechSynthesis.cancel()
    setStatus('idle')
    setSpokenChars(0)
  }

  if (!supported) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-gradient-to-b from-storm/60 to-indigo/60 p-10 text-center">
        <p className="text-4xl">😕</p>
        <h2 className="mt-4 text-xl font-bold">Browser not supported</h2>
        <p className="subtext mx-auto mt-2 max-w-md">
          Your browser doesn&apos;t expose the Web Speech API. Try Chrome,
          Edge or Safari.
        </p>
      </div>
    )
  }

  const progress = text.length ? Math.min(spokenChars / text.length, 1) : 0
  const speaking = status === 'speaking'
  const paused = status === 'paused'

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
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
            rows={8}
            placeholder="Type or paste anything…"
            className="mt-3 w-full resize-y rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-neutral-200 placeholder-neutral-600 outline-none transition-colors focus:border-aqua/50"
          />
        </div>

        {/* Spoken-so-far highlight */}
        {(speaking || paused) && (
          <div className="rounded-2xl border border-white/10 bg-primary/60 p-5">
            <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
              Now speaking
            </p>
            <p className="mt-3 max-h-40 overflow-y-auto text-sm leading-relaxed">
              <span className="text-aqua">{text.slice(0, spokenChars)}</span>
              <span className="text-neutral-500">{text.slice(spokenChars)}</span>
            </p>
            <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-gradient-to-r from-lavender to-aqua transition-[width] duration-300"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-gradient-to-b from-storm to-indigo p-6">
        <div>
          <label
            htmlFor="tts-voice"
            className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase"
          >
            Voice{' '}
            <span className="text-neutral-600">({voices.length} available)</span>
          </label>
          <select
            id="tts-voice"
            value={voiceURI}
            onChange={(e) => setVoiceURI(e.target.value)}
            className="mt-2 w-full cursor-pointer rounded-lg border border-white/10 bg-primary/80 p-3 text-sm text-neutral-200 outline-none transition-colors focus:border-aqua/50"
          >
            {sortedVoices.map((voice) => (
              <option key={voice.voiceURI} value={voice.voiceURI}>
                {voice.name} — {voice.lang}
              </option>
            ))}
          </select>
          <p className="mt-2 text-[11px] text-neutral-500">
            Tip: on Windows, Microsoft “Natural” voices (Edge) sound best.
          </p>
        </div>

        <Slider
          label="Speed"
          value={rate}
          min={0.5}
          max={2}
          step={0.1}
          onChange={setRate}
          format={(v) => `${v.toFixed(1)}×`}
        />
        <Slider
          label="Pitch"
          value={pitch}
          min={0}
          max={2}
          step={0.1}
          onChange={setPitch}
          format={(v) => v.toFixed(1)}
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
          {!speaking && !paused && (
            <button
              onClick={speak}
              disabled={!text.trim()}
              className="flex-1 cursor-pointer rounded-full bg-radial from-lavender to-royal px-6 py-3 text-sm font-medium hover-animation disabled:cursor-not-allowed disabled:opacity-50"
            >
              ▶ Speak
            </button>
          )}
          {speaking && (
            <button
              onClick={pause}
              className="flex-1 cursor-pointer rounded-full border border-white/15 px-6 py-3 text-sm hover-animation hover:border-aqua/50"
            >
              ⏸ Pause
            </button>
          )}
          {paused && (
            <button
              onClick={resume}
              className="flex-1 cursor-pointer rounded-full bg-radial from-lavender to-royal px-6 py-3 text-sm font-medium hover-animation"
            >
              ▶ Resume
            </button>
          )}
          {(speaking || paused) && (
            <button
              onClick={stop}
              className="cursor-pointer rounded-full border border-coral/40 px-6 py-3 text-sm text-coral hover-animation hover:border-coral"
            >
              ⏹ Stop
            </button>
          )}
        </div>

        {error && (
          <p className="font-mono text-xs text-coral" role="alert">
            ✗ {error}
          </p>
        )}

        <p className="border-t border-white/10 pt-4 font-mono text-[10px] leading-relaxed text-neutral-500">
          PRIVACY: runs 100% in your browser via the Web Speech API.
          <br />
          Your text never leaves this page.
        </p>
      </div>
    </div>
  )
}

export default TextToSpeech
