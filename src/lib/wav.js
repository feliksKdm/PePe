/** Encode mono float chunks as a 16-bit PCM WAV blob. */
export function encodeWav(chunks, sampleRate) {
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

/**
 * Turn any browser-decodable audio (a recording, an mp3/m4a/wav upload) into
 * a mono 24 kHz WAV no longer than `maxSeconds`, the format the voice model
 * wants. Resolves with { blob, duration, trimmed }.
 */
export async function toReferenceWav(blob, { maxSeconds = 10, sampleRate = 24000 } = {}) {
  const ctx = new AudioContext()
  let decoded
  try {
    decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
  } finally {
    ctx.close()
  }
  const duration = Math.min(decoded.duration, maxSeconds)
  const frames = Math.max(1, Math.round(duration * sampleRate))
  // OfflineAudioContext does the resampling and down-mixing to mono.
  const offline = new OfflineAudioContext(1, frames, sampleRate)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()
  const rendered = await offline.startRendering()
  return {
    blob: encodeWav([rendered.getChannelData(0)], sampleRate),
    duration,
    trimmed: decoded.duration > maxSeconds + 0.05,
  }
}
