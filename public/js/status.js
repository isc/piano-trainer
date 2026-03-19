import { initPracticeTracker } from './practiceTracker.js'
import { initStorage } from './storage.js'
import { formatDuration } from './utils.js'

const STATUS_LABELS = {
  dechiffrage: 'Déchiffrage',
  perfectionnement: 'Perfectionnement',
  repertoire: 'Répertoire',
}

export function statusApp() {
  const storage = initStorage()
  const practiceTracker = initPracticeTracker(storage)

  return {
    status: '',
    displayLabel: '',
    scores: [],
    baseUrl: '',
    aggregatesByScore: {},

    async init() {
      const params = new URLSearchParams(window.location.search)
      this.status = params.get('status') || ''
      this.displayLabel = STATUS_LABELS[this.status] || this.status

      const [scoresResponse, , aggregates] = await Promise.all([
        fetch('data/scores.json'),
        practiceTracker.init(),
        storage.getAllAggregates(),
      ])
      const data = await scoresResponse.json()
      this.baseUrl = data.baseUrl

      for (const agg of aggregates) {
        this.aggregatesByScore[agg.scoreId] = agg
      }

      this.scores = data.scores
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
