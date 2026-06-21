import { describe, it, expect } from 'vitest'
import { containerHasCursorStop } from '../../public/js/noteExtraction.js'

// The OSMD cursor skips containers whose notes are all invisible (print-object="no").
// Some publishers write an ornament's realized notes as such hidden notes in their
// own containers (the gruppetti in Beethoven's Pathétique). Counting those in
// cursorStops scheduled extra cursor.next() advances with no matching cursor
// position, so the playback cursor ran one step ahead per hidden container and
// stayed ahead for the rest of the piece.
const container = (...notes) => ({ staffEntries: [{ voiceEntries: [{ notes }] }] })

describe('containerHasCursorStop', () => {
  it('counts a container with a visible note', () => {
    expect(containerHasCursorStop(container({ PrintObject: true }))).toBe(true)
  })

  it('counts a rest-only container (rests are drawn)', () => {
    // A rest has no explicit PrintObject === false.
    expect(containerHasCursorStop(container({ isRest: () => true }))).toBe(true)
  })

  it('skips a container whose notes are all invisible', () => {
    expect(containerHasCursorStop(container({ PrintObject: false }))).toBe(false)
  })

  it('counts a mixed container with at least one visible note', () => {
    expect(containerHasCursorStop(container({ PrintObject: false }, { PrintObject: true }))).toBe(true)
  })

  it('skips an empty container', () => {
    expect(containerHasCursorStop({ staffEntries: [] })).toBe(false)
    expect(containerHasCursorStop({})).toBe(false)
  })
})
