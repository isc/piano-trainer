const DB_NAME = 'piano-trainer'
const DB_VERSION = 2
const STORE_NAME = 'fingerings'

let db = null

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
  return {
    async init() {
      if (!db) {
        db = await openDatabase()
      }
    },

    async getFingerings(scoreUrl) {
      if (!db) await this.init()

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly')
        const store = transaction.objectStore(STORE_NAME)
        const request = store.get(scoreUrl)

        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          resolve(request.result || { scoreUrl, fingerings: {} })
        }
      })
    },

    async setFingering(scoreUrl, noteKey, finger) {
      if (!db) await this.init()

      const existing = await this.getFingerings(scoreUrl)
      existing.fingerings[noteKey] = finger
      existing.updatedAt = Date.now()

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite')
        const store = transaction.objectStore(STORE_NAME)
        const request = store.put(existing)

        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve()
      })
    },

    async removeFingering(scoreUrl, noteKey) {
      if (!db) await this.init()

      const existing = await this.getFingerings(scoreUrl)
      delete existing.fingerings[noteKey]
      existing.updatedAt = Date.now()

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite')
        const store = transaction.objectStore(STORE_NAME)
        const request = store.put(existing)

        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve()
      })
    },
  }
}
