import { initMidi } from './midi.js'
import { initPracticeTracker } from './practiceTracker.js'
import { initStorage } from './storage.js'
import { formatDuration, formatDate } from './utils.js'

const MIN_MATCH = 5

export function libraryApp() {
  const midi = initMidi()
  const storage = initStorage()
  const practiceTracker = initPracticeTracker(storage)

  let matchPointers = {}
  let searchResetTimer = null

  return {
    scores: [],
    fingerprints: [],
    searchQuery: '',
    baseUrl: '',
    dailyLogsByDate: [],
    lastPlayedByScore: {},

    async init() {
      midi.setCallbacks({
        onNotePlayed: (_name, midiNote) => this.handleSearchNote(midiNote),
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
      this.fingerprints = fpData.fingerprints

      // Build map of scoreId -> most recent play time
      const sessions = await storage.getSessions()
      for (const session of sessions) {
        const existing = this.lastPlayedByScore[session.scoreId]
        if (!existing || session.startedAt > existing) {
          this.lastPlayedByScore[session.scoreId] = session.startedAt
        }
      }

      // Set scores only after lastPlayedByScore is ready, so the table renders sorted
      this.scores = data.scores

      await this.reloadDailyLogs()
    },

    handleSearchNote(midiNote) {
      if (midiNote === 21) return // A0 reserved for home navigation
      if (this.fingerprints.length === 0) return

      clearTimeout(searchResetTimer)

      for (const fp of this.fingerprints) {
        const pos = matchPointers[fp.file] ?? 0
        if (pos < fp.notes.length && fp.notes[pos] === midiNote) {
          matchPointers[fp.file] = pos + 1
        }
      }

      const maxPos = Math.max(...this.fingerprints.map(fp => matchPointers[fp.file] ?? 0))
      if (maxPos >= MIN_MATCH) {
        const leaders = this.fingerprints.filter(fp => (matchPointers[fp.file] ?? 0) === maxPos)
        if (leaders.length === 1) {
          window.location.href = `score.html?url=${encodeURIComponent(this.baseUrl + leaders[0].file)}`
          return
        }
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
      // Sort by most recently played first
      return results.toSorted((a, b) => {
        const aPlayed = this.lastPlayedByScore[this.getScoreUrl(a)] || ''
        const bPlayed = this.lastPlayedByScore[this.getScoreUrl(b)] || ''
        return bPlayed.localeCompare(aPlayed)
      })
    },

    getScoreUrl(score) {
      return this.baseUrl + score.file
    },

    formatDuration,
    formatDate,

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

          // Reload daily logs after import
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
      const DAYS_TO_SHOW = 8 // Today + 7 previous days
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
