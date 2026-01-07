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
      const savedSession = await tracker.endSession()

      const retrieved = await storage.getSession(savedSession.id)
      expect(retrieved.scoreId).toBe('/scores/test.xml')
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
      expect(log[0].measuresPlayedCount).toBe(1)
    })
  })

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
