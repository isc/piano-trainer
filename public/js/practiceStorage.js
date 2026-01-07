const DB_NAME = 'piano-trainer-practice'
const DB_VERSION = 1
const SESSIONS_STORE = 'sessions'
const AGGREGATES_STORE = 'aggregates'

let db = null

export function initPracticeStorage() {
  return {
    init,
    saveSession,
    getSession,
    getSessions,
    saveAggregate,
    getAggregate,
    getAllAggregates,
    clearAll,
  }
}

async function init() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'))
    }

    request.onsuccess = (event) => {
      db = event.target.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = event.target.result

      if (!database.objectStoreNames.contains(SESSIONS_STORE)) {
        const sessionsStore = database.createObjectStore(SESSIONS_STORE, { keyPath: 'id' })
        sessionsStore.createIndex('scoreId', 'scoreId', { unique: false })
        sessionsStore.createIndex('startedAt', 'startedAt', { unique: false })
      }

      if (!database.objectStoreNames.contains(AGGREGATES_STORE)) {
        database.createObjectStore(AGGREGATES_STORE, { keyPath: 'scoreId' })
      }
    }
  })
}

async function saveSession(session) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SESSIONS_STORE], 'readwrite')
    const store = transaction.objectStore(SESSIONS_STORE)
    const request = store.put(session)

    request.onsuccess = () => resolve(session)
    request.onerror = () => reject(new Error('Failed to save session'))
  })
}

async function getSession(id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SESSIONS_STORE], 'readonly')
    const store = transaction.objectStore(SESSIONS_STORE)
    const request = store.get(id)

    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(new Error('Failed to get session'))
  })
}

async function getSessions(scoreId = null, dateRange = null) {
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
}

async function saveAggregate(aggregate) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([AGGREGATES_STORE], 'readwrite')
    const store = transaction.objectStore(AGGREGATES_STORE)
    const request = store.put(aggregate)

    request.onsuccess = () => resolve(aggregate)
    request.onerror = () => reject(new Error('Failed to save aggregate'))
  })
}

async function getAggregate(scoreId) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([AGGREGATES_STORE], 'readonly')
    const store = transaction.objectStore(AGGREGATES_STORE)
    const request = store.get(scoreId)

    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(new Error('Failed to get aggregate'))
  })
}

async function getAllAggregates() {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([AGGREGATES_STORE], 'readonly')
    const store = transaction.objectStore(AGGREGATES_STORE)
    const request = store.getAll()

    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(new Error('Failed to get aggregates'))
  })
}

async function clearAll() {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SESSIONS_STORE, AGGREGATES_STORE], 'readwrite')

    transaction.objectStore(SESSIONS_STORE).clear()
    transaction.objectStore(AGGREGATES_STORE).clear()

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(new Error('Failed to clear storage'))
  })
}
