import { useCallback, useEffect, useMemo, useState } from 'react'
import Chart from './Chart.jsx'
import { exportCsv, getDb, ident, listTables, loadBuffer, loadFile, profile, runQuery, tableName } from './duck.js'

// Synthetic sample: a year of orders for a small coffee chain, generated in DuckDB.
const COFFEE_SQL = `
CREATE OR REPLACE TABLE coffee_sales AS
WITH base AS (
  SELECT i AS order_id,
         DATE '2025-01-01' + CAST(floor(random() * 365) AS INTEGER) AS order_date,
         1 + CAST(floor(random() * 8) AS INTEGER) AS p,
         1 + CAST(floor(random() * 4) AS INTEGER) AS s,
         1 + CAST(floor(random() * random() * 4) AS INTEGER) AS quantity
  FROM range(1, 12001) t(i)
)
SELECT order_id, order_date,
       ['Downtown', 'Campus', 'Riverside', 'Airport'][s] AS store,
       ['Espresso', 'Latte', 'Cappuccino', 'Cold Brew', 'Matcha Latte', 'Croissant', 'Bagel', 'Muffin'][p] AS product,
       ['Coffee', 'Coffee', 'Coffee', 'Coffee', 'Tea', 'Bakery', 'Bakery', 'Bakery'][p] AS category,
       [3.0, 4.5, 4.25, 4.75, 5.0, 3.5, 2.75, 3.25][p] AS unit_price,
       quantity,
       round([3.0, 4.5, 4.25, 4.75, 5.0, 3.5, 2.75, 3.25][p] * quantity, 2) AS revenue
FROM base`

const SAMPLES = [
  { key: 'coffee', name: 'Coffee sales', emoji: '☕', detail: '12k orders · generated', sql: COFFEE_SQL, table: 'coffee_sales' },
  { key: 'titanic', name: 'Titanic', emoji: '🚢', detail: 'julien-c/titanic-survival', hf: 'julien-c/titanic-survival' },
  { key: 'iris', name: 'Iris', emoji: '🌸', detail: 'scikit-learn/iris', hf: 'scikit-learn/iris' },
  { key: 'wine', name: 'Wine quality', emoji: '🍷', detail: 'codesignal/wine-quality', hf: 'codesignal/wine-quality' },
]

const MAX_REMOTE_MB = 200

const Label = ({ children, right }) => (
  <div className="flex items-baseline justify-between gap-3">
    <p className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">{children}</p>
    {right}
  </div>
)

const fmtCell = (v) => {
  if (v === null || v === undefined) return <span className="text-neutral-600">null</span>
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 4 })
  if (typeof v === 'boolean') return String(v)
  return String(v)
}

const compact = (n) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : Number(n).toLocaleString()

/** Suggested queries built from the table's profile. */
function suggestions(table, prof) {
  if (!prof) return []
  const t = ident(table)
  // Identifier columns (order_id, PassengerId…) make meaningless charts.
  const idLike = (c) => /(^|_)id$/i.test(c.name) || /[a-z]Id$/.test(c.name) || c.unique >= prof.total * 0.95
  const nums = prof.columns.filter((c) => c.numeric && !idLike(c))
  const cats = prof.columns.filter((c) => !c.numeric && !/DATE|TIME/i.test(c.type) && c.unique > 1 && c.unique <= 50)
  const dates = prof.columns.filter((c) => /DATE|TIMESTAMP/i.test(c.type))
  const out = [{ label: 'First 100 rows', sql: `SELECT * FROM ${t} LIMIT 100` }]
  if (cats[0]) out.push({ label: `Count by ${cats[0].name}`, sql: `SELECT ${ident(cats[0].name)}, count(*) AS rows\nFROM ${t}\nGROUP BY 1\nORDER BY 2 DESC` })
  if (cats[0] && nums[0]) {
    const n = nums.at(-1)
    out.push({
      label: `Average ${n.name} by ${cats[0].name}`,
      sql: `SELECT ${ident(cats[0].name)}, round(avg(${ident(n.name)}), 2) AS avg_${n.name.replace(/\W+/g, '_')}\nFROM ${t}\nGROUP BY 1\nORDER BY 2 DESC`,
    })
  }
  if (dates[0] && nums[0]) {
    const n = nums.at(-1)
    out.push({
      label: `${n.name} per month`,
      sql: `SELECT date_trunc('month', ${ident(dates[0].name)}) AS month, round(sum(${ident(n.name)}), 2) AS total_${n.name.replace(/\W+/g, '_')}\nFROM ${t}\nGROUP BY 1\nORDER BY 1`,
    })
  }
  if (nums.length >= 2) out.push({ label: `${nums[0].name} vs ${nums[1].name}`, sql: `SELECT ${ident(nums[0].name)}, ${ident(nums[1].name)}\nFROM ${t}` })
  return out
}

