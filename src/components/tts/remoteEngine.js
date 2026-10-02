import { shapeSilence } from './chunking.js'

// Kokoro-82M on a ZeroGPU Space (hf-spaces/kokoro-tts). Speech renders far
// faster than real time there, so playback starts almost immediately.
export const SPACE_URL = 'https://felikskdm-kokoro-tts.hf.space'

// Give up on the Space (and fall back to the in-browser model) if the first
// chunk hasn't arrived by then — e.g. the Space is asleep or rebuilding.
const FIRST_CHUNK_TIMEOUT = 15000

/** Fire-and-forget request that wakes the Space before the visitor hits Speak. */
export function wakeSpace() {
  fetch(`${SPACE_URL}/gradio_api/info`).catch(() => {})
}

function decodePcm(b64) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1)
  const out = new Float32Array(pcm.length)
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 32768
  return out
}

// Gradio's /call API answers with Server-Sent Events: "generating" for each
// yield, "complete" (repeating the last one), "error", and heartbeats.
async function* readEvents(response) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    let split
    while ((split = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, split)
      buffer = buffer.slice(split + 2)
      let event = 'message'
      let data = ''
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      yield { event, data }
    }
  }
}

/**
 * Stream speech for `chunks` ({ text, start, end }[]) from the Space.
 * Calls `onChunk` with the same shape the local worker posts, so the player
 * doesn't care which engine produced the audio. Resolves when all chunks
 * arrived; rejects on network/Space errors (`received` tells how far it got).
 */
export async function streamFromSpace({ chunks, voice, speed, signal, onChunk }) {
  const state = { received: 0 }
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), FIRST_CHUNK_TIMEOUT)
  const abort = AbortSignal.any([signal, timeout.signal])

  try {
    const start = await fetch(`${SPACE_URL}/gradio_api/call/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [JSON.stringify(chunks.map((c) => c.text)), voice, speed] }),
      signal: abort,
    })
    if (!start.ok) throw new Error(`Space responded ${start.status}`)
    const { event_id: eventId } = await start.json()

    const stream = await fetch(`${SPACE_URL}/gradio_api/call/speak/${eventId}`, { signal: abort })
    if (!stream.ok) throw new Error(`Space responded ${stream.status}`)

    let last = performance.now()
    for await (const { event, data } of readEvents(stream)) {
      if (event === 'error') throw new Error(data && data !== 'null' ? data : 'Space error')
      if (event !== 'generating' && event !== 'complete') continue
      const payload = JSON.parse(data)?.[0]
      if (!payload || payload.i < state.received) continue // "complete" repeats the last chunk
      clearTimeout(timer)

      const now = performance.now()
      const chunk = chunks[payload.i]
      const audio = shapeSilence(decodePcm(payload.pcm), payload.sr)
      // First chunk: pure compute time from the server (connection set-up
      // isn't a sign of slow synthesis). Later chunks: real arrival spacing.
      const genSeconds = state.received ? (now - last) / 1000 : payload.gen
      last = now
      state.received = payload.i + 1
      if (audio.length) {
        onChunk({ start: chunk.start, end: chunk.end, audio, sampleRate: payload.sr, genSeconds })
      }
      if (state.received === chunks.length) return state
    }
    throw new Error('Stream ended early')
  } catch (err) {
    err.received = state.received
    throw err
  } finally {
    clearTimeout(timer)
  }
}
