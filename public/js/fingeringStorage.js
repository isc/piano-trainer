const DB_NAME = 'piano-trainer'
const DB_VERSION = 2
const STORE_NAME = 'fingerings'

let db = null

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

async function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const database = event.target.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'scoreUrl' })
      }
    }
  })
}

export function initFingeringStorage() {
  async function ensureDb() {
    if (!db) {
      db = await openDatabase()
    }
    return db
  }

  return {
    init: ensureDb,

    async getFingerings(scoreUrl) {
      await ensureDb()
      const store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME)
      const result = await promisifyRequest(store.get(scoreUrl))
      return result || { scoreUrl, fingerings: {} }
    },

    async setFingering(scoreUrl, noteKey, finger) {
      const data = await this.getFingerings(scoreUrl)
      data.fingerings[noteKey] = finger
      data.updatedAt = Date.now()

      const store = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME)
      await promisifyRequest(store.put(data))
    },

    async removeFingering(scoreUrl, noteKey) {
      const data = await this.getFingerings(scoreUrl)
      delete data.fingerings[noteKey]
      data.updatedAt = Date.now()

      const store = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME)
      await promisifyRequest(store.put(data))
    },
  }
}
