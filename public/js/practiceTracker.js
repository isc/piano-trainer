import { initPracticeStorage } from './practiceStorage.js'

export function initPracticeTracker(storageInstance = null) {
  const storage = storageInstance || initPracticeStorage()

  let currentSession = null
  let currentMeasureAttempt = null

  return {
    init: () => storage.init(),
    startSession,
    toggleMode,
    startMeasureAttempt,
    recordWrongNote,
    endMeasureAttempt,
    endSession,
    getScoreStats,
    getMeasuresToReinforce,
    getDailyLog,
    getAllScores,
    computeScoreStatus,
    getCurrentSession: () => currentSession,
  }

  function generateId() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }

  function startSession(scoreId, scoreTitle, composer, mode, totalMeasures = null) {
    if (!scoreId) return null

    currentSession = {
      id: generateId(),
      scoreId,
      scoreTitle: scoreTitle || null,
      composer: composer || null,
      totalMeasures: totalMeasures || null,
      mode,
      startedAt: new Date().toISOString(),
      endedAt: null,
      measures: [],
    }
    return currentSession
  }

  async function toggleMode(newMode) {
    if (!currentSession) return null

    const { scoreId, scoreTitle, composer, totalMeasures } = currentSession
    await endSession()
    return startSession(scoreId, scoreTitle, composer, newMode, totalMeasures)
  }

  function startMeasureAttempt(sourceMeasureIndex) {
    if (!currentSession) return null

    currentMeasureAttempt = {
      sourceMeasureIndex,
      startedAt: new Date().toISOString(),
      durationMs: 0,
      wrongNotes: 0,
      clean: true,
    }
    return currentMeasureAttempt
  }

  function recordWrongNote() {
    if (!currentMeasureAttempt) return
    currentMeasureAttempt.wrongNotes++
    currentMeasureAttempt.clean = false
  }

  async function endMeasureAttempt(clean = null) {
    if (!currentSession || !currentMeasureAttempt) return null

    const startTime = new Date(currentMeasureAttempt.startedAt).getTime()
    currentMeasureAttempt.durationMs = Date.now() - startTime

    if (clean !== null) {
      currentMeasureAttempt.clean = clean
    }

    let measureEntry = currentSession.measures.find(
      (m) => m.sourceMeasureIndex === currentMeasureAttempt.sourceMeasureIndex
    )

    if (!measureEntry) {
      measureEntry = {
        sourceMeasureIndex: currentMeasureAttempt.sourceMeasureIndex,
        attempts: [],
      }
      currentSession.measures.push(measureEntry)
    }

    measureEntry.attempts.push({
      startedAt: currentMeasureAttempt.startedAt,
      durationMs: currentMeasureAttempt.durationMs,
      wrongNotes: currentMeasureAttempt.wrongNotes,
      clean: currentMeasureAttempt.clean,
    })

    const completedAttempt = { ...currentMeasureAttempt }
    currentMeasureAttempt = null

    // Save session incrementally (don't await - fire and forget)
    storage.saveSession({ ...currentSession })

    return completedAttempt
  }

  async function endSession() {
    if (!currentSession) return null

    currentSession.endedAt = new Date().toISOString()

    const sessionToSave = { ...currentSession }

    // Don't save sessions with no completed measures
    if (sessionToSave.measures.length > 0) {
      await storage.saveSession(sessionToSave)
      await updateAggregates(sessionToSave)
    }

    currentSession = null
    currentMeasureAttempt = null
    return sessionToSave
  }

  async function updateAggregates(session) {
    let aggregate = await storage.getAggregate(session.scoreId)

    if (!aggregate) {
      aggregate = {
        scoreId: session.scoreId,
        scoreTitle: session.scoreTitle,
        composer: session.composer,
        status: 'dechiffrage',
        firstPlayedAt: session.startedAt,
        lastPlayedAt: session.endedAt,
        totalSessions: 0,
        totalPracticeTimeMs: 0,
        measures: {},
      }
    }

    const sessionEndTime = getSessionEndTime(session)
    aggregate.lastPlayedAt = sessionEndTime.toISOString()
    aggregate.totalSessions++

    const sessionDuration = sessionEndTime - new Date(session.startedAt)
    aggregate.totalPracticeTimeMs += sessionDuration

    for (const measureData of session.measures) {
      const measureIndex = measureData.sourceMeasureIndex
      if (!aggregate.measures[measureIndex]) {
        aggregate.measures[measureIndex] = {
          totalAttempts: 0,
          cleanAttempts: 0,
          totalDurationMs: 0,
          lastPlayedAt: null,
        }
      }

      const measureAgg = aggregate.measures[measureIndex]
      for (const attempt of measureData.attempts) {
        measureAgg.totalAttempts++
        if (attempt.clean) {
          measureAgg.cleanAttempts++
        }
        measureAgg.totalDurationMs += attempt.durationMs
        measureAgg.lastPlayedAt = attempt.startedAt
      }

      measureAgg.avgDurationMs = Math.round(measureAgg.totalDurationMs / measureAgg.totalAttempts)
      measureAgg.errorRate =
        measureAgg.totalAttempts > 0
          ? (measureAgg.totalAttempts - measureAgg.cleanAttempts) / measureAgg.totalAttempts
          : 0
    }

    aggregate.status = computeScoreStatus(aggregate)

    await storage.saveAggregate(aggregate)
    return aggregate
  }

  function computeScoreStatus(aggregate) {
    const measureValues = Object.values(aggregate.measures)
    if (measureValues.length === 0) return 'dechiffrage'

    const measuresWithCleanAttempts = measureValues.filter((m) => m.cleanAttempts >= 1).length
    const measuresWithEnoughClean = measureValues.filter((m) => m.cleanAttempts >= 3).length
    const measuresWithMasteryClean = measureValues.filter((m) => m.cleanAttempts >= 5).length

    const totalMeasures = measureValues.length
    const cleanRatio = measuresWithCleanAttempts / totalMeasures
    const enoughCleanRatio = measuresWithEnoughClean / totalMeasures
    const masteryCleanRatio = measuresWithMasteryClean / totalMeasures

    const uniqueDays = new Set()
    if (aggregate.firstPlayedAt) {
      uniqueDays.add(aggregate.firstPlayedAt.substring(0, 10))
    }
    if (aggregate.lastPlayedAt) {
      uniqueDays.add(aggregate.lastPlayedAt.substring(0, 10))
    }

    if (masteryCleanRatio === 1 && uniqueDays.size >= 3) {
      return 'repertoire'
    }

    if (enoughCleanRatio >= 0.5) {
      return 'perfectionnement'
    }

    return 'dechiffrage'
  }

  async function getScoreStats(scoreId) {
    return storage.getAggregate(scoreId)
  }

  async function getMeasuresToReinforce(scoreId, limit = 5) {
    const aggregate = await storage.getAggregate(scoreId)
    if (!aggregate) return []

    const measures = Object.entries(aggregate.measures).map(([index, data]) => ({
      sourceMeasureIndex: parseInt(index),
      ...data,
    }))

    measures.sort((a, b) => {
      if (b.errorRate !== a.errorRate) {
        return b.errorRate - a.errorRate
      }
      const aDate = a.lastPlayedAt ? new Date(a.lastPlayedAt) : new Date(0)
      const bDate = b.lastPlayedAt ? new Date(b.lastPlayedAt) : new Date(0)
      return aDate - bDate
    })

    return measures.slice(0, limit)
  }

  function getSessionEndTime(session) {
    if (session.endedAt) {
      return new Date(session.endedAt)
    }

    // If no endedAt, calculate from last measure attempt
    if (!session.measures || session.measures.length === 0) {
      return new Date(session.startedAt)
    }

    let lastAttemptTime = 0
    for (const measure of session.measures) {
      for (const attempt of measure.attempts) {
        const attemptEndTime = new Date(attempt.startedAt).getTime() + attempt.durationMs
        if (attemptEndTime > lastAttemptTime) {
          lastAttemptTime = attemptEndTime
        }
      }
    }

    return lastAttemptTime > 0 ? new Date(lastAttemptTime) : new Date(session.startedAt)
  }

  async function getDailyLog(date) {
    const startOfDay = new Date(date)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(date)
    endOfDay.setHours(23, 59, 59, 999)

    const sessions = await storage.getSessions(null, {
      start: startOfDay,
      end: endOfDay,
    })

    const scoreMap = new Map()

    for (const session of sessions) {
      if (!scoreMap.has(session.scoreId)) {
        scoreMap.set(session.scoreId, {
          scoreId: session.scoreId,
          scoreTitle: session.scoreTitle,
          composer: session.composer,
          totalMeasures: null,
          sessions: [],
          measuresWorked: new Set(),
          measuresReinforced: new Set(),
          totalPracticeTimeMs: 0,
        })
      }

      const entry = scoreMap.get(session.scoreId)
      entry.sessions.push(session)

      if (session.totalMeasures) {
        entry.totalMeasures = session.totalMeasures
      }

      const endTime = getSessionEndTime(session)
      const sessionDuration = endTime - new Date(session.startedAt)
      entry.totalPracticeTimeMs += sessionDuration

      for (const measure of session.measures) {
        const measureIndex = Number(measure.sourceMeasureIndex)
        entry.measuresWorked.add(measureIndex)
        if (session.mode === 'training') {
          entry.measuresReinforced.add(measureIndex)
        }
      }
    }

    return Array.from(scoreMap.values()).map((entry) => {
      const measuresWorked = Array.from(entry.measuresWorked).sort((a, b) => a - b)
      const workedInFull = entry.totalMeasures && measuresWorked.length >= entry.totalMeasures
      return {
        ...entry,
        measuresWorked,
        measuresReinforced: Array.from(entry.measuresReinforced).sort((a, b) => a - b),
        workedInFull,
      }
    })
  }

  async function getAllScores() {
    return storage.getAllAggregates()
  }
}
