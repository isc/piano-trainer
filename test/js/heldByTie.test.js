import { describe, it, expect } from 'vitest'
import { isHeldByTie } from '../../public/js/musicxml.js'

const G3 = 55

// notes at one timestamp: a tied bass G (continuation) and a triplet G of the same pitch
// in another voice, plus an unrelated note.
const tiedBassG = { midiNumber: G3, isTieContinuation: true }
const tripletG = { midiNumber: G3, isTieContinuation: false }
const otherNote = { midiNumber: 48, isTieContinuation: false } // C3

describe('isHeldByTie', () => {
  it('covers a tie-continuation note while its key is held', () => {
    const notes = [tiedBassG, otherNote]
    expect(isHeldByTie(tiedBassG, notes, new Set([G3]))).toBe(true)
  })

  it('covers a unison note when another voice ties that pitch (held triplet/bass unison)', () => {
    const notes = [tiedBassG, tripletG]
    // the triplet G is not itself tied, but the held key is busy holding the tied bass G
    expect(isHeldByTie(tripletG, notes, new Set([G3]))).toBe(true)
  })

  it('does not cover a note whose key is not held', () => {
    const notes = [tiedBassG, tripletG]
    expect(isHeldByTie(tripletG, notes, new Set())).toBe(false)
    expect(isHeldByTie(tiedBassG, notes, new Set())).toBe(false)
  })

  it('does not cover a held note when no tie at the timestamp holds that pitch', () => {
    const notes = [tripletG, otherNote] // no tie continuation present
    expect(isHeldByTie(tripletG, notes, new Set([G3]))).toBe(false)
  })

  it('does not cover an unrelated held pitch', () => {
    const notes = [tiedBassG, otherNote]
    expect(isHeldByTie(otherNote, notes, new Set([48, G3]))).toBe(false)
  })
})
