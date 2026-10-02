import { useEffect, useMemo, useRef, useState } from 'react'

// Single-series SVG charts for the Data Lab. One validated hue on the dark
// surface (#9b7cf0 on #0b0d24 passes the dataviz palette checks), recessive
// hairline grid, text in text tokens — never in the series color.

const SERIES = '#9b7cf0'
const SURFACE = '#0b0d24'
const GRID = 'rgba(255,255,255,0.08)'
const INK_MUTED = '#9aa0b4'
const H = 320
const PAD = { top: 16, right: 16, bottom: 56, left: 64 }
const MAX_BARS = 40

const fmt = (v) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return String(v ?? '—')
  const a = Math.abs(v)
  if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (a >= 1e4) return `${(v / 1e3).toFixed(1)}K`
  return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

/** ~5 round tick values covering [lo, hi]. */
function niceTicks(lo, hi, count = 5) {
  if (lo === hi) [lo, hi] = [lo - 1, hi + 1]
  const step0 = (hi - lo) / count
  const mag = 10 ** Math.floor(Math.log10(step0))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0)
  const ticks = []
  // Keep stepping until the last tick covers the maximum.
  for (let v = Math.floor(lo / step) * step; ; v += step) {
    ticks.push(+v.toFixed(10))
    if (v >= hi - 1e-9) break
  }
  return ticks
}

const toNum = (v, isTime) => (isTime ? Date.parse(v) : Number(v))

function useWidth() {
  const ref = useRef(null)
  const [w, setW] = useState(640)
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)))
    if (ref.current) ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

/**
 * type: 'bar' | 'line' | 'scatter'
 * points: [{ x, y }]   (x: category for bar, number/date for line+scatter)
 */
