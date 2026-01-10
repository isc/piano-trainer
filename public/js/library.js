import { initPracticeTracker } from './practiceTracker.js'

export function libraryApp() {
  const practiceTracker = initPracticeTracker()

  return {
    scores: [],
    searchQuery: '',
    baseUrl: '',
    dailyLogsByDate: [],

    async init() {
      const [scoresResponse] = await Promise.all([fetch('/data/scores.json'), practiceTracker.init()])
      const data = await scoresResponse.json()
      this.scores = data.scores
      this.baseUrl = data.baseUrl

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
      if (!this.searchQuery) return this.scores
      const words = this.searchQuery.toLowerCase().trim().split(/\s+/).filter((w) => w)
      return this.scores.filter((score) => {
        const searchableText = `${score.title} ${score.composer}`.toLowerCase()
        return words.every((word) => searchableText.includes(word))
      })
    },

    getScoreUrl(score) {
      return this.baseUrl + score.file
    },

    formatDuration(ms) {
      const totalSeconds = Math.floor(ms / 1000)
      const minutes = Math.floor(totalSeconds / 60)
      const seconds = totalSeconds % 60
      if (minutes === 0) return `${seconds}s`
      return `${minutes}m ${seconds}s`
    },

    formatDate(date) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const compareDate = new Date(date)
      compareDate.setHours(0, 0, 0, 0)

      const diffTime = today - compareDate
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

      if (diffDays === 0) return "Aujourd'hui"
      if (diffDays === 1) return 'Hier'

      const options = { weekday: 'long', day: 'numeric', month: 'long' }
      return compareDate.toLocaleDateString('fr-FR', options)
    },

    getTotalPracticeTimeForDate(dateEntry) {
      return dateEntry.log.reduce((sum, entry) => sum + entry.totalPracticeTimeMs, 0)
    },
  }
}
