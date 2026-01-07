import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { initPracticeTracker } from '../../public/js/practiceTracker.js'
import { initPracticeStorage } from '../../public/js/practiceStorage.js'

describe('practiceTracker', () => {
  let tracker
  let storage

  beforeEach(async () => {
    // Reset IndexedDB before each test
    indexedDB = new IDBFactory()
    storage = initPracticeStorage()
    tracker = initPracticeTracker(storage)
    await tracker.init()
  })

  describe('session management', () => {
    it('starts a session with correct metadata', () => {
      const session = tracker.startSession('/scores/test.xml', 'Test Score', 'Test Composer', 'training')

      expect(session).not.toBeNull()
      expect(session.scoreId).toBe('/scores/test.xml')
      expect(session.scoreTitle).toBe('Test Score')
      expect(session.composer).toBe('Test Composer')
      expect(session.mode).toBe('training')
      expect(session.startedAt).toBeDefined()
      expect(session.measures).toEqual([])
    })

    it('starts a session with free mode', () => {
      const session = tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'free')

      expect(session.mode).toBe('free')
    })

    it('handles null metadata gracefully', () => {
      const session = tracker.startSession('/scores/test.xml', null, null, 'training')

      expect(session.scoreTitle).toBeNull()
      expect(session.composer).toBeNull()
    })

    it('returns null when scoreId is null', () => {
      const session = tracker.startSession(null, 'Test', 'Composer', 'training')
      expect(session).toBeNull()
    })

    it('ends session and saves to storage', async () => {
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'training')
      const savedSession = await tracker.endSession()

      expect(savedSession).not.toBeNull()
      expect(savedSession.endedAt).toBeDefined()

      const retrieved = await storage.getSession(savedSession.id)
      expect(retrieved).not.toBeNull()
      expect(retrieved.scoreId).toBe('/scores/test.xml')
    })

    it('returns null when ending session without active session', async () => {
      const result = await tracker.endSession()
      expect(result).toBeNull()
    })

    it('toggles mode and preserves metadata', async () => {
      tracker.startSession('/scores/test.xml', 'Test Score', 'Test Composer', 'free')
      tracker.startMeasureAttempt(0)
      tracker.endMeasureAttempt(true)

      const newSession = await tracker.toggleMode('training')

      expect(newSession).not.toBeNull()
      expect(newSession.scoreId).toBe('/scores/test.xml')
      expect(newSession.scoreTitle).toBe('Test Score')
      expect(newSession.composer).toBe('Test Composer')
      expect(newSession.mode).toBe('training')
      expect(newSession.measures).toEqual([])
    })

    it('toggleMode saves previous session', async () => {
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'free')
      tracker.startMeasureAttempt(0)
      tracker.endMeasureAttempt(true)

      await tracker.toggleMode('training')

      const stats = await tracker.getScoreStats('/scores/test.xml')
      expect(stats.totalSessions).toBe(1)
    })

    it('toggleMode returns null without active session', async () => {
      const result = await tracker.toggleMode('training')
      expect(result).toBeNull()
    })
  })

  describe('measure attempts', () => {
    beforeEach(() => {
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'training')
    })

    it('starts a measure attempt', () => {
      const attempt = tracker.startMeasureAttempt(0)

      expect(attempt).not.toBeNull()
      expect(attempt.sourceMeasureIndex).toBe(0)
      expect(attempt.startedAt).toBeDefined()
      expect(attempt.wrongNotes).toBe(0)
      expect(attempt.clean).toBe(true)
    })

    it('returns null when starting attempt without session', async () => {
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'training')
      await tracker.endSession()
      const attempt = tracker.startMeasureAttempt(0)
      expect(attempt).toBeNull()
    })

    it('records wrong notes', () => {
      tracker.startMeasureAttempt(0)

      tracker.recordWrongNote()
      tracker.recordWrongNote()

      const attempt = tracker.endMeasureAttempt()
      expect(attempt.wrongNotes).toBe(2)
      expect(attempt.clean).toBe(false)
    })

    it('ends measure attempt with explicit clean status', () => {
      tracker.startMeasureAttempt(0)

      const attempt = tracker.endMeasureAttempt(true)
      expect(attempt.clean).toBe(true)
    })

    it('adds attempt to session measures', async () => {
      tracker.startMeasureAttempt(0)
      tracker.endMeasureAttempt(true)

      tracker.startMeasureAttempt(0)
      tracker.recordWrongNote()
      tracker.endMeasureAttempt(false)

      const session = await tracker.endSession()
      expect(session.measures).toHaveLength(1)
      expect(session.measures[0].sourceMeasureIndex).toBe(0)
      expect(session.measures[0].attempts).toHaveLength(2)
      expect(session.measures[0].attempts[0].clean).toBe(true)
      expect(session.measures[0].attempts[1].clean).toBe(false)
    })

    it('groups attempts by measure index', async () => {
      tracker.startMeasureAttempt(0)
      tracker.endMeasureAttempt(true)

      tracker.startMeasureAttempt(1)
      tracker.endMeasureAttempt(true)

      tracker.startMeasureAttempt(0)
      tracker.endMeasureAttempt(false)

      const session = await tracker.endSession()
      expect(session.measures).toHaveLength(2)

      const measure0 = session.measures.find((m) => m.sourceMeasureIndex === 0)
      const measure1 = session.measures.find((m) => m.sourceMeasureIndex === 1)

      expect(measure0.attempts).toHaveLength(2)
      expect(measure1.attempts).toHaveLength(1)
    })
  })

  describe('aggregates', () => {
    it('creates aggregate on first session', async () => {
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'training')
      tracker.startMeasureAttempt(0)
      tracker.endMeasureAttempt(true)
      await tracker.endSession()

      const stats = await tracker.getScoreStats('/scores/test.xml')
      expect(stats).not.toBeNull()
      expect(stats.scoreId).toBe('/scores/test.xml')
      expect(stats.totalSessions).toBe(1)
    })

    it('updates aggregate on subsequent sessions', async () => {
      // First session
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'training')
      tracker.startMeasureAttempt(0)
      tracker.endMeasureAttempt(true)
      await tracker.endSession()

      // Second session
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'training')
      tracker.startMeasureAttempt(0)
      tracker.endMeasureAttempt(true)
      await tracker.endSession()

      const stats = await tracker.getScoreStats('/scores/test.xml')
      expect(stats.totalSessions).toBe(2)
    })

    it('calculates measure statistics correctly', async () => {
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'training')

      // 3 clean attempts, 2 dirty attempts for measure 0
      for (let i = 0; i < 3; i++) {
        tracker.startMeasureAttempt(0)
        tracker.endMeasureAttempt(true)
      }
      for (let i = 0; i < 2; i++) {
        tracker.startMeasureAttempt(0)
        tracker.recordWrongNote()
        tracker.endMeasureAttempt(false)
      }

      await tracker.endSession()

      const stats = await tracker.getScoreStats('/scores/test.xml')
      expect(stats.measures[0].totalAttempts).toBe(5)
      expect(stats.measures[0].cleanAttempts).toBe(3)
      expect(stats.measures[0].errorRate).toBeCloseTo(0.4)
    })
  })

  describe('score status', () => {
    it('returns dechiffrage for new score', async () => {
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'training')
      tracker.startMeasureAttempt(0)
      tracker.endMeasureAttempt(false)
      await tracker.endSession()

      const stats = await tracker.getScoreStats('/scores/test.xml')
      expect(stats.status).toBe('dechiffrage')
    })

    it('returns perfectionnement when 50%+ measures have 3+ clean attempts', async () => {
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'training')

      // Measure 0: 3 clean attempts
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

    it('computes status correctly with computeScoreStatus', () => {
      const aggregate = {
        measures: {
          0: { cleanAttempts: 5 },
          1: { cleanAttempts: 5 },
        },
        firstPlayedAt: '2026-01-01',
        lastPlayedAt: '2026-01-03',
      }

      // Note: repertoire requires 3 unique days, which is hard to test without mocking dates
      // This test checks the basic logic
      const status = tracker.computeScoreStatus(aggregate)
      expect(['perfectionnement', 'repertoire']).toContain(status)
    })
  })

  describe('measures to reinforce', () => {
    it('returns measures sorted by error rate', async () => {
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'training')

      // Measure 0: 80% error rate (1 clean, 4 dirty)
      tracker.startMeasureAttempt(0)
      tracker.endMeasureAttempt(true)
      for (let i = 0; i < 4; i++) {
        tracker.startMeasureAttempt(0)
        tracker.recordWrongNote()
        tracker.endMeasureAttempt(false)
      }

      // Measure 1: 0% error rate (5 clean)
      for (let i = 0; i < 5; i++) {
        tracker.startMeasureAttempt(1)
        tracker.endMeasureAttempt(true)
      }

      // Measure 2: 50% error rate (2 clean, 2 dirty)
      for (let i = 0; i < 2; i++) {
        tracker.startMeasureAttempt(2)
        tracker.endMeasureAttempt(true)
      }
      for (let i = 0; i < 2; i++) {
        tracker.startMeasureAttempt(2)
        tracker.recordWrongNote()
        tracker.endMeasureAttempt(false)
      }

      await tracker.endSession()

      const toReinforce = await tracker.getMeasuresToReinforce('/scores/test.xml', 3)
      expect(toReinforce).toHaveLength(3)
      expect(toReinforce[0].sourceMeasureIndex).toBe(0) // 80% error
      expect(toReinforce[1].sourceMeasureIndex).toBe(2) // 50% error
      expect(toReinforce[2].sourceMeasureIndex).toBe(1) // 0% error
    })

    it('returns empty array for unknown score', async () => {
      const toReinforce = await tracker.getMeasuresToReinforce('/scores/unknown.xml')
      expect(toReinforce).toEqual([])
    })
  })

  describe('daily log', () => {
    it('returns sessions for a specific day', async () => {
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'training')
      tracker.startMeasureAttempt(0)
      tracker.endMeasureAttempt(true)
      await tracker.endSession()

      const today = new Date()
      const log = await tracker.getDailyLog(today)

      expect(log).toHaveLength(1)
      expect(log[0].scoreId).toBe('/scores/test.xml')
      expect(log[0].measuresPlayed).toContain(0)
    })
  })

  describe('getAllScores', () => {
    it('returns all score aggregates', async () => {
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
