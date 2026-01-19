import { initPracticeTracker } from './practiceTracker.js'
import { initPracticeStorage } from './practiceStorage.js'
import { formatDuration, formatDate } from './utils.js'

export function libraryApp() {
  const storage = initPracticeStorage()
  const practiceTracker = initPracticeTracker(storage)

  return {
    scores: [],
    searchQuery: '',
    baseUrl: '',
    dailyLogsByDate: [],
    lastPlayedByScore: {},

    async init() {
      const [scoresResponse] = await Promise.all([
        fetch('data/scores.json'),
        practiceTracker.init(),
      ])
      const data = await scoresResponse.json()
      this.scores = data.scores
      this.baseUrl = data.baseUrl

      // Build map of scoreId -> most recent play time
      const sessions = await storage.getSessions()
      for (const session of sessions) {
        const existing = this.lastPlayedByScore[session.scoreId]
        if (!existing || session.startedAt > existing) {
          this.lastPlayedByScore[session.scoreId] = session.startedAt
        }
      }

      // Fetch daily logs for the last 8 days (today + 7 previous days)
      const logPromises = []
      for (let i = 0; i < 8; i++) {
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
            `${result.importedAggregates} agrégat(s) importé(s)`
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
      const logPromises = []
      for (let i = 0; i < 8; i++) {
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
