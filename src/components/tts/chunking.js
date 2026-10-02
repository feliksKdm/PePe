// Pure helpers for the Kokoro worker — kept separate so they can be tested
// without a browser.

const FIRST_CHUNK_CHARS = 60 // short first chunk → audio starts fast
const CHUNK_CHARS = 120 // small chunks pipeline better: playback can start sooner
const MAX_PIECE = 300 // Kokoro truncates beyond ~510 phonemes; stay well under

// Break an over-long sentence at the last comma/semicolon (else space) that fits.
function splitLong(text, start, end) {
  const pieces = []
  while (end - start > MAX_PIECE) {
    const window = text.slice(start, start + MAX_PIECE)
    let cut = Math.max(window.lastIndexOf(', '), window.lastIndexOf('; '), window.lastIndexOf(': '))
    if (cut < MAX_PIECE / 3) cut = window.lastIndexOf(' ')
    if (cut <= 0) cut = MAX_PIECE - 1
    pieces.push({ start, end: start + cut + 1 })
    start += cut + 1
    while (start < end && /\s/.test(text[start])) start++
  }
  if (end > start) pieces.push({ start, end })
  return pieces
}

/**
 * Split text into synthesis chunks made of whole sentences.
 * Returns { text, start, end } with offsets into the original string, so the
 * UI can highlight exactly what is being spoken.
 */
export function chunkText(text) {
  const sentences = []
  const re = /[^.!?…\n]+(?:[.!?…]+["')\]]*|\n+|$)/g
  let m
  while ((m = re.exec(text)) && m[0]) {
    const lead = m[0].length - m[0].trimStart().length
    const body = m[0].trim()
    if (body) sentences.push(...splitLong(text, m.index + lead, m.index + lead + body.length))
  }

  const chunks = []
  let cur = null
  for (const s of sentences) {
    const limit = chunks.length ? CHUNK_CHARS : FIRST_CHUNK_CHARS
    if (cur && s.end - cur.start <= limit) {
      cur.end = s.end
    } else {
      if (cur) chunks.push(cur)
      cur = { ...s }
    }
  }
  if (cur) chunks.push(cur)
  return chunks.map((c) => ({ ...c, text: text.slice(c.start, c.end) }))
}

const PAUSE = 0.18 // longest pause allowed anywhere, in seconds

/**
 * Kokoro pads every clip with ~0.3 s of silence before and ~0.5 s after, and
 * leaves ~0.4 s after every full stop inside a clip. Played back, that sounds
 * like it's stalling on every dot. Trim the ends and cap every internal pause
 * at PAUSE (commas, ~0.16 s, are left alone), with short crossfades so the
 * cuts don't click.
 */
export function shapeSilence(samples, sampleRate, { lead = 0.03, maxPause = PAUSE, threshold = 0.02 } = {}) {
  const win = Math.round(sampleRate * 0.01) // 10 ms envelope windows
  const frames = Math.floor(samples.length / win)
  const loud = new Uint8Array(frames)
  for (let f = 0; f < frames; f++) {
    for (let j = f * win, end = j + win; j < end; j++) {
      if (Math.abs(samples[j]) >= threshold) {
        loud[f] = 1
        break
      }
    }
  }
  const first = loud.indexOf(1)
  if (first < 0) return samples.slice(0, 0)
  const last = loud.lastIndexOf(1)

  // Keep-ranges in sample offsets: speech plus at most maxPause of each gap.
  const keepFrames = Math.round(maxPause / 0.01)
  const half = keepFrames >> 1
  const ranges = []
  let from = Math.max(0, first - Math.round(lead / 0.01)) * win
  for (let f = first; f <= last; ) {
    if (loud[f]) {
      f++
      continue
    }
    let g = f
    while (!loud[g]) g++
    if (g - f > keepFrames) {
      ranges.push([from, (f + half) * win])
      from = (g - (keepFrames - half)) * win
    }
    f = g
  }
  // The clip's tail becomes the pause before the next chunk.
  ranges.push([from, Math.min(samples.length, (last + 1 + keepFrames) * win)])

  const total = ranges.reduce((n, [a, b]) => n + b - a, 0)
  const out = new Float32Array(total)
  const fade = Math.round(sampleRate * 0.005)
  let o = 0
  for (const [a, b] of ranges) {
    out.set(samples.subarray(a, b), o)
    const n = Math.min(fade, (b - a) >> 1)
    for (let i = 0; i < n; i++) {
      out[o + i] *= i / n
      out[o + (b - a) - 1 - i] *= i / n
    }
    o += b - a
  }
  return out
}
