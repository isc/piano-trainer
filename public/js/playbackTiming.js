// Pure timing math shared by the audio playback engine (playback.js) and the
// strict-mode playthrough (strictPlaythrough.js). Kept free of the browser-only
// audio/DOM dependencies those modules carry, so it can be unit-tested directly.

export function tsToSeconds(ts, bpm) {
  return ts * 4 * 60 / bpm
}

// Build cumulative start times (in whole-note fractions) for each measure in playback order.
// Each measure's actual duration comes from OSMD, so time signatures other than 4/4 work correctly.
export function buildCumStartTimes(allNotes, sourceMeasures) {
  const cumTimes = []
  let cumulativeTime = 0
  for (const measureData of allNotes) {
    cumTimes.push(cumulativeTime)
    const duration = sourceMeasures[measureData.sourceMeasureIndex]?.Duration?.RealValue ?? 1.0
    cumulativeTime += duration
  }
  return cumTimes
}

// Build the list of cursor advance timestamps (in ms from start) from allNotes
// data. Avoids traversing the OSMD cursor (which corrupts its visual state
// after EndReached+reset).
//
// The OSMD cursor stops once per vertical staff-entry container, so we emit one
// step per container (each measure's `cursorStops` holds those timestamps). This
// includes rest-only containers — a position where one hand rests while the
// other sustains a longer note. Driving the timeline off note onsets instead
// skipped those stops, so the cursor fell one position behind after every such
// container and stayed behind for the rest of the piece. A chord or an ornament
// is a single container, hence a single stop — no extra handling needed.
export function buildCursorTimeline(allNotes, cumStartTimes, bpm, offsetMs = 0) {
  const steps = []

  for (let i = 0; i < allNotes.length; i++) {
    for (const offset of allNotes[i].cursorStops ?? []) {
      steps.push(offsetMs + tsToSeconds(cumStartTimes[i] + offset, bpm) * 1000)
    }
  }

  return steps.sort((a, b) => a - b)
}
