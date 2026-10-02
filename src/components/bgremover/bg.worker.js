import { pipeline, RawImage } from '@huggingface/transformers'

// Background removal entirely in the browser (transformers.js + ONNX Runtime).
// In:  { type: 'run', id, model, blob }
// Out: { type: 'progress', model, value } | { type: 'ready', model, device }
//      { type: 'result', id, mask: ImageData-like {width,height,data} , ms } | { type: 'error', id, message }

const MODELS = {
  general: { repo: 'briaai/RMBG-1.4', dtype: 'q8' },
  portrait: { repo: 'Xenova/modnet', dtype: 'q8' },
}

const loaded = {}

async function hasWebGPU() {
  try {
    return !!(navigator.gpu && (await navigator.gpu.requestAdapter()))
  } catch {
    return false
  }
}

function load(model) {
  if (!loaded[model]) {
    loaded[model] = (async () => {
      const { repo, dtype } = MODELS[model]
      const files = {}
      const device = (await hasWebGPU()) ? 'webgpu' : 'wasm'
      const segmenter = await pipeline('background-removal', repo, {
        // Quantized weights are WASM-friendly; WebGPU wants full precision.
        dtype: device === 'webgpu' ? 'fp32' : dtype,
        device,
        progress_callback: (p) => {
          if (p.status === 'progress' && p.total) {
            files[p.file] = p
            const all = Object.values(files)
            const value = all.reduce((n, f) => n + f.loaded, 0) / all.reduce((n, f) => n + f.total, 0)
            self.postMessage({ type: 'progress', model, value })
          }
        },
      })
      self.postMessage({ type: 'ready', model, device })
      return segmenter
    })()
    loaded[model].catch(() => delete loaded[model])
  }
  return loaded[model]
}

self.addEventListener('message', async ({ data }) => {
  if (data.type !== 'run') return
  try {
    const segmenter = await load(data.model)
    const image = await RawImage.fromBlob(data.blob)
    const t0 = performance.now()
    const [cutout] = await segmenter(image)
    // Send only the alpha channel back; the page composites at full quality.
    const alpha = new Uint8ClampedArray(cutout.width * cutout.height)
    for (let i = 0; i < alpha.length; i++) alpha[i] = cutout.data[i * 4 + 3]
    self.postMessage(
      { type: 'result', id: data.id, width: cutout.width, height: cutout.height, alpha, ms: Math.round(performance.now() - t0) },
      [alpha.buffer]
    )
  } catch (err) {
    self.postMessage({ type: 'error', id: data.id, message: String(err?.message || err) })
  }
})
