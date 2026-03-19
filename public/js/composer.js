import { loadScoresWithAggregates, getScoreUrl, getAggregate, formatDuration } from './scoreListBase.js'
import { statusLabel } from './utils.js'

export function composerApp() {
  return {
    composer: '',
    scores: [],
    baseUrl: '',
    aggregatesByScore: {},

    async init() {
      const params = new URLSearchParams(window.location.search)
      this.composer = params.get('composer') || ''

      const { baseUrl, scores, aggregatesByScore } = await loadScoresWithAggregates()
      this.baseUrl = baseUrl
      this.scores = scores.filter((s) => s.composer === this.composer)
      this.aggregatesByScore = aggregatesByScore

      document.title = `Piano Trainer - ${this.composer}`
    },

    getScoreUrl(score) {
      return getScoreUrl(this.baseUrl, score)
    },

    getAggregate(score) {
      return getAggregate(this.aggregatesByScore, this.baseUrl, score)
    },

    statusLabel,
    formatDuration,
  }
}
