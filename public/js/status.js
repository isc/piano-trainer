import { loadScoresWithAggregates, getScoreUrl, getAggregate, formatDuration } from './scoreListBase.js'
import { statusLabel } from './utils.js'

export function statusApp() {
  return {
    status: '',
    displayLabel: '',
    scores: [],
    baseUrl: '',
    aggregatesByScore: {},

    async init() {
      const params = new URLSearchParams(window.location.search)
      this.status = params.get('status') || ''
      this.displayLabel = statusLabel(this.status)

      const { baseUrl, scores, aggregatesByScore } = await loadScoresWithAggregates()
      this.baseUrl = baseUrl
      this.aggregatesByScore = aggregatesByScore

      this.scores = scores
        .filter((score) => {
          const agg = this.getAggregate(score)
          return agg && agg.status === this.status
        })
        .sort((a, b) => {
          const aLastPlayed = this.getAggregate(a).lastPlayedAt || ''
          const bLastPlayed = this.getAggregate(b).lastPlayedAt || ''
          return bLastPlayed.localeCompare(aLastPlayed)
        })

      document.title = `Piano Trainer - ${this.displayLabel}`
    },

    getScoreUrl(score) {
      return getScoreUrl(this.baseUrl, score)
    },

    getAggregate(score) {
      return getAggregate(this.aggregatesByScore, this.baseUrl, score)
    },

    formatDuration,
  }
}
