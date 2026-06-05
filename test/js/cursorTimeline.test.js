import { describe, it, expect } from 'vitest'
import { buildCursorTimeline } from '../../public/js/playbackTiming.js'

// The OSMD cursor stops once per vertical staff-entry container. buildCursorTimeline
// must emit one step per container (each measure's `cursorStops`), including
// containers that hold only rests -- otherwise the cursor falls a position behind
// after a rest-only stop and stays behind for the rest of the piece.
describe('buildCursorTimeline', () => {
  // tsToSeconds(ts, 120) = ts * 4 * 60 / 120 = ts * 2 seconds -> ts * 2000 ms
  it('emits one step per container, including rest-only positions', () => {
    const allNotes = [
      { cursorStops: [0, 0.5] }, // measure 0: two stops
      { cursorStops: [0, 0.25, 0.5] }, // measure 1: middle stop is a rest-only container
    ]
    const measureStartTimes = [0, 1]

    const steps = buildCursorTimeline(allNotes, measureStartTimes, 120)

    expect(steps).toEqual([0, 1000, 2000, 2500, 3000])
  })

  it('applies the start offset to every step', () => {
    const steps = buildCursorTimeline([{ cursorStops: [0, 0.5] }], [0], 120, 500)
    expect(steps).toEqual([500, 1500])
  })

  it('treats a measure with no cursorStops as contributing no steps', () => {
    const steps = buildCursorTimeline([{}, { cursorStops: [0] }], [0, 1], 120)
    expect(steps).toEqual([2000])
  })
})
