import { initStorage } from './storage.js'

export async function migratePlaythroughData() {
  const storage = initStorage()
  await storage.init()

  const sessions = await storage.getSessions()
  let migratedCount = 0

  for (const session of sessions) {
    // Skip sessions that already have completedAt
    if (session.completedAt) continue

    // Skip sessions without totalMeasures (can't determine if complete)
    if (!session.totalMeasures) continue

    // Check if this session was a full playthrough using sequential detection
    const playthrough = detectSequentialPlaythrough(session)
    if (playthrough) {
      session.completedAt = playthrough.completedAt
      await storage.saveSession(session)
      migratedCount++
    }
  }

  return { migratedCount, totalSessions: sessions.length }
}

function detectSequentialPlaythrough(session) {
  const { measures, totalMeasures } = session
  if (!measures || measures.length === 0 || !totalMeasures) return null

  // Flatten all attempts and sort chronologically
  const allAttempts = measures
    .flatMap((measure) =>
      measure.attempts.map((attempt) => ({
        measureIndex: Number(measure.sourceMeasureIndex),
        startedAt: attempt.startedAt,
        durationMs: attempt.durationMs,
      }))
    )
    .sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt))

  // Track sequential playthrough
  let expectedMeasure = 0
  let lastAttemptEndMs = 0

  for (const attempt of allAttempts) {
    if (attempt.measureIndex === 0) {
      expectedMeasure = 1
      lastAttemptEndMs = new Date(attempt.startedAt).getTime() + attempt.durationMs
    } else if (attempt.measureIndex === expectedMeasure) {
      expectedMeasure++
      lastAttemptEndMs = new Date(attempt.startedAt).getTime() + attempt.durationMs

      if (expectedMeasure >= totalMeasures) {
        // Found a complete playthrough - use end of last measure as completedAt
        return { completedAt: new Date(lastAttemptEndMs).toISOString() }
      }
    }
  }

  return null
}
