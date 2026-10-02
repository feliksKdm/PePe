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
}

// Only the endpoints the site's tools use: start a call, read its event
// stream, upload a reference clip, fetch generated audio, and the wake-up ping.
function allowed(space, path) {
  if (path === 'gradio_api/info' || path === 'gradio_api/upload') return true
  if (/^gradio_api\/file=\/tmp\/gradio\/[\w./-]+$/.test(path) && !path.includes('..')) return true
  const m = path.match(/^gradio_api\/call\/([a-z_]+)(?:\/[0-9a-f]{8,64})?$/)
  return Boolean(m && space.apis.includes(m[1]))
}

async function proxy(request) {
  const url = new URL(request.url)
  const space = SPACES[url.searchParams.get('space')]
  const path = (url.searchParams.get('path') || '').replace(/^\/+/, '')
  if (!space || !allowed(space, path)) return new Response('Not found', { status: 404 })

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
