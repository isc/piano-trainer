// Pure matching logic for strict-tempo playthrough — no DOM, no audio, no
// timers. Kept separate from strictPlaythrough.js so it can be unit-tested
// without dragging in the playback chain (and its esm.sh @tonejs/piano import).

// Pick the pending event of matching pitch that is closest in time to `now`,
// within `offTempoWindow` ms. Returns { event, delta } where delta = now - event.timeMs.
// Assumes events are sorted by timeMs ascending so we can stop scanning once
// the next pending event is too far in the future.
export function findMatchingEvent(events, midiNumber, now, offTempoWindow) {
  let best = null
  let bestAbsDelta = Infinity
  for (const event of events) {
    if (event.status !== 'pending') continue
    if (event.timeMs - now > offTempoWindow) break
    if (event.midiNumber !== midiNumber) continue
    const delta = now - event.timeMs
    const abs = Math.abs(delta)
    if (abs > offTempoWindow) continue
    if (abs < bestAbsDelta) {
      best = event
      bestAbsDelta = abs
    }
  }
  return best ? { event: best, delta: now - best.timeMs } : null
}

export function classifyMatch(delta, tolerance) {
  if (Math.abs(delta) <= tolerance) return 'hit'
  return delta < 0 ? 'offtempoEarly' : 'offtempoLate'
}
