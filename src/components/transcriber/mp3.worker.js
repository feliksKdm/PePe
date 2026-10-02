import { Mp3Encoder } from '@breezystack/lamejs'

// Encodes mono float PCM to MP3 off the main thread.
// In:  { samples: Float32Array, sampleRate, kbps }
// Out: { type: 'progress', value } … { type: 'done', blob }
self.onmessage = ({ data: { samples, sampleRate, kbps } }) => {
  const encoder = new Mp3Encoder(1, sampleRate, kbps)
  const block = 1152 * 64
  const parts = []
  const pcm = new Int16Array(block)
  for (let i = 0; i < samples.length; i += block) {
    const n = Math.min(block, samples.length - i)
    for (let j = 0; j < n; j++) {
      const s = Math.max(-1, Math.min(1, samples[i + j]))
      pcm[j] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    const out = encoder.encodeBuffer(pcm.subarray(0, n))
    if (out.length) parts.push(new Uint8Array(out))
    self.postMessage({ type: 'progress', value: (i + n) / samples.length })
  }
  parts.push(new Uint8Array(encoder.flush()))
  self.postMessage({ type: 'done', blob: new Blob(parts, { type: 'audio/mpeg' }) })
}
