// Tiny promise wrapper over IndexedDB for the lab's local history (generated
// images, transcripts). Everything stays in the visitor's browser.

const DB_NAME = 'feliks-lab'
const DB_VERSION = 1
const STORES = ['images', 'transcripts']

let dbPromise = null

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        for (const name of STORES) {
          if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath: 'id' })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    dbPromise.catch(() => (dbPromise = null))
  }
  return dbPromise
}

async function run(store, mode, fn) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const req = fn(tx.objectStore(store))
    tx.oncomplete = () => resolve(req?.result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export const idbAll = (store) => run(store, 'readonly', (s) => s.getAll())
export const idbPut = (store, value) => run(store, 'readwrite', (s) => s.put(value))
export const idbDelete = (store, id) => run(store, 'readwrite', (s) => s.delete(id))
export const idbClear = (store) => run(store, 'readwrite', (s) => s.clear())
