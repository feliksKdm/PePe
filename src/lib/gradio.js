// Minimal client for Gradio's HTTP API (Gradio 5/6), used to drive Hugging
// Face Spaces from the site's own UI instead of embedding the Gradio page.

/** Fire-and-forget request that wakes a sleeping Space early. */
export function wakeSpace(base) {
  fetch(`${base}/gradio_api/info`).catch(() => {})
}

// Gradio's /call API answers with Server-Sent Events: "generating" for each
// yield, "complete", "error", and heartbeats.
export async function* readEvents(response) {
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

function errorMessage(data) {
  try {
    const parsed = JSON.parse(data)
    if (typeof parsed === 'string') return parsed
    if (parsed?.message) return parsed.message
  } catch {
    if (data && data !== 'null') return data
  }
  return 'The server ran into a problem. Please try again.'
}

/** Start a call to `apiName` and return the event stream's response. */
export async function openCall(base, apiName, data, { signal } = {}) {
  const start = await fetch(`${base}/gradio_api/call/${apiName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
    signal,
  })
  if (!start.ok) throw new Error(`Server responded ${start.status}`)
  const { event_id: eventId } = await start.json()
  const stream = await fetch(`${base}/gradio_api/call/${apiName}/${eventId}`, { signal })
  if (!stream.ok) throw new Error(`Server responded ${stream.status}`)
  return stream
}

/** Call a non-streaming endpoint and resolve with its output array. */
export async function callSpace(base, apiName, data, opts) {
  const stream = await openCall(base, apiName, data, opts)
  for await (const { event, data: payload } of readEvents(stream)) {
    if (event === 'error') throw new Error(errorMessage(payload))
    if (event === 'complete') return JSON.parse(payload)
  }
  throw new Error('The connection closed before the result arrived.')
}

/** Upload a file and return the FileData object Gradio expects as an input. */
export async function uploadToSpace(base, blob, name, { signal } = {}) {
  const form = new FormData()
  form.append('files', blob, name)
  const res = await fetch(`${base}/gradio_api/upload`, { method: 'POST', body: form, signal })
  if (!res.ok) throw new Error(`Upload failed (${res.status})`)
  const [path] = await res.json()
  return { path, orig_name: name, meta: { _type: 'gradio.FileData' } }
}
