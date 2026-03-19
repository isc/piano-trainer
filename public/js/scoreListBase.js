import { initStorage } from './storage.js'
import { formatDuration } from './utils.js'

export async function loadScoresWithAggregates() {
  const storage = initStorage()
  const [scoresResponse, aggregates] = await Promise.all([
    fetch('data/scores.json'),
    storage.getAllAggregates(),
  ])
  const data = await scoresResponse.json()

  const aggregatesByScore = {}
  for (const agg of aggregates) {
    aggregatesByScore[agg.scoreId] = agg
  }

  return { baseUrl: data.baseUrl, scores: data.scores, aggregatesByScore }
}

export function getScoreUrl(baseUrl, score) {
  return baseUrl + score.file
}

export function getAggregate(aggregatesByScore, baseUrl, score) {
  const agg = aggregatesByScore[getScoreUrl(baseUrl, score)]
  if (!agg || (agg.practiceDays || []).length === 0) return null
  return agg
}

export { formatDuration }
