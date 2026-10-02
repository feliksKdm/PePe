import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // ES workers so the Kokoro TTS worker can code-split its ONNX runtime
  worker: { format: 'es' },
})
