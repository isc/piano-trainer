import { describe, it, expect, vi } from 'vitest'

// playback.js pulls in @tonejs/piano, which is loaded from a CDN in the browser and
// has no node package. Stub it so the pure timing helper can be imported under vitest.
vi.mock('@tonejs/piano', () => ({ Piano: class {} }))

const { expandOrnamentTimings } = await import('../../public/js/playback.js')

// Build the expanded turn notes the keyboard matcher (expandOrnamentNotes) feeds to
// audio playback: all share one parent note object, the principal sits on the beat,
// and the turn proper carries _turnDelay (whole-note fraction the principal is held).
function turnNotes({ baseTs = 0, parentDuration, turnDelay, count }) {
  const parent = { Length: { RealValue: parentDuration } }
  const OFFSET = 0.00001
  return Array.from({ length: count }, (_, i) => ({
    note: parent,
    isTurnNote: true,
    _turnDelay: turnDelay,
    // Mirror the matcher: principal at baseTs, turn proper offset by turnDelay.
    timestamp: turnDelay > 0 && i > 0
      ? baseTs + turnDelay + (i - 1) * OFFSET
      : baseTs + i * OFFSET,
  }))
}

describe('expandOrnamentTimings', () => {
  it('spreads an on-beat turn evenly over the full note', () => {
    const result = expandOrnamentTimings(turnNotes({ parentDuration: 0.25, turnDelay: 0, count: 4 }))
    expect(result.map((n) => n.timestamp)).toEqual([0, 0.0625, 0.125, 0.1875])
    expect(result.every((n) => n._ornamentDuration === 0.0625)).toBe(true)
  })

  it('holds the principal then plays a delayed turn over the note\'s final stretch', () => {
    // Quarter note, turn delayed by 3/16 so the turn proper fills the last 1/16.
    const result = expandOrnamentTimings(turnNotes({ parentDuration: 0.25, turnDelay: 0.1875, count: 5 }))

    // Principal sounds on the beat, held until the turn starts.
    expect(result[0].timestamp).toBe(0)
    expect(result[0]._ornamentDuration).toBe(0.1875)

    // The four turn notes share the remaining 1/16, evenly.
    const turnDur = 0.0625 / 4
    expect(result.slice(1).every((n) => n._ornamentDuration === turnDur)).toBe(true)
    expect(result[1].timestamp).toBe(0.1875)

    // The turn ends exactly at the note's end (no overrun, no gap).
    const last = result[result.length - 1]
    expect(last.timestamp + last._ornamentDuration).toBeCloseTo(0.25, 10)
  })

  it('passes non-ornament notes through untouched', () => {
    const plain = { timestamp: 1, midiNumber: 60 }
    const result = expandOrnamentTimings([plain])
    expect(result).toEqual([plain])
  })
})
