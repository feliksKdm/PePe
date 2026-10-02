import { KokoroTTS } from 'kokoro-js'
import { shapeSilence } from './chunking.js'

// Runs Kokoro-82M off the main thread so synthesis never freezes the page.
// Messages in:  { type: 'load' } | { type: 'generate', id, chunks, voice, speed } | { type: 'cancel' }
// Messages out: progress | ready | error | chunk | done

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX'

let tts = null
let loading = null
let activeId = null
// Runs are serialised: a cancelled run finishes its current chunk before
// the next one starts, so the ONNX session is never entered twice at once.
let queue = Promise.resolve()

async function hasWebGPU() {
  try {
    return !!(navigator.gpu && (await navigator.gpu.requestAdapter()))
  } catch {
    return false
  }
}

function load() {
  if (!loading) {
    loading = (async () => {
      // WebGPU is ~10× faster but needs the fp32 weights (~310 MB);
      // everyone else gets the quantised WASM build (~90 MB).
      const webgpu = await hasWebGPU()
      const device = webgpu ? 'webgpu' : 'wasm'
      tts = await KokoroTTS.from_pretrained(MODEL_ID, {
        dtype: webgpu ? 'fp32' : 'q8',
        device,
        progress_callback: (p) => {
          if (p.status === 'progress' && p.total) {
            self.postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total })
          }
        },
      })
      self.postMessage({ type: 'ready', device })
    })().catch((err) => {
      loading = null
      self.postMessage({ type: 'error', message: String(err?.message || err) })
    })
  }
  return loading
}

async function generate({ id, chunks, voice, speed }) {
  await load()
  if (!tts || activeId !== id) return
  try {
    for (const chunk of chunks) {
      const t0 = performance.now()
      const audio = await tts.generate(chunk.text, { voice, speed })
      if (activeId !== id) return // cancelled or superseded
      const samples = shapeSilence(audio.audio, audio.sampling_rate)
      if (!samples.length) continue
      self.postMessage(
        {
          type: 'chunk',
          id,
          start: chunk.start,
          end: chunk.end,
          audio: samples,
          sampleRate: audio.sampling_rate,
          genSeconds: (performance.now() - t0) / 1000,
        },
        [samples.buffer]
      )
    }
    if (activeId === id) self.postMessage({ type: 'done', id })
  } catch (err) {
    if (activeId === id) self.postMessage({ type: 'error', id, message: String(err?.message || err) })
  }
}

self.addEventListener('message', ({ data }) => {
  if (data.type === 'load') load()
  else if (data.type === 'generate') {
    activeId = data.id
    queue = queue.then(() => generate(data))
  }
  else if (data.type === 'cancel') activeId = null
})
