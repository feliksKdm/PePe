// Transcript formatting helpers (pure, no browser APIs).

const pad = (n, w = 2) => String(Math.floor(n)).padStart(w, '0')

/** 75.5 → "01:15" (or "1:01:15" past an hour). */
export function clock(seconds) {
  const s = Math.max(0, seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`
}

function stamp(seconds, sep) {
  const s = Math.max(0, seconds)
  const ms = Math.round((s % 1) * 1000)
  const whole = Math.floor(s) + (ms === 1000 ? 1 : 0)
  return `${pad(whole / 3600)}:${pad((whole % 3600) / 60)}:${pad(whole % 60)}${sep}${pad(ms % 1000, 3)}`
}

export function toSrt(segments) {
  return segments
    .map((s, i) => `${i + 1}\n${stamp(s.start, ',')} --> ${stamp(s.end, ',')}\n${s.text}\n`)
    .join('\n')
}

export function toVtt(segments) {
  return `WEBVTT\n\n${segments.map((s) => `${stamp(s.start, '.')} --> ${stamp(s.end, '.')}\n${s.text}\n`).join('\n')}`
}

export function toTxt(segments, withTimes = false) {
  return segments.map((s) => (withTimes ? `[${clock(s.start)}] ${s.text}` : s.text)).join('\n')
}

export const wordCount = (text) => (text.trim() ? text.trim().split(/\s+/).length : 0)
