import { describe, it, expect } from 'vitest'
import {
  applyPositionalNoteStates,
  chooseCurrentPassOccurrences,
} from '../../public/js/fingeringEditor.js'

// Build a minimal allNotes-like structure. Two occurrences of the same source note
// (a repeated measure) share a fingeringKey but sit at different playback indices.
function makeAllNotes(states) {
  // states: array (per playback measure) of arrays of { key, played, active }
  return states.map((measure) => ({
    notes: measure.map(({ key, played = false, active = false }) => ({
      fingeringKey: key,
      played,
      active,
    })),
  }))
}

function captureStates(allNotes) {
  return allNotes.map(({ notes }) => notes.map(({ played, active }) => ({ played, active })))
}

describe('applyPositionalNoteStates', () => {
  it('keeps the two occurrences of a repeated note independent', () => {
    // First pass of a repeated measure was played; the repeat (second occurrence) was not.
    const original = makeAllNotes([
      [{ key: 'm1n1', played: true }], // playback index 0: first pass, played
      [{ key: 'm1n1', played: false }], // playback index 1: repeat, not yet played
    ])
    const saved = captureStates(original)

    // Simulate the re-extraction after a fingering change: a fresh structure, all reset.
    const fresh = makeAllNotes([[{ key: 'm1n1' }], [{ key: 'm1n1' }]])
    applyPositionalNoteStates(fresh, saved)

    expect(fresh[0].notes[0].played).toBe(true)
    // The repeat must NOT inherit the first pass's "played" state (the bug this fixes).
    expect(fresh[1].notes[0].played).toBe(false)
  })

  it('restores played and active per playback position', () => {
    const fresh = makeAllNotes([[{ key: 'a' }, { key: 'b' }], [{ key: 'a' }, { key: 'b' }]])
    const saved = [
      [{ played: true, active: false }, { played: false, active: true }],
      [{ played: false, active: false }, { played: false, active: false }],
    ]
    applyPositionalNoteStates(fresh, saved)
    expect(fresh[0].notes[0]).toMatchObject({ played: true, active: false })
    expect(fresh[0].notes[1]).toMatchObject({ played: false, active: true })
    expect(fresh[1].notes[0]).toMatchObject({ played: false, active: false })
  })
})

describe('chooseCurrentPassOccurrences', () => {
  // Repeated note at playback indices 0 (first pass) and 2 (repeat); a distinct note at index 1.
  const allNotes = makeAllNotes([
    [{ key: 'rep' }],
    [{ key: 'mid' }],
    [{ key: 'rep' }],
  ])

  it('picks the first-pass occurrence while in the first pass', () => {
    const chosen = chooseCurrentPassOccurrences(allNotes, 0)
    expect(chosen.get('rep')).toBe(allNotes[0].notes[0])
  })

  it('picks the repeat occurrence once the cursor is past it', () => {
    const chosen = chooseCurrentPassOccurrences(allNotes, 2)
    expect(chosen.get('rep')).toBe(allNotes[2].notes[0])
  })

  it('falls back to the earliest occurrence when none has been reached yet', () => {
    const chosen = chooseCurrentPassOccurrences(allNotes, -1)
    expect(chosen.get('rep')).toBe(allNotes[0].notes[0])
  })
})
