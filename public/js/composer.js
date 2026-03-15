import { initPracticeTracker } from './practiceTracker.js'
import { initStorage } from './storage.js'
import { formatDuration } from './utils.js'

export function composerApp() {
  const storage = initStorage()
  const practiceTracker = initPracticeTracker(storage)

  return {
    composer: '',
    scores: [],
    baseUrl: '',
    aggregatesByScore: {},

    async init() {
      const params = new URLSearchParams(window.location.search)
      this.composer = params.get('composer') || ''

      const [scoresResponse] = await Promise.all([
        fetch('data/scores.json'),
        practiceTracker.init(),
      ])
      const data = await scoresResponse.json()
      this.baseUrl = data.baseUrl
      this.scores = data.scores.filter((s) => s.composer === this.composer)

      const aggregates = await storage.getAllAggregates()
      for (const agg of aggregates) {
        this.aggregatesByScore[agg.scoreId] = agg
      }

      document.title = `Piano Trainer - ${this.composer}`
    },

    getScoreUrl(score) {
      return this.baseUrl + score.file
    },

    getAggregate(score) {
      const agg = this.aggregatesByScore[this.getScoreUrl(score)]
      if (!agg || (agg.practiceDays || []).length === 0) return null
      return agg
    },

    formatDuration,
  }
}
