import { initPracticeTracker } from './practiceTracker.js'

export function libraryApp() {
  const practiceTracker = initPracticeTracker()

  return {
    scores: [],
    searchQuery: '',
    baseUrl: '',
    dailyLog: [],

    async init() {
      const [scoresResponse] = await Promise.all([fetch('/data/scores.json'), practiceTracker.init()])
      const data = await scoresResponse.json()
      this.scores = data.scores
      this.baseUrl = data.baseUrl

      this.dailyLog = await practiceTracker.getDailyLog(new Date())
    },

    get filteredScores() {
      if (!this.searchQuery) return this.scores
      const q = this.searchQuery.toLowerCase()
      return this.scores.filter((s) => s.title.toLowerCase().includes(q) || s.composer.toLowerCase().includes(q))
    },

    get totalPracticeTime() {
      return this.dailyLog.reduce((sum, entry) => sum + entry.totalPracticeTimeMs, 0)
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
  }
}