const Chart = ({ type, points, xLabel, yLabel, xIsTime = false }) => {
  const [ref, W] = useWidth()
  const [hover, setHover] = useState(null)
  const iw = W - PAD.left - PAD.right
  const ih = H - PAD.top - PAD.bottom

  const model = useMemo(() => {
    const clean = points.filter((p) => p.y !== null && Number.isFinite(Number(p.y)))
    if (type === 'bar') {
      const data = clean.slice(0, MAX_BARS).map((p) => ({ x: String(p.x ?? 'null'), y: Number(p.y) }))
      const ys = data.map((d) => d.y)
      const ticks = niceTicks(Math.min(0, ...ys), Math.max(0, ...ys))
      return { data, ticks, yMin: ticks[0], yMax: ticks.at(-1), clipped: clean.length > MAX_BARS }
    }
    const data = clean
      .map((p) => ({ x: toNum(p.x, xIsTime), y: Number(p.y), rawX: p.x }))
      .filter((d) => Number.isFinite(d.x))
    if (type === 'line') data.sort((a, b) => a.x - b.x)
    const ys = data.map((d) => d.y)
    const xs = data.map((d) => d.x)
    const yt = niceTicks(Math.min(...ys), Math.max(...ys))
    const xt = xIsTime ? null : niceTicks(Math.min(...xs), Math.max(...xs))
    return {
      data,
      ticks: yt,
      yMin: yt[0],
      yMax: yt.at(-1),
      xTicks: xt,
      xMin: xt ? xt[0] : Math.min(...xs),
      xMax: xt ? xt.at(-1) : Math.max(...xs),
    }
  }, [points, type, xIsTime])

  if (!model.data.length) {
    return <p className="p-8 text-center text-sm text-neutral-500">No numeric values to plot for this selection.</p>
  }

  const sy = (v) => PAD.top + ih - ((v - model.yMin) / (model.yMax - model.yMin || 1)) * ih
  let body = null
  let xAxis = null
  let onMove = null

  if (type === 'bar') {
    const n = model.data.length
    const band = iw / n
    const bw = Math.min(24, Math.max(2, band - 2)) // ≤24px thick, ≥2px surface gap
    const base = sy(Math.max(0, model.yMin))
    const rotate = band < 56
    body = model.data.map((d, i) => {
      const cx = PAD.left + band * i + band / 2
      const top = sy(d.y)
      const h = Math.abs(base - top)
      const up = d.y >= 0
      const x0 = cx - bw / 2
      const r = Math.min(4, h, bw / 2)
      // 4px rounded data-end, square at the baseline.
      const path = up
        ? `M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top + r} V${base} Z`
        : `M${x0},${base} V${top - r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top - r} V${base} Z`
      return (
        <g key={i}>
          <rect x={PAD.left + band * i} y={PAD.top} width={band} height={ih} fill="transparent" onMouseEnter={() => setHover({ i, x: cx, y: top })} />
          <path d={path} fill={SERIES} opacity={hover && hover.i !== i ? 0.55 : 1} pointerEvents="none" />
          {n <= 12 && (
            <text x={cx} y={up ? top - 6 : top + 14} fill="#e8e8f0" fontSize="11" textAnchor="middle" pointerEvents="none">
              {fmt(d.y)}
            </text>
          )}
        </g>
      )
    })
    const every = Math.ceil(n / Math.max(1, Math.floor(iw / (rotate ? 18 : 64))))
    xAxis = model.data.map((d, i) =>
      i % every ? null : (
        <text
          key={i}
          x={PAD.left + band * i + band / 2}
          y={H - PAD.bottom + 16}
          fill={INK_MUTED}
          fontSize="11"
          textAnchor={rotate ? 'end' : 'middle'}
          transform={rotate ? `rotate(-40 ${PAD.left + band * i + band / 2} ${H - PAD.bottom + 16})` : undefined}
        >
          {d.x.length > 14 ? `${d.x.slice(0, 13)}…` : d.x}
        </text>
      )
    )
  } else {
    const sx = (v) => PAD.left + ((v - model.xMin) / (model.xMax - model.xMin || 1)) * iw
    const pts = model.data.map((d) => [sx(d.x), sy(d.y)])
    if (type === 'line') {
      const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ')
      const area = `${line} L${pts.at(-1)[0]},${sy(Math.max(model.yMin, 0))} L${pts[0][0]},${sy(Math.max(model.yMin, 0))} Z`
      body = (
        <>
          {model.yMin <= 0 && <path d={area} fill={SERIES} opacity="0.1" />}
          <path d={line} fill="none" stroke={SERIES} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {hover && <line x1={hover.x} x2={hover.x} y1={PAD.top} y2={PAD.top + ih} stroke="rgba(255,255,255,0.25)" />}
          {hover && <circle cx={hover.x} cy={hover.y} r="4" fill={SERIES} stroke={SURFACE} strokeWidth="2" />}
        </>
      )
    } else {
      body = pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={hover?.i === i ? 6 : 4} fill={SERIES} fillOpacity={pts.length > 400 ? 0.6 : 0.9} stroke={SURFACE} strokeWidth="2" />
      ))
    }
    onMove = (e) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const mx = ((e.clientX - rect.left) / rect.width) * W
      const my = ((e.clientY - rect.top) / rect.height) * H
      let best = -1
      let bestD = Infinity
      pts.forEach(([x, y], i) => {
        const dd = type === 'line' ? Math.abs(x - mx) : (x - mx) ** 2 + (y - my) ** 2
        if (dd < bestD) {
          bestD = dd
          best = i
        }
      })
      if (best >= 0 && (type === 'line' || bestD < 24 ** 2)) setHover({ i: best, x: pts[best][0], y: pts[best][1] })
      else setHover(null)
    }
    const xt = xIsTime
      ? Array.from({ length: 5 }, (_, i) => model.xMin + ((model.xMax - model.xMin) * i) / 4)
      : model.xTicks
    xAxis = xt.map((v, i) => (
      <text key={i} x={sx(v)} y={H - PAD.bottom + 18} fill={INK_MUTED} fontSize="11" textAnchor="middle">
        {xIsTime ? new Date(v).toISOString().slice(0, 10) : fmt(v)}
      </text>
    ))
  }

  const tip = hover && model.data[hover.i]
  return (
    <div ref={ref} className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={`${type} chart of ${yLabel} by ${xLabel}`}
        onMouseMove={onMove ?? undefined}
        onMouseLeave={() => setHover(null)}
        className="overflow-visible"
      >
        {model.ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={sy(t)} y2={sy(t)} stroke={GRID} strokeWidth="1" />
            <text x={PAD.left - 8} y={sy(t) + 4} fill={INK_MUTED} fontSize="11" textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmt(t)}
            </text>
          </g>
        ))}
        {body}
        {xAxis}
        <text x={PAD.left + iw / 2} y={H - 6} fill={INK_MUTED} fontSize="11" textAnchor="middle">
          {xLabel}
        </text>
        <text x={14} y={PAD.top + ih / 2} fill={INK_MUTED} fontSize="11" textAnchor="middle" transform={`rotate(-90 14 ${PAD.top + ih / 2})`}>
          {yLabel}
        </text>
      </svg>
      {tip && (
        <div
          className={`pointer-events-none absolute z-10 -translate-y-full rounded-lg border border-white/10 bg-primary/95 px-3 py-2 text-xs whitespace-nowrap shadow-xl ${
            hover.x > W * 0.8 ? '-translate-x-full' : hover.x < W * 0.2 ? '' : '-translate-x-1/2'
          }`}
          style={{ left: `${(hover.x / W) * 100}%`, top: hover.y - 10 }}
        >
          <p className="text-neutral-400">
            {xLabel}: <span className="text-neutral-100">{type === 'bar' ? tip.x : xIsTime ? String(tip.rawX) : fmt(tip.x)}</span>
          </p>
          <p className="text-neutral-400">
            {yLabel}: <span className="font-medium text-neutral-100">{fmt(tip.y)}</span>
          </p>
        </div>
      )}
      {model.clipped && <p className="mt-1 text-center text-[11px] text-neutral-500">Showing the first {MAX_BARS} bars.</p>}
    </div>
  )
}

export default Chart
