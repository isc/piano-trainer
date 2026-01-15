import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { initPracticeTracker } from '../../public/js/practiceTracker.js'
import { initPracticeStorage } from '../../public/js/practiceStorage.js'

describe('practiceTracker', () => {
  let tracker
  let storage

  beforeEach(async () => {
    indexedDB = new IDBFactory()
    storage = initPracticeStorage()
    tracker = initPracticeTracker(storage)
    await tracker.init()
  })

  describe('session management', () => {
    it('saves session to storage on end', async () => {
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'training')
      tracker.startMeasureAttempt(0)
      tracker.endMeasureAttempt(true)
      const savedSession = await tracker.endSession()

      const retrieved = await storage.getSession(savedSession.id)
      expect(retrieved.scoreId).toBe('/scores/test.xml')
    })

    it('does not save sessions with no completed measures', async () => {
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'training')
      const savedSession = await tracker.endSession()

      const retrieved = await storage.getSession(savedSession.id)
      expect(retrieved).toBeNull()
    })

    it('toggleMode preserves metadata and saves previous session', async () => {
      tracker.startSession('/scores/test.xml', 'Test Score', 'Composer', 'free')
      tracker.startMeasureAttempt(0)
      tracker.endMeasureAttempt(true)

      const newSession = await tracker.toggleMode('training')

      expect(newSession.scoreId).toBe('/scores/test.xml')
      expect(newSession.scoreTitle).toBe('Test Score')
      expect(newSession.mode).toBe('training')

      const stats = await tracker.getScoreStats('/scores/test.xml')
      expect(stats.totalSessions).toBe(1)
    })
  })

  describe('measure attempts', () => {
    beforeEach(() => {
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'training')
    })

    it('records wrong notes and marks attempt as dirty', async () => {
      tracker.startMeasureAttempt(0)
      tracker.recordWrongNote()
      tracker.recordWrongNote()

      const attempt = await tracker.endMeasureAttempt()
      expect(attempt.wrongNotes).toBe(2)
      expect(attempt.clean).toBe(false)
    })

    it('groups attempts by measure index', async () => {
      tracker.startMeasureAttempt(0)
      tracker.endMeasureAttempt(true)

      tracker.startMeasureAttempt(1)
      tracker.endMeasureAttempt(true)

      tracker.startMeasureAttempt(0)
      tracker.endMeasureAttempt(false)

      const session = await tracker.endSession()
      const measure0 = session.measures.find((m) => m.sourceMeasureIndex === 0)
      const measure1 = session.measures.find((m) => m.sourceMeasureIndex === 1)

      expect(measure0.attempts).toHaveLength(2)
      expect(measure1.attempts).toHaveLength(1)
    })
  })

  describe('session duration', () => {
    it('calculates duration based only on measure timestamps, not session start time', async () => {
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'training')

      // Wait 100ms to simulate user delay before starting to play
      await new Promise((resolve) => setTimeout(resolve, 100))

      const measureStart = Date.now()

      // Play first measure
      tracker.startMeasureAttempt(0)
      await new Promise((resolve) => setTimeout(resolve, 50))
      tracker.endMeasureAttempt(true)

      // Play second measure
      tracker.startMeasureAttempt(1)
      await new Promise((resolve) => setTimeout(resolve, 50))
      tracker.endMeasureAttempt(true)

      await tracker.endSession()

      const stats = await tracker.getScoreStats('/scores/test.xml')

      // Duration should be approximately 100ms (two measures of ~50ms each)
      // NOT ~200ms which would include the initial 100ms delay
      expect(stats.totalPracticeTimeMs).toBeGreaterThan(80)
      expect(stats.totalPracticeTimeMs).toBeLessThan(150)
    })

    it('calculates correct duration for daily log', async () => {
      const today = new Date()
      tracker.startSession('/scores/test.xml', 'Test Score', 'Composer', 'training')

      // Wait before starting to play
      await new Promise((resolve) => setTimeout(resolve, 100))

      tracker.startMeasureAttempt(0)
      await new Promise((resolve) => setTimeout(resolve, 50))
      tracker.endMeasureAttempt(true)

      await tracker.endSession()

      const dailyLog = await tracker.getDailyLog(today)

      expect(dailyLog).toHaveLength(1)
      // Should be ~50ms, not ~150ms
      expect(dailyLog[0].totalPracticeTimeMs).toBeGreaterThan(30)
      expect(dailyLog[0].totalPracticeTimeMs).toBeLessThan(100)
    })
  })

  describe('aggregates', () => {
    it('accumulates sessions and calculates measure statistics', async () => {
      // First session
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'training')
      tracker.startMeasureAttempt(0)
      tracker.endMeasureAttempt(true)
      await tracker.endSession()

      // Second session with errors
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'training')
      tracker.startMeasureAttempt(0)
      tracker.recordWrongNote()
      tracker.endMeasureAttempt(false)
      await tracker.endSession()

      const stats = await tracker.getScoreStats('/scores/test.xml')
      expect(stats.totalSessions).toBe(2)
      expect(stats.measures[0].totalAttempts).toBe(2)
      expect(stats.measures[0].cleanAttempts).toBe(1)
      expect(stats.measures[0].errorRate).toBeCloseTo(0.5)
    })
  })

  describe('score status', () => {
    it('progresses from dechiffrage to perfectionnement', async () => {
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'training')

      // Measure 0: 3 clean attempts (enough for perfectionnement)
      for (let i = 0; i < 3; i++) {
        tracker.startMeasureAttempt(0)
        tracker.endMeasureAttempt(true)
      }

      // Measure 1: 1 clean attempt (not enough)
      tracker.startMeasureAttempt(1)
      tracker.endMeasureAttempt(true)

      await tracker.endSession()

      const stats = await tracker.getScoreStats('/scores/test.xml')
      expect(stats.status).toBe('perfectionnement')
    })
  })

  describe('measures to reinforce', () => {
    it('returns measures sorted by error rate', async () => {
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'training')

      // Measure 0: 75% error rate (1 clean, 3 dirty)
      tracker.startMeasureAttempt(0)
      tracker.endMeasureAttempt(true)
      for (let i = 0; i < 3; i++) {
        tracker.startMeasureAttempt(0)
        tracker.endMeasureAttempt(false)
      }

      // Measure 1: 0% error rate (2 clean)
      for (let i = 0; i < 2; i++) {
        tracker.startMeasureAttempt(1)
        tracker.endMeasureAttempt(true)
      }

      await tracker.endSession()

      const toReinforce = await tracker.getMeasuresToReinforce('/scores/test.xml', 2)
      expect(toReinforce[0].sourceMeasureIndex).toBe(0)
      expect(toReinforce[1].sourceMeasureIndex).toBe(1)
    })
  })

  describe('daily log', () => {
    it('returns practiced scores for today', async () => {
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'training')
      tracker.startMeasureAttempt(0)
      tracker.endMeasureAttempt(true)
      await tracker.endSession()

      const log = await tracker.getDailyLog(new Date())

      expect(log).toHaveLength(1)
      expect(log[0].scoreId).toBe('/scores/test.xml')
      expect(log[0].measuresWorked).toContain(0)
    })

    it('counts timesPlayedInFull across multiple sessions', async () => {
      // First session: complete playthrough
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'training', 2)
      tracker.startMeasureAttempt(0)
      tracker.endMeasureAttempt(true)
      tracker.startMeasureAttempt(1)
      tracker.endMeasureAttempt(true)
      await tracker.endSession()

      // Second session: another complete playthrough
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'training', 2)
      tracker.startMeasureAttempt(0)
      tracker.endMeasureAttempt(true)
      tracker.startMeasureAttempt(1)
      tracker.endMeasureAttempt(true)
      await tracker.endSession()

      const log = await tracker.getDailyLog(new Date())

      expect(log).toHaveLength(1)
      expect(log[0].timesPlayedInFull).toBe(2)
    })

    it('counts timesPlayedInFull=2 when played twice in same session', async () => {
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'training', 2)

      // First complete playthrough
      tracker.startMeasureAttempt(0)
      await new Promise((resolve) => setTimeout(resolve, 5))
      tracker.endMeasureAttempt(true)
      tracker.startMeasureAttempt(1)
      await new Promise((resolve) => setTimeout(resolve, 5))
      tracker.endMeasureAttempt(true)

      // Second complete playthrough in the same session
      tracker.startMeasureAttempt(0)
      await new Promise((resolve) => setTimeout(resolve, 5))
      tracker.endMeasureAttempt(true)
      tracker.startMeasureAttempt(1)
      await new Promise((resolve) => setTimeout(resolve, 5))
      tracker.endMeasureAttempt(true)

      await tracker.endSession()

      const log = await tracker.getDailyLog(new Date())

      expect(log).toHaveLength(1)
      expect(log[0].timesPlayedInFull).toBe(2)
    })

    it('returns timesPlayedInFull=0 when score is not fully played', async () => {
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'training', 5)

      // Only play 3 of 5 measures
      tracker.startMeasureAttempt(0)
      tracker.endMeasureAttempt(true)
      tracker.startMeasureAttempt(1)
      tracker.endMeasureAttempt(true)
      tracker.startMeasureAttempt(2)
      tracker.endMeasureAttempt(true)

      await tracker.endSession()

      const log = await tracker.getDailyLog(new Date())

      expect(log).toHaveLength(1)
      expect(log[0].timesPlayedInFull).toBe(0)
    })
  })

  describe('getScoreHistory', () => {
    it('returns history for specific score only, with correct data', async () => {
      await playSession('/scores/test1.xml', [0, 1], 'training', 2)
      await playSession('/scores/test2.xml', [0])

      const history = await tracker.getScoreHistory('/scores/test1.xml')

      expect(history).toHaveLength(1)
      expect(history[0].measuresWorked).toEqual([0, 1])
      expect(history[0].measuresReinforced).toEqual([0, 1])
      expect(history[0].timesPlayedInFull).toBe(1)
    })

    it('does not track measuresReinforced for free mode', async () => {
      await playSession('/scores/test.xml', [0], 'free')

      const history = await tracker.getScoreHistory('/scores/test.xml')

      expect(history[0].measuresWorked).toEqual([0])
      expect(history[0].measuresReinforced).toEqual([])
    })
  })

  async function playSession(scoreId, measures, mode = 'training', totalMeasures = null) {
    tracker.startSession(scoreId, 'Test', 'Composer', mode, totalMeasures)
    for (const m of measures) {
      tracker.startMeasureAttempt(m)
      tracker.endMeasureAttempt(true)
    }
    await tracker.endSession()
  }

  describe('getAllScores', () => {
    it('returns all practiced scores', async () => {
      tracker.startSession('/scores/test1.xml', 'Test 1', 'Composer', 'training')
      tracker.startMeasureAttempt(0)
      tracker.endMeasureAttempt(true)
      await tracker.endSession()

      tracker.startSession('/scores/test2.xml', 'Test 2', 'Composer', 'training')
      tracker.startMeasureAttempt(0)
      tracker.endMeasureAttempt(true)
      await tracker.endSession()

      const allScores = await tracker.getAllScores()
      expect(allScores).toHaveLength(2)
    })
  })
})
