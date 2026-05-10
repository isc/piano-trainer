import { initMidi } from './midi.js'
import { initPracticeTracker } from './practiceTracker.js'
import { initStorage } from './storage.js'
import { formatDuration, formatDate, statusLabel } from './utils.js'

const MIN_MATCH = 5
const STATUS_ORDER = ['dechiffrage', 'perfectionnement', 'repertoire']
const STALE_DAYS = 7

export function libraryApp() {
  const midi = initMidi()
  const storage = initStorage()
  const practiceTracker = initPracticeTracker(storage)

  let fingerprints = []
  let matchPointers = {}
  let searchResetTimer = null
  let sessionCountByFile = {}

  return {
    scores: [],
    searchQuery: '',
    statusFilter: '',
    composerFilter: '',
    baseUrl: '',
    dailyLogsByDate: [],
    lastPlayedByScore: {},
    aggregatesByScore: {},

    async init() {
      midi.setCallbacks({
        onNotePlayed: (_, midiNote) => this.handleSearchNote(midiNote),
      })
      midi.connectMIDI({ silent: true, autoSelectFirst: true })

      const [scoresResponse, fingerprintsResponse] = await Promise.all([
        fetch('data/scores.json'),
        fetch('data/fingerprints.json'),
        practiceTracker.init(),
      ])
      const data = await scoresResponse.json()
      this.baseUrl = data.baseUrl

      const fpData = await fingerprintsResponse.json()
      fingerprints = fpData.fingerprints

      // Build maps from sessions: most recent play time + count per score file
      const sessions = await storage.getSessions()
      for (const session of sessions) {
        const existing = this.lastPlayedByScore[session.scoreId]
        if (!existing || session.startedAt > existing) {
          this.lastPlayedByScore[session.scoreId] = session.startedAt
        }
        if (session.scoreId.startsWith(this.baseUrl)) {
          const file = session.scoreId.slice(this.baseUrl.length)
          sessionCountByFile[file] = (sessionCountByFile[file] ?? 0) + 1
        }
      }

      // Aggregates power the status filter, status pills, and practice-focus banner.
      const aggregates = await storage.getAllAggregates()
      for (const agg of aggregates) {
        if (!agg || (agg.practiceDays || []).length === 0) continue
        this.aggregatesByScore[agg.scoreId] = agg
      }

      this.scores = data.scores

      await this.reloadDailyLogs()
    },

    handleSearchNote(midiNote) {
      if (fingerprints.length === 0) return

      clearTimeout(searchResetTimer)

      let maxPos = 0
      let leader = null
      let leaderSessions = -1

      for (const fp of fingerprints) {
        const pos = matchPointers[fp.file] ?? 0
        const advanced = pos < fp.notes.length && fp.notes[pos] === midiNote
        const currentPos = advanced ? pos + 1 : pos

        if (advanced) matchPointers[fp.file] = currentPos

        if (currentPos > maxPos) {
          maxPos = currentPos
          leader = fp
          leaderSessions = sessionCountByFile[fp.file] ?? 0
        } else if (currentPos === maxPos && currentPos > 0) {
          const count = sessionCountByFile[fp.file] ?? 0
          if (count > leaderSessions) {
            leader = fp
            leaderSessions = count
          } else if (count === leaderSessions) {
            leader = null
          }
        }
      }

      if (maxPos >= MIN_MATCH && leader !== null) {
        window.location.href = `score.html?url=${encodeURIComponent(this.baseUrl + leader.file)}`
        return
      }

      searchResetTimer = setTimeout(() => this.resetNoteSearch(), 3000)
    },

    resetNoteSearch() {
      matchPointers = {}
      clearTimeout(searchResetTimer)
    },

    get filteredScores() {
      let results = this.scores
      if (this.searchQuery) {
        const words = this.searchQuery.toLowerCase().trim().split(/\s+/).filter((w) => w)
        results = results.filter((score) => {
          const searchableText = `${score.title} ${score.composer}`.toLowerCase()
          return words.every((word) => new RegExp(`\\b${word}`).test(searchableText))
        })
      }
      if (this.statusFilter) {
        results = results.filter((score) => this.getStatusFor(score) === this.statusFilter)
      }
      if (this.composerFilter) {
        results = results.filter((score) => score.composer === this.composerFilter)
      }
      return results.toSorted((a, b) => {
        const aPlayed = this.lastPlayedByScore[this.getScoreUrl(a)] || ''
        const bPlayed = this.lastPlayedByScore[this.getScoreUrl(b)] || ''
        return bPlayed.localeCompare(aPlayed)
      })
    },

    get statusOptions() {
      const counts = { dechiffrage: 0, perfectionnement: 0, repertoire: 0 }
      for (const score of this.scores) {
        const status = this.getStatusFor(score)
        if (status && counts[status] !== undefined) counts[status]++
      }
      return STATUS_ORDER.map((value) => ({ value, label: statusLabel(value), count: counts[value] }))
    },

    get composerOptions() {
      const set = new Set(this.scores.map((s) => s.composer).filter(Boolean))
      return [...set].sort((a, b) => a.localeCompare(b, 'fr'))
    },

    // Practice focus: surfaces 3 useful signals at the top of the library
    // so the user immediately knows what to work on next:
    //  - scores with measures still flagged for reinforcement
    //  - scores in 'perfectionnement' close to mastery (≥80% clean)
    //  - scores not practiced in the last STALE_DAYS days
    get practiceFocus() {
      const now = Date.now()
      const stale = STALE_DAYS * 24 * 60 * 60 * 1000
      let toReinforce = 0
      let nearMastery = 0
      let staleCount = 0

      for (const agg of Object.values(this.aggregatesByScore)) {
        const measures = agg.measures || {}
        const measureList = Object.values(measures)

        if (measureList.some((m) => (m.totalAttempts || 0) >= 2 && (m.errorRate || 0) > 0.4)) {
          toReinforce++
        }
        if (agg.status === 'perfectionnement' && measureList.length > 0) {
          const clean = measureList.filter((m) => (m.cleanAttempts || 0) >= 3).length
          if (clean / measureList.length >= 0.8) nearMastery++
        }
        if (agg.lastPlayedAt) {
          const last = new Date(agg.lastPlayedAt).getTime()
          if (now - last > stale) staleCount++
        }
      }

      const parts = []
      if (toReinforce > 0)  parts.push(`<strong>${toReinforce}</strong> morceau${toReinforce > 1 ? 'x' : ''} avec des mesures à renforcer`)
      if (nearMastery > 0)  parts.push(`<strong>${nearMastery}</strong> proche${nearMastery > 1 ? 's' : ''} du répertoire`)
      if (staleCount > 0)   parts.push(`<strong>${staleCount}</strong> non pratiqué${staleCount > 1 ? 's' : ''} depuis ${STALE_DAYS} jours`)

      return { summary: parts.length > 0 ? parts.join(' · ') : null }
    },

    getScoreUrl(score) {
      return this.baseUrl + score.file
    },

    getStatusFor(score) {
      return this.aggregatesByScore[this.getScoreUrl(score)]?.status || null
    },

    getPracticeTimeFor(score) {
      return this.aggregatesByScore[this.getScoreUrl(score)]?.totalPracticeTimeMs || 0
    },

    formatDuration,
    formatDate,
    statusLabel,

    getTotalPracticeTimeForDate(dateEntry) {
      return dateEntry.log.reduce((sum, entry) => sum + entry.totalPracticeTimeMs, 0)
    },

    async importBackup(event) {
      const file = event.target.files[0]
      if (!file) return

      try {
        const text = await file.text()
        const backupData = JSON.parse(text)

        const result = await storage.importBackup(backupData)

        if (result.success) {
          alert(
            `✅ Sauvegarde importée avec succès !\n\n` +
            `${result.importedSessions} session(s) importée(s)\n` +
            `${result.importedAggregates} agrégat(s) importé(s)\n` +
            `${result.importedFingerings} doigté(s) importé(s)`
          )

          await this.reloadDailyLogs()
        }
      } catch (error) {
        console.error('Import error:', error)
        alert(`❌ Erreur lors de l'import : ${error.message}`)
      }

      event.target.value = ''
    },

    async exportBackup() {
      try {
        const backupData = await storage.exportBackup()

        const blob = new Blob([JSON.stringify(backupData, null, 2)], {
          type: 'application/json',
        })

        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `piano-trainer-backup-${new Date().toISOString().split('T')[0]}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        alert('✅ Sauvegarde exportée avec succès !')
      } catch (error) {
        console.error('Export error:', error)
        alert(`❌ Erreur lors de l'export : ${error.message}`)
      }
    },

    async reloadDailyLogs() {
      const DAYS_TO_SHOW = 8
      const logPromises = []
      for (let i = 0; i < DAYS_TO_SHOW; i++) {
        const date = new Date()
        date.setDate(date.getDate() - i)
        logPromises.push(
          practiceTracker.getDailyLog(date).then((log) => ({
            date: new Date(date),
            log,
          }))
        )
      }
      this.dailyLogsByDate = await Promise.all(logPromises)
    },
  }
}
