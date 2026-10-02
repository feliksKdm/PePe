import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Hugging Face Spaces behind The Lab. In production api/space.js proxies
// /hf/<space>/* and adds HF_TOKEN; these mirror it for `vite` and `vite preview`.
const SPACES = {
  'voice-lab': 'https://felikskdm-voice-lab.hf.space',
  'kokoro-tts': 'https://felikskdm-kokoro-tts.hf.space',
}
// Dev only: use HF_TOKEN, or the token saved by `hf auth login`, so local
// testing runs on your ZeroGPU quota instead of the tiny anonymous one.
// It stays in the dev server; it's never bundled or sent to the browser.
function devToken() {
  if (process.env.HF_TOKEN) return process.env.HF_TOKEN
  try {
    return readFileSync(join(homedir(), '.cache', 'huggingface', 'token'), 'utf8').trim()
  } catch {
    return ''
  }
}
const token = devToken()

const spaceProxy = Object.fromEntries(
  Object.entries(SPACES).map(([name, target]) => [
    `/hf/${name}`,
    {
      target,
      changeOrigin: true,
      rewrite: (path) => path.slice(`/hf/${name}`.length),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  ])
)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: spaceProxy },
  preview: { proxy: spaceProxy },
  // ES workers so the Kokoro TTS worker can code-split its ONNX runtime
  worker: { format: 'es' },
})
