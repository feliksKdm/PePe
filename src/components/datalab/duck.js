import * as duckdb from '@duckdb/duckdb-wasm'

// DuckDB-WASM, loaded lazily from jsDelivr the first time the Data Lab needs it.
// Everything runs in the visitor's browser; files are read straight from disk.

const MAX_ROWS = 1000 // rows materialized for display; the full result stays in DuckDB

let dbPromise = null

export function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles())
      // Cross-origin workers can't be constructed directly; bootstrap via a blob.
      const workerUrl = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
      )
      const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), new Worker(workerUrl))
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
      URL.revokeObjectURL(workerUrl)
      await db.open({ query: { castBigIntToDouble: true, castDecimalToDouble: true } })
      const conn = await db.connect()
      return { db, conn }
    })()
    dbPromise.catch(() => (dbPromise = null))
  }
  return dbPromise
}

/** Quote an identifier for SQL. */
export const ident = (name) => `"${String(name).replace(/"/g, '""')}"`

/** A safe, readable table name from a file name ("Sales 2024.csv" → sales_2024). */
export function tableName(fileName, taken = []) {
  let base = fileName
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!base || /^\d/.test(base)) base = `t_${base}`
  let name = base
  for (let i = 2; taken.includes(name); i++) name = `${base}_${i}`
  return name
}

function readerFor(file) {
  if (/\.parquet$/i.test(file)) return `read_parquet('${file}')`
  if (/\.(json|jsonl|ndjson)$/i.test(file)) return `read_json_auto('${file}')`
  return `read_csv_auto('${file}', sample_size = 20000)`
}

/** Load a File (from an <input>/drop) into a table. */
export async function loadFile(file, table) {
  const { db, conn } = await getDb()
  const virtual = `upload_${Date.now()}_${file.name.replace(/[^\w.]+/g, '_')}`
  await db.registerFileHandle(virtual, file, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, true)
  await conn.query(`CREATE OR REPLACE TABLE ${ident(table)} AS SELECT * FROM ${readerFor(virtual)}`)
}

/** Load remote bytes (already fetched) into a table. */
export async function loadBuffer(bytes, fileName, table) {
  const { db, conn } = await getDb()
  const virtual = `remote_${Date.now()}_${fileName.replace(/[^\w.]+/g, '_')}`
  await db.registerFileBuffer(virtual, bytes)
  await conn.query(`CREATE OR REPLACE TABLE ${ident(table)} AS SELECT * FROM ${readerFor(virtual)}`)
}

function normalize(value, kind) {
  if (value === null || value === undefined) return null
  if (typeof value === 'bigint') return Number(value)
  if (kind === 'date' && typeof value === 'number') return new Date(value).toISOString().slice(0, 10)
  if (kind === 'timestamp' && typeof value === 'number') return new Date(value).toISOString().replace('T', ' ').slice(0, 19).replace(/ 00:00:00$/, '')
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') return JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? Number(v) : v))
  return value
}

function kindOf(type) {
  const t = String(type)
  if (/^(Int|Uint|Float|Decimal)/i.test(t)) return 'number'
  if (/^Date/i.test(t)) return 'date'
  if (/^Timestamp/i.test(t)) return 'timestamp'
  if (/^Bool/i.test(t)) return 'boolean'
  return 'text'
}

/**
 * Run SQL. Returns { columns: [{ name, kind }], rows: any[][], rowCount, truncated, ms }.
 * Only the first MAX_ROWS rows are converted for display.
 */
export async function runQuery(sql) {
  const { conn } = await getDb()
  const t0 = performance.now()
  const result = await conn.query(sql)
  const ms = Math.round(performance.now() - t0)
  const columns = result.schema.fields.map((f) => ({ name: f.name, kind: kindOf(f.type) }))
  const rowCount = result.numRows
  const limit = Math.min(rowCount, MAX_ROWS)
  const vectors = columns.map((_, i) => result.getChildAt(i))
  const rows = []
  for (let r = 0; r < limit; r++) rows.push(columns.map((c, i) => normalize(vectors[i]?.get(r), c.kind)))
  return { columns, rows, rowCount, truncated: rowCount > limit, ms }
}

