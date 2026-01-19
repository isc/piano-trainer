const DB_NAME = 'piano-trainer'
const DB_VERSION = 3
const FINGERINGS_STORE = 'fingerings'
const SESSIONS_STORE = 'sessions'
const AGGREGATES_STORE = 'aggregates'

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

function promisifyTransaction(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve
    transaction.onerror = () => reject(transaction.error)
  })
}

function putAllToStore(transaction, storeName, items) {
  if (!items || !Array.isArray(items)) return 0
  const store = transaction.objectStore(storeName)
  for (const item of items) {
    store.put(item)
  }
  return items.length
}

async function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const database = event.target.result

      // Create fingerings store if needed
      if (!database.objectStoreNames.contains(FINGERINGS_STORE)) {
        database.createObjectStore(FINGERINGS_STORE, { keyPath: 'scoreUrl' })
      }

      // Create sessions store if needed
      if (!database.objectStoreNames.contains(SESSIONS_STORE)) {
        const sessionsStore = database.createObjectStore(SESSIONS_STORE, { keyPath: 'id' })
        sessionsStore.createIndex('scoreId', 'scoreId', { unique: false })
        sessionsStore.createIndex('startedAt', 'startedAt', { unique: false })
      }

      // Create aggregates store if needed
      if (!database.objectStoreNames.contains(AGGREGATES_STORE)) {
        database.createObjectStore(AGGREGATES_STORE, { keyPath: 'scoreId' })
      }
    }
  })
}

export function initStorage() {
  let db = null

  async function ensureDb() {
    if (!db) {
      db = await openDatabase()
    }
    return db
  }

  return {
    init: ensureDb,

    // Fingerings methods
    async getFingerings(scoreUrl) {
      await ensureDb()
      const store = db.transaction(FINGERINGS_STORE, 'readonly').objectStore(FINGERINGS_STORE)
      const result = await promisifyRequest(store.get(scoreUrl))
      return result || { scoreUrl, fingerings: {} }
    },

    async setFingering(scoreUrl, noteKey, finger) {
      await this._updateFingerings(scoreUrl, (fingerings) => {
        fingerings[noteKey] = finger
      })
    },

    async removeFingering(scoreUrl, noteKey) {
      await this._updateFingerings(scoreUrl, (fingerings) => {
        delete fingerings[noteKey]
      })
    },

    async _updateFingerings(scoreUrl, updateFn) {
      const data = await this.getFingerings(scoreUrl)
      updateFn(data.fingerings)
      data.updatedAt = Date.now()
      const store = db.transaction(FINGERINGS_STORE, 'readwrite').objectStore(FINGERINGS_STORE)
      await promisifyRequest(store.put(data))
    },

    async getAllFingerings() {
      await ensureDb()
      const store = db.transaction(FINGERINGS_STORE, 'readonly').objectStore(FINGERINGS_STORE)
      return promisifyRequest(store.getAll())
    },

    // Sessions methods
    async saveSession(session) {
      await ensureDb()
      const store = db.transaction(SESSIONS_STORE, 'readwrite').objectStore(SESSIONS_STORE)
      await promisifyRequest(store.put(session))
      return session
    },

    async getSession(id) {
      await ensureDb()
      const store = db.transaction(SESSIONS_STORE, 'readonly').objectStore(SESSIONS_STORE)
      return (await promisifyRequest(store.get(id))) || null
    },

    async getSessions(scoreId = null, dateRange = null) {
      await ensureDb()
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([SESSIONS_STORE], 'readonly')
        const store = transaction.objectStore(SESSIONS_STORE)
        const sessions = []

        let request
        if (scoreId) {
          const index = store.index('scoreId')
          request = index.openCursor(IDBKeyRange.only(scoreId))
        } else {
          request = store.openCursor()
        }

        request.onsuccess = (event) => {
          const cursor = event.target.result
          if (cursor) {
            const session = cursor.value
            if (dateRange) {
              const sessionDate = new Date(session.startedAt)
              if (sessionDate >= dateRange.start && sessionDate <= dateRange.end) {
                sessions.push(session)
              }
            } else {
              sessions.push(session)
            }
            cursor.continue()
          } else {
            resolve(sessions)
          }
        }

        request.onerror = () => reject(new Error('Failed to get sessions'))
      })
    },

    // Aggregates methods
    async saveAggregate(aggregate) {
      await ensureDb()
      const store = db.transaction(AGGREGATES_STORE, 'readwrite').objectStore(AGGREGATES_STORE)
      await promisifyRequest(store.put(aggregate))
      return aggregate
    },

    async getAggregate(scoreId) {
      await ensureDb()
      const store = db.transaction(AGGREGATES_STORE, 'readonly').objectStore(AGGREGATES_STORE)
      return (await promisifyRequest(store.get(scoreId))) || null
    },

    async getAllAggregates() {
      await ensureDb()
      const store = db.transaction(AGGREGATES_STORE, 'readonly').objectStore(AGGREGATES_STORE)
      return (await promisifyRequest(store.getAll())) || []
    },

    // Backup methods
    async exportBackup() {
      const sessions = await this.getSessions()
      const aggregates = await this.getAllAggregates()
      const fingerings = await this.getAllFingerings()

      return {
        exportDate: new Date().toISOString(),
        sessions,
        aggregates,
        fingerings,
      }
    },

    async importBackup(backupData) {
      if (!backupData || !backupData.sessions) {
        throw new Error('Invalid backup data format')
      }

      await ensureDb()

      const stores = [SESSIONS_STORE, AGGREGATES_STORE, FINGERINGS_STORE]
      const transaction = db.transaction(stores, 'readwrite')

      const importCounts = {
        sessions: putAllToStore(transaction, SESSIONS_STORE, backupData.sessions),
        aggregates: putAllToStore(transaction, AGGREGATES_STORE, backupData.aggregates),
        fingerings: putAllToStore(transaction, FINGERINGS_STORE, backupData.fingerings),
      }

      await promisifyTransaction(transaction)

      return {
        success: true,
        importedSessions: importCounts.sessions,
        importedAggregates: importCounts.aggregates,
        importedFingerings: importCounts.fingerings,
      }
    },

    async clearAll() {
      await ensureDb()
      const stores = [SESSIONS_STORE, AGGREGATES_STORE, FINGERINGS_STORE]
      const transaction = db.transaction(stores, 'readwrite')
      for (const storeName of stores) {
        transaction.objectStore(storeName).clear()
      }
      await promisifyTransaction(transaction)
    },
  }
}
