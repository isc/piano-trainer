import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { initPracticeTracker } from '../../public/js/practiceTracker.js'
import { initStorage } from '../../public/js/storage.js'

describe('practiceTracker', () => {
  let tracker
  let storage

  beforeEach(async () => {
    indexedDB = new IDBFactory()
    storage = initStorage()
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
      await sleep(100)

      // Play first and second measures
      await playMeasure(0, 50)
      await playMeasure(1, 50)

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
      await sleep(100)

      await playMeasure(0, 50)

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
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'free', 2)
      await playMeasure(0)
      await playMeasure(1)
      tracker.markScoreCompleted()
      await tracker.endSession()

      // Second session: another complete playthrough
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'free', 2)
      await playMeasure(0)
      await playMeasure(1)
      tracker.markScoreCompleted()
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

    it('counts playthrough when markScoreCompleted is called after restart', async () => {
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'free', 3)

      // Start playing measures 0, 1 (incomplete)
      await playMeasure(0, 5)
      await playMeasure(1, 5)

      // Restart from beginning and play all measures
      await playMeasure(0, 5)
      await playMeasure(1, 5)
      await playMeasure(2, 5)

      tracker.markScoreCompleted()
      await tracker.endSession()

      const log = await tracker.getDailyLog(new Date())

      expect(log).toHaveLength(1)
      expect(log[0].timesPlayedInFull).toBe(1)
    })

    it('counts playthrough with repeats when markScoreCompleted is called', async () => {
      // Simulate a score with repeats (like Fur Elise)
      // Source measures: 0-4, but with repeat: 0,1,2,0,1,3,4
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'free', 5)

      // First section: 0, 1, 2
      await playMeasure(0, 5)
      await playMeasure(1, 5)
      await playMeasure(2, 5)

      // Repeat: back to 0, 1 (this would break sequential detection)
      await playMeasure(0, 5)
      await playMeasure(1, 5)

      // Continue with 3, 4
      await playMeasure(3, 5)
      await playMeasure(4, 5)

      // Mark as completed (this is what onScoreCompleted does)
      tracker.markScoreCompleted()
      await tracker.endSession()

      const log = await tracker.getDailyLog(new Date())

      expect(log).toHaveLength(1)
      // Should count as 1 playthrough because markScoreCompleted was called
      expect(log[0].timesPlayedInFull).toBe(1)
    })

    it('playthrough duration excludes time before restarting from measure 0', async () => {
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'free', 3)

      // Play measures 1, 2 first (simulates clicking on measure 1)
      await playMeasure(1, 50)
      await playMeasure(2, 50)

      // Now restart from measure 0 (simulates clicking on measure 0)
      tracker.restartPlaythrough()
      await playMeasure(0, 30)
      await playMeasure(1, 30)
      await playMeasure(2, 30)

      tracker.markScoreCompleted()
      await tracker.endSession()

      const history = await tracker.getScoreHistory('/scores/test.xml')

      expect(history[0].fullPlaythroughs).toHaveLength(1)
      // Duration should be ~90ms (from restart to completion)
      // NOT ~190ms (which would include the initial measures 1, 2)
      expect(history[0].fullPlaythroughs[0].durationMs).toBeGreaterThan(70)
      expect(history[0].fullPlaythroughs[0].durationMs).toBeLessThan(150)
    })

    it('consecutive playthroughs have correct independent timings', async () => {
      // First playthrough: slow (~150ms)
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'free', 2)
      await playMeasure(0, 75)
      await playMeasure(1, 75)
      tracker.markScoreCompleted()
      await tracker.endSession()

      // Second playthrough: fast (~60ms)
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'free', 2)
      await playMeasure(0, 30)
      await playMeasure(1, 30)
      tracker.markScoreCompleted()
      await tracker.endSession()

      const history = await tracker.getScoreHistory('/scores/test.xml')

      // Both playthroughs are on the same day, so 1 history entry with 2 playthroughs
      expect(history).toHaveLength(1)
      expect(history[0].fullPlaythroughs).toHaveLength(2)

      // Playthroughs are sorted by most recent first
      const [secondPlaythrough, firstPlaythrough] = history[0].fullPlaythroughs

      // First playthrough should be ~150ms
      expect(firstPlaythrough.durationMs).toBeGreaterThan(120)
      expect(firstPlaythrough.durationMs).toBeLessThan(200)

      // Second playthrough should be ~60ms (not affected by first)
      expect(secondPlaythrough.durationMs).toBeGreaterThan(40)
      expect(secondPlaythrough.durationMs).toBeLessThan(100)
    })
  })

  describe('getScoreHistory', () => {
    it('returns history for specific score only, with correct data', async () => {
      await playSession('/scores/test1.xml', [0, 1], 'training', 2, true)
      await playSession('/scores/test2.xml', [0])

      const history = await tracker.getScoreHistory('/scores/test1.xml')

      expect(history).toHaveLength(1)
      expect(history[0].measuresWorked).toEqual([0, 1])
      expect(history[0].measuresReinforced).toEqual([0, 1])
      expect(history[0].timesPlayedInFull).toBe(1)
    })

    it('calculates playthrough duration as end of last measure minus start of first', async () => {
      tracker.startSession('/scores/test.xml', 'Test', 'Composer', 'free', 2)

      await playMeasure(0, 50)
      await playMeasure(1, 50)

      tracker.markScoreCompleted()
      await tracker.endSession()

      const history = await tracker.getScoreHistory('/scores/test.xml')

      expect(history[0].fullPlaythroughs).toHaveLength(1)
      // Duration should be ~100ms (time from start of measure 0 to end of measure 1)
      expect(history[0].fullPlaythroughs[0].durationMs).toBeGreaterThan(80)
      expect(history[0].fullPlaythroughs[0].durationMs).toBeLessThan(200)
    })

    it('does not track measuresReinforced for free mode', async () => {
      await playSession('/scores/test.xml', [0], 'free')

      const history = await tracker.getScoreHistory('/scores/test.xml')

      expect(history[0].measuresWorked).toEqual([0])
      expect(history[0].measuresReinforced).toEqual([])
    })
  })

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async function playMeasure(measureIndex, delayMs = 0) {
    tracker.startMeasureAttempt(measureIndex)
    if (delayMs > 0) await sleep(delayMs)
    tracker.endMeasureAttempt(true)
  }

  async function playSession(scoreId, measures, mode = 'training', totalMeasures = null, markComplete = false) {
    tracker.startSession(scoreId, 'Test', 'Composer', mode, totalMeasures)
    for (const m of measures) {
      await playMeasure(m)
    }
    if (markComplete) tracker.markScoreCompleted()
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