/** All user tables with their row counts. */
export async function listTables() {
  const { rows } = await runQuery(
    "SELECT table_name, estimated_size FROM duckdb_tables() WHERE schema_name = 'main' ORDER BY table_name"
  )
  return rows.map(([name, size]) => ({ name, rows: size }))
}

/** Column profile: SUMMARIZE plus a small distribution per column. */
export async function profile(table) {
  const t = ident(table)
  const summary = await runQuery(`SUMMARIZE ${t}`)
  const idx = Object.fromEntries(summary.columns.map((c, i) => [c.name, i]))
  const [{ rows: countRows }] = [await runQuery(`SELECT count(*) FROM ${t}`)]
  const total = countRows[0][0]
  const cols = []
  for (const r of summary.rows) {
    const name = r[idx.column_name]
    const type = r[idx.column_type]
    const numeric = /INT|DOUBLE|FLOAT|DECIMAL|REAL|NUMERIC/i.test(type)
    const col = {
      name,
      type,
      numeric,
      nullPct: Number(r[idx.null_percentage]) || 0,
      unique: r[idx.approx_unique],
      min: r[idx.min],
      max: r[idx.max],
      avg: numeric ? Number(r[idx.avg]) : null,
    }
    try {
      if (numeric && col.min !== null && Number(col.max) > Number(col.min)) {
        const c = ident(name)
        const lo = Number(col.min)
        const width = (Number(col.max) - lo) / 20
        const { rows } = await runQuery(
          `SELECT least(floor((${c} - ${lo}) / ${width}), 19)::INT AS b, count(*) FROM ${t} WHERE ${c} IS NOT NULL GROUP BY 1 ORDER BY 1`
        )
        const bins = Array(20).fill(0)
        for (const [b, n] of rows) bins[b] = n
        col.bins = bins
      } else if (/DATE|TIMESTAMP/i.test(type) && col.min !== null && col.max !== col.min) {
        // Dates: 20 equal time buckets between min and max.
        const c = ident(name)
        const { rows } = await runQuery(
          `WITH r AS (SELECT epoch(min(${c})) lo, epoch(max(${c})) hi FROM ${t})
           SELECT least(floor((epoch(${c}) - r.lo) / ((r.hi - r.lo) / 20)), 19)::INT AS b, count(*)
           FROM ${t}, r WHERE ${c} IS NOT NULL GROUP BY 1 ORDER BY 1`
        )
        const bins = Array(20).fill(0)
        for (const [b, n] of rows) bins[b] = n
        col.bins = bins
      } else if (!numeric) {
        const c = ident(name)
        const { rows } = await runQuery(
          `SELECT ${c}::VARCHAR AS v, count(*) AS n FROM ${t} WHERE ${c} IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 4`
        )
        col.top = rows.map(([v, n]) => ({ value: v, share: total ? n / total : 0 }))
      }
    } catch {
      /* distribution is a nice-to-have */
    }
    cols.push(col)
  }
  return { total, columns: cols }
}

/** Export a query's full result as CSV bytes. */
export async function exportCsv(sql) {
  const { db, conn } = await getDb()
  const out = `export_${Date.now()}.csv`
  await conn.query(`COPY (${sql.replace(/;\s*$/, '')}) TO '${out}' (HEADER, DELIMITER ',')`)
  const bytes = await db.copyFileToBuffer(out)
  await db.dropFile(out).catch(() => {})
  return bytes
}

/** Compact schema + a few sample rows for every table — what the SQL copilot sees. */
export async function schemaForAI() {
  const tables = await listTables()
  const parts = []
  for (const { name, rows } of tables) {
    const desc = await runQuery(`DESCRIBE ${ident(name)}`)
    const cols = desc.rows.map((r) => `${r[0]} ${r[1]}`).join(', ')
    const sample = await runQuery(`SELECT * FROM ${ident(name)} LIMIT 3`)
    const lines = sample.rows.map((r) => r.map((v) => (v === null ? 'NULL' : String(v).slice(0, 40))).join(' | '))
    parts.push(`TABLE ${name} (${rows} rows): ${cols}\nSample rows:\n${lines.join('\n')}`)
  }
  return parts.join('\n\n')
}
