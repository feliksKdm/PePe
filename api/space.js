// Proxy from the site to its Hugging Face Spaces, served at /hf/<space>/<path>
// (see vercel.json). It adds the owner's HF token server-side, so visitors'
// generations run on the owner's ZeroGPU quota instead of the tiny anonymous
// allowance — and the token never reaches the browser.
//
// Setup: Vercel → Project → Settings → Environment Variables → HF_TOKEN
// (a Hugging Face *read* token). Without it, requests go through anonymously.

const SPACES = {
  'voice-lab': { origin: 'https://felikskdm-voice-lab.hf.space', apis: ['preset', 'transcribe', 'clone'] },
  'kokoro-tts': { origin: 'https://felikskdm-kokoro-tts.hf.space', apis: ['speak'] },
  'image-studio': { origin: 'https://felikskdm-image-studio.hf.space', apis: ['generate', 'upscale'] },
  'transcriber': { origin: 'https://felikskdm-transcriber.hf.space', apis: ['transcribe'] },
  'sound-studio': { origin: 'https://felikskdm-sound-studio.hf.space', apis: ['generate'] },
  'sql-copilot': { origin: 'https://felikskdm-sql-copilot.hf.space', apis: ['ask'] },
  'video-studio': { origin: 'https://felikskdm-video-studio.hf.space', apis: ['generate'] },
}

// Only the endpoints the site's tools use: start a call, read its event
// stream, upload a reference clip, fetch generated audio, and the wake-up ping.
function allowed(space, path) {
  if (path === 'gradio_api/info' || path === 'gradio_api/upload') return true
  if (/^gradio_api\/file=\/tmp\/gradio\/[\w./-]+$/.test(path) && !path.includes('..')) return true
  const m = path.match(/^gradio_api\/call\/([a-z_]+)(?:\/[0-9a-f]{8,64})?$/)
  return Boolean(m && space.apis.includes(m[1]))
}

// Best-effort per-IP rate limit on starting GPU calls, so one visitor can't
// burn the whole day's ZeroGPU quota. In-memory, so it's per function instance
// (Vercel reuses warm instances) — enough to stop casual abuse.
const LIMITS = { 'video-studio:generate': 5, 'sound-studio:generate': 15 } // per hour
const DEFAULT_LIMIT = 120
const WINDOW_MS = 60 * 60 * 1000
const hits = new Map()

function rateLimited(ip, key) {
  const now = Date.now()
  const bucket = `${ip}|${key}`
  const recent = (hits.get(bucket) || []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= (LIMITS[key] ?? DEFAULT_LIMIT)) {
    hits.set(bucket, recent)
    return Math.ceil((WINDOW_MS - (now - recent[0])) / 60000)
  }
  recent.push(now)
  hits.set(bucket, recent)
  if (hits.size > 5000) hits.clear() // keep memory bounded
  return 0
}

async function proxy(request) {
  const url = new URL(request.url)
  const space = SPACES[url.searchParams.get('space')]
  const path = (url.searchParams.get('path') || '').replace(/^\/+/, '')
  if (!space || !allowed(space, path)) return new Response('Not found', { status: 404 })

  const call = path.match(/^gradio_api\/call\/([a-z_]+)$/)
  if (request.method === 'POST' && call) {
    const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
    const wait = rateLimited(ip, `${url.searchParams.get('space')}:${call[1]}`)
    if (wait) {
      return new Response(JSON.stringify({ error: `Rate limit reached — try again in ${wait} min.` }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      })
    }
  }

  const target = new URL(`${space.origin}/${path}`)
  for (const [k, v] of url.searchParams) if (k !== 'space' && k !== 'path') target.searchParams.set(k, v)

  const headers = {}
  const type = request.headers.get('content-type')
  if (type) headers['content-type'] = type
  if (process.env.HF_TOKEN) headers.authorization = `Bearer ${process.env.HF_TOKEN}`

  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === 'POST' ? request.body : undefined,
    duplex: 'half',
  })
  // Stream the body straight through — event streams must not be buffered.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') || 'application/octet-stream',
      'cache-control': 'no-store',
    },
  })
}

export const GET = proxy
export const POST = proxy