/** Pick a sensible default chart for a result. */
function autoChart(result) {
  if (!result || result.columns.length < 2) return null
  const cols = result.columns
  const numIdx = cols.map((c, i) => (c.kind === 'number' ? i : -1)).filter((i) => i >= 0)
  if (!numIdx.length) return null
  const nonNum = cols.findIndex((c) => c.kind !== 'number')
  if (nonNum >= 0) {
    const y = numIdx.find((i) => i !== nonNum) ?? numIdx[0]
    const kind = cols[nonNum].kind
    return { type: kind === 'date' || kind === 'timestamp' ? 'line' : 'bar', x: nonNum, y }
  }
  if (numIdx.length >= 2) return { type: 'scatter', x: numIdx[0], y: numIdx[1] }
  return null
}

const DataLab = () => {
  const [engine, setEngine] = useState('idle') // idle | loading | ready | error
  const [tables, setTables] = useState([])
  const [active, setActive] = useState(null)
  const [prof, setProf] = useState(null)
  const [tab, setTab] = useState('profile') // profile | sql
  const [sql, setSql] = useState('')
  const [result, setResult] = useState(null)
  const [view, setView] = useState('table') // table | chart
  const [chart, setChart] = useState(null) // { type, x, y }
  const [busy, setBusy] = useState('') // status text while working
  const [error, setError] = useState('')
  const [hfName, setHfName] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const boot = useCallback(async () => {
    if (engine === 'ready') return true
    setEngine('loading')
    try {
      await getDb()
      setEngine('ready')
      return true
    } catch (err) {
      setEngine('error')
      setError(`Couldn't start the database engine (${err.message}).`)
      return false
    }
  }, [engine])

  const refresh = async (focus) => {
    const list = await listTables()
    setTables(list)
    if (focus) await openTable(focus)
  }

  const openTable = async (name) => {
    setActive(name)
    setProf(null)
    setResult(null)
    setTab('profile')
    setBusy('Profiling columns…')
    try {
      const p = await profile(name)
      setProf(p)
      setSql(`SELECT *\nFROM ${ident(name)}\nLIMIT 100`)
    } catch (err) {
      setError(`Couldn't profile ${name}: ${err.message}`)
    } finally {
      setBusy('')
    }
  }

  const withEngine = async (label, fn) => {
    setError('')
    setBusy(label)
    try {
      if (!(await boot())) return
      await fn()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const onFiles = (files) => {
    const file = files?.[0]
    if (!file) return
    if (!/\.(csv|tsv|txt|parquet|json|jsonl|ndjson)$/i.test(file.name)) {
      setError('Supported files: CSV, TSV, Parquet, JSON and NDJSON.')
      return
    }
    withEngine(`Loading ${file.name}…`, async () => {
      const name = tableName(file.name, tables.map((t) => t.name))
      await loadFile(file, name)
      await refresh(name)
    })
  }

  const loadHf = (dataset, preferSplit) =>
    withEngine(`Finding ${dataset} on Hugging Face…`, async () => {
      const id = dataset.trim().replace(/^https?:\/\/huggingface\.co\/datasets\//, '').replace(/\/$/, '')
      if (!/^[\w.-]+\/[\w.-]+$/.test(id)) throw new Error('Use the form owner/dataset, e.g. julien-c/titanic-survival.')
      const res = await fetch(`https://datasets-server.huggingface.co/parquet?dataset=${encodeURIComponent(id)}`)
      const info = await res.json()
      const files = info.parquet_files || []
      if (!files.length) throw new Error(info.error || `No Parquet export found for ${id}. Is it public?`)
      const file = files.find((f) => f.split === preferSplit) || files.find((f) => f.split === 'train') || files[0]
      if (file.size > MAX_REMOTE_MB * 1024 * 1024) throw new Error(`${id} is ${(file.size / 1e6).toFixed(0)} MB — over the ${MAX_REMOTE_MB} MB browser limit.`)
      setBusy(`Downloading ${id} (${(file.size / 1e6).toFixed(1)} MB)…`)
      const data = new Uint8Array(await (await fetch(file.url)).arrayBuffer())
      const name = tableName(`${id.split('/')[1]}${file.split !== 'train' ? `_${file.split}` : ''}`, tables.map((t) => t.name))
      await loadBuffer(data, 'data.parquet', name)
      await refresh(name)
    })

  const loadSample = (s) => {
    if (s.hf) return loadHf(s.hf)
    return withEngine(`Generating ${s.name}…`, async () => {
      const { conn } = await getDb()
      await conn.query(s.sql)
      await refresh(s.table)
    })
  }

  const run = async (text = sql) => {
    if (!text.trim()) return
    setError('')
    setBusy('Running…')
    try {
      if (!(await boot())) return
      const r = await runQuery(text)
      setResult({ ...r, sql: text })
      const c = autoChart(r)
      setChart(c)
      setView(c && r.rowCount > 1 && r.rowCount <= 5000 ? 'chart' : 'table')
      refresh()
    } catch (err) {
      setResult(null)
      setError(err.message.replace(/^.*?Error: /, ''))
    } finally {
      setBusy('')
    }
  }

  const download = async () => {
    try {
      const bytes = await exportCsv(result.sql)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([bytes], { type: 'text/csv' }))
      a.download = `${active || 'query'}-result.csv`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    } catch (err) {
      setError(`Export failed: ${err.message}`)
    }
  }

  // Warm the engine in the background so the first load feels instant.
  useEffect(() => {
    const t = setTimeout(() => boot(), 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sugg = useMemo(() => (active ? suggestions(active, prof) : []), [active, prof])
  const points = useMemo(() => {
    if (!result || !chart) return []
    return result.rows.map((r) => ({ x: r[chart.x], y: r[chart.y] }))
  }, [result, chart])

  const missingPct = prof ? prof.columns.reduce((n, c) => n + c.nullPct, 0) / Math.max(1, prof.columns.length) : 0

  return (
    <div className="flex flex-col gap-6">
      {/* ---------- load ---------- */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr]">
        <button
          onClick={() => document.getElementById('datalab-file')?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            onFiles(e.dataTransfer.files)
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-5 text-center transition-all ${
            dragOver ? 'border-aqua bg-aqua/10' : 'border-white/20 bg-white/[0.03] hover:border-aqua/50'
          }`}
        >
          <span className="text-3xl">📂</span>
          <span className="text-sm font-medium">Drop a data file</span>
          <span className="text-xs text-neutral-500">CSV · TSV · Parquet · JSON — read locally, never uploaded</span>
        </button>
        <input id="datalab-file" type="file" accept=".csv,.tsv,.txt,.parquet,.json,.jsonl,.ndjson" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = '' }} />

        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-primary/60 p-5">
          <Label>🤗 Any public Hugging Face dataset</Label>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (hfName.trim()) loadHf(hfName)
            }}
            className="flex gap-2"
          >
            <input
              value={hfName}
              onChange={(e) => setHfName(e.target.value)}
              placeholder="owner/dataset"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm outline-none focus:border-aqua/50"
            />
            <button type="submit" disabled={!!busy} className="cursor-pointer rounded-lg bg-radial from-lavender to-royal px-4 text-sm font-medium hover-animation disabled:opacity-50">
              Load
            </button>
          </form>
          <p className="text-[11px] text-neutral-500">Uses the dataset&apos;s Parquet export (first train split, up to {MAX_REMOTE_MB} MB).</p>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-primary/60 p-5">
          <Label>Or start with a sample</Label>
          <div className="grid grid-cols-2 gap-2">
            {SAMPLES.map((s) => (
              <button
                key={s.key}
                onClick={() => loadSample(s)}
                disabled={!!busy}
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 p-2.5 text-left transition-all hover:border-aqua/40 disabled:cursor-wait"
              >
                <span className="text-xl">{s.emoji}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm">{s.name}</span>
                  <span className="block truncate font-mono text-[10px] text-neutral-500">{s.detail}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {(busy || error) && (
        <div className="flex flex-col gap-2">
          {busy && (
            <p className="flex items-center gap-2 text-sm text-neutral-300">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              {engine === 'loading' ? 'Starting DuckDB in your browser (one-time ~7 MB download)…' : busy}
            </p>
          )}
          {error && (
            <p className="rounded-lg border border-coral/30 bg-coral/5 p-3 font-mono text-xs whitespace-pre-wrap text-coral" role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      {/* ---------- workspace ---------- */}
      {tables.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <div className="flex flex-col gap-2 lg:sticky lg:top-28 lg:self-start">
            <Label>Tables</Label>
            {tables.map((t) => (
              <button
                key={t.name}
                onClick={() => openTable(t.name)}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-all ${
                  active === t.name ? 'border-lavender bg-lavender/15' : 'border-white/10 hover:border-aqua/40'
                }`}
              >
                <span className="truncate font-mono text-xs">{t.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-neutral-500">{compact(t.rows)}</span>
              </button>
            ))}
            <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">Query across tables with JOINs — they all live in the same in-browser database.</p>
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <div role="tablist" className="flex w-fit rounded-full border border-white/10 bg-primary/60 p-1">
              {[
                ['profile', '📊 Profile'],
                ['sql', '⌨️ SQL & charts'],
              ].map(([k, l]) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => setTab(k)}
                  className={`cursor-pointer rounded-full px-4 py-1.5 text-sm transition-all ${
                    tab === k ? 'bg-gradient-to-r from-lavender to-royal text-white' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            {tab === 'profile' &&
              (prof ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      ['Rows', compact(prof.total)],
                      ['Columns', prof.columns.length],
                      ['Missing cells', `${missingPct.toFixed(1)}%`],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-2xl border border-white/10 bg-gradient-to-b from-storm/70 to-indigo/70 p-4">
                        <p className="text-xs text-neutral-400">{k}</p>
                        <p className="mt-1 text-2xl font-semibold">{v}</p>
                      </div>
                    ))}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {prof.columns.map((c) => (
                      <div key={c.name} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-primary/50 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate font-mono text-sm text-neutral-100">{c.name}</p>
                          <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] text-neutral-400">{c.type}</span>
                        </div>
                        {c.bins ? (
                          <div className="flex h-12 items-end gap-[2px]" title="Distribution">
                            {c.bins.map((b, i) => (
                              <span
                                key={i}
                                className="flex-1 rounded-t-[2px] bg-[#9b7cf0]"
                                style={{ height: `${Math.max(2, (b / Math.max(...c.bins)) * 100)}%`, opacity: b ? 1 : 0.15 }}
                              />
                            ))}
                          </div>
                        ) : c.top ? (
                          <div className="flex flex-col gap-1.5">
                            {c.top.map((t) => (
                              <div key={t.value} className="flex items-center gap-2 text-[11px]">
                                <span className="w-20 shrink-0 truncate text-neutral-300" title={t.value}>
                                  {t.value}
                                </span>
                                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                                  <span className="block h-full rounded-full bg-[#9b7cf0]" style={{ width: `${Math.max(2, t.share * 100)}%` }} />
                                </span>
                                <span className="w-10 shrink-0 text-right font-mono text-neutral-500">{(t.share * 100).toFixed(0)}%</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="h-12" />
                        )}
                        <dl className="grid grid-cols-3 gap-1 text-[11px]">
                          {[
                            ['nulls', `${c.nullPct.toFixed(1)}%`],
                            ['unique', compact(c.unique)],
                            c.numeric ? ['mean', c.avg?.toLocaleString(undefined, { maximumFractionDigits: 2 })] : ['min', c.min],
                          ].map(([k, v]) => (
                            <div key={k} className="min-w-0">
                              <dt className="text-neutral-500">{k}</dt>
                              <dd className="truncate text-neutral-200">{v ?? '—'}</dd>
                            </div>
                          ))}
                        </dl>
                        {c.bins && (
                          <p className="font-mono text-[10px] text-neutral-500">
                            {c.numeric ? `${Number(c.min).toLocaleString()} → ${Number(c.max).toLocaleString()}` : `${c.min} → ${c.max}`}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-neutral-500">Profiling…</p>
              ))}

            {tab === 'sql' && (
              <>
                <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-primary/60 p-4">
                  <textarea
                    value={sql}
                    onChange={(e) => setSql(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault()
                        run()
                      }
                    }}
                    spellCheck={false}
                    rows={6}
                    className="w-full resize-y rounded-lg border border-white/10 bg-[#0b0d24] p-3 font-mono text-sm leading-relaxed text-neutral-100 outline-none focus:border-aqua/50"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => run()}
                      disabled={!!busy}
                      className="cursor-pointer rounded-full bg-radial from-lavender to-royal px-5 py-2 text-sm font-medium hover-animation disabled:opacity-50"
                    >
                      ▶ Run <span className="font-mono text-[10px] opacity-70">Ctrl+Enter</span>
                    </button>
                    {sugg.map((s) => (
                      <button
                        key={s.label}
                        onClick={() => {
                          setSql(s.sql)
                          run(s.sql)
                        }}
                        className="cursor-pointer rounded-full border border-white/10 px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:border-aqua/40 hover:text-white"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {result && (
                  <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0b0d24] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-mono text-[11px] text-neutral-400">
                        {result.rowCount.toLocaleString()} row{result.rowCount === 1 ? '' : 's'} · {result.ms} ms
                        {result.truncated && ` · showing first ${result.rows.length.toLocaleString()}`}
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="flex rounded-full border border-white/10 p-0.5">
                          {['table', 'chart'].map((v) => (
                            <button
                              key={v}
                              onClick={() => setView(v)}
                              disabled={v === 'chart' && !chart}
                              className={`cursor-pointer rounded-full px-3 py-1 text-xs capitalize disabled:cursor-not-allowed disabled:opacity-40 ${
                                view === v ? 'bg-lavender/30 text-white' : 'text-neutral-400'
                              }`}
                            >
                              {v}
                            </button>
                          ))}
                        </div>
                        <button onClick={download} className="cursor-pointer rounded-full border border-white/15 px-3 py-1 font-mono text-xs text-neutral-300 hover:border-aqua/50 hover:text-white">
                          ↓ CSV
                        </button>
                      </div>
                    </div>

                    {view === 'chart' && chart ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {['bar', 'line', 'scatter'].map((t) => (
                            <button
                              key={t}
                              onClick={() => setChart({ ...chart, type: t })}
                              className={`cursor-pointer rounded-full border px-3 py-1 capitalize ${chart.type === t ? 'border-lavender bg-lavender/20' : 'border-white/10 text-neutral-400'}`}
                            >
                              {t}
                            </button>
                          ))}
                          <span className="ml-2 text-neutral-500">x</span>
                          <select value={chart.x} onChange={(e) => setChart({ ...chart, x: +e.target.value })} className="rounded-lg border border-white/10 bg-primary px-2 py-1">
                            {result.columns.map((c, i) => (
                              <option key={c.name} value={i}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          <span className="text-neutral-500">y</span>
                          <select value={chart.y} onChange={(e) => setChart({ ...chart, y: +e.target.value })} className="rounded-lg border border-white/10 bg-primary px-2 py-1">
                            {result.columns.map((c, i) =>
                              c.kind === 'number' ? (
                                <option key={c.name} value={i}>
                                  {c.name}
                                </option>
                              ) : null
                            )}
                          </select>
                        </div>
                        <Chart
                          type={chart.type}
                          points={points}
                          xLabel={result.columns[chart.x].name}
                          yLabel={result.columns[chart.y].name}
                          xIsTime={['date', 'timestamp'].includes(result.columns[chart.x].kind)}
                        />
                      </>
                    ) : (
                      <div className="max-h-[480px] overflow-auto rounded-lg border border-white/5">
                        <table className="w-full border-collapse text-left text-xs">
                          <thead className="sticky top-0 bg-storm">
                            <tr>
                              {result.columns.map((c) => (
                                <th key={c.name} className="px-3 py-2 font-mono font-normal whitespace-nowrap text-neutral-300">
                                  {c.name}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {result.rows.map((r, i) => (
                              <tr key={i} className="border-t border-white/5 hover:bg-white/[0.03]">
                                {r.map((v, j) => (
                                  <td
                                    key={j}
                                    className={`max-w-xs truncate px-3 py-1.5 whitespace-nowrap ${result.columns[j].kind === 'number' ? 'text-right tabular-nums' : ''}`}
                                  >
                                    {fmtCell(v)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        !busy && (
          <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-sm text-neutral-500">
            Load a file, a Hugging Face dataset or a sample to start exploring. Everything runs in DuckDB inside your
            browser.
          </div>
        )
      )}
    </div>
  )
}

export default DataLab
