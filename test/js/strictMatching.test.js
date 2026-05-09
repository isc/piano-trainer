import { describe, it, expect } from 'vitest'
import { findMatchingEvent, classifyMatch } from '../../public/js/strictMatching.js'

const OFFTEMPO_WINDOW = 450
const TOLERANCE = 150

function event(timeMs, midiNumber, status = 'pending') {
  return { timeMs, midiNumber, status }
}

describe('findMatchingEvent', () => {
  it('matches a pending event at exact time', () => {
    const events = [event(1000, 60)]
    const match = findMatchingEvent(events, 60, 1000, OFFTEMPO_WINDOW)
    expect(match).toEqual({ event: events[0], delta: 0 })
  })

  it('matches when played early within the off-tempo window', () => {
    const events = [event(1000, 60)]
    const match = findMatchingEvent(events, 60, 700, OFFTEMPO_WINDOW)
    expect(match.event).toBe(events[0])
    expect(match.delta).toBe(-300)
  })

  it('matches when played late within the off-tempo window', () => {
    const events = [event(1000, 60)]
    const match = findMatchingEvent(events, 60, 1300, OFFTEMPO_WINDOW)
    expect(match.event).toBe(events[0])
    expect(match.delta).toBe(300)
  })

  it('does not match outside the off-tempo window', () => {
    const events = [event(1000, 60)]
    expect(findMatchingEvent(events, 60, 500, OFFTEMPO_WINDOW)).toBeNull()
    expect(findMatchingEvent(events, 60, 1500, OFFTEMPO_WINDOW)).toBeNull()
  })

  it('does not match a different pitch', () => {
    const events = [event(1000, 60)]
    expect(findMatchingEvent(events, 64, 1000, OFFTEMPO_WINDOW)).toBeNull()
  })

  it('skips already-hit events and falls through to the next pending one', () => {
    const events = [event(1000, 60, 'hit'), event(1300, 60, 'pending')]
    const match = findMatchingEvent(events, 60, 1100, OFFTEMPO_WINDOW)
    expect(match.event).toBe(events[1])
    expect(match.delta).toBe(-200)
  })

  it('picks the closest pending event when several share the same pitch', () => {
    const events = [event(1000, 60), event(1500, 60)]
    // delta to e0 = +300, delta to e1 = -200 → e1 wins
    const match = findMatchingEvent(events, 60, 1300, OFFTEMPO_WINDOW)
    expect(match.event).toBe(events[1])
    expect(match.delta).toBe(-200)
  })

  it('breaks early when the next pending event is beyond the look-ahead window', () => {
    const events = [event(2000, 60)]
    // 2000 - 1000 = 1000 > 450 → no match, but also early-exit
    expect(findMatchingEvent(events, 60, 1000, OFFTEMPO_WINDOW)).toBeNull()
  })

  it('returns null when the events list is empty', () => {
    expect(findMatchingEvent([], 60, 1000, OFFTEMPO_WINDOW)).toBeNull()
  })

  it('does not match a recently-missed event', () => {
    const events = [event(1000, 60, 'missed')]
    expect(findMatchingEvent(events, 60, 1100, OFFTEMPO_WINDOW)).toBeNull()
  })
})

describe('classifyMatch', () => {
  it('classifies as hit when delta is within ±tolerance', () => {
    expect(classifyMatch(0, TOLERANCE)).toBe('hit')
    expect(classifyMatch(150, TOLERANCE)).toBe('hit')
    expect(classifyMatch(-150, TOLERANCE)).toBe('hit')
  })

  it('classifies negative delta beyond tolerance as offtempoEarly', () => {
    expect(classifyMatch(-151, TOLERANCE)).toBe('offtempoEarly')
    expect(classifyMatch(-300, TOLERANCE)).toBe('offtempoEarly')
  })

  it('classifies positive delta beyond tolerance as offtempoLate', () => {
    expect(classifyMatch(151, TOLERANCE)).toBe('offtempoLate')
    expect(classifyMatch(300, TOLERANCE)).toBe('offtempoLate')
  })
})
