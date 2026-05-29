import { describe, it, expect } from 'vitest'
import { measureClickRectDimensions } from '../../public/js/musicxml.js'

describe('measureClickRectDimensions', () => {
  it('produces a positive-size rect for normal bounds', () => {
    const d = measureClickRectDimensions({ minX: 100, maxX: 200, minY: 50, maxY: 90 })
    expect(d.width).toBeGreaterThan(0)
    expect(d.height).toBeGreaterThan(0)
    // x/y are offset by the left/top padding
    expect(d.x).toBe(100 - 15)
    expect(d.y).toBe(50 - 12)
  })

  it('clamps width to 0 when horizontal bounds are inverted (transient getBBox during render/resize)', () => {
    const d = measureClickRectDimensions({ minX: 200, maxX: 0, minY: 50, maxY: 90 })
    expect(d.width).toBe(0)
  })

  it('clamps height to 0 when vertical bounds are inverted', () => {
    const d = measureClickRectDimensions({ minX: 0, maxX: 100, minY: 200, maxY: 0 })
    expect(d.height).toBe(0)
  })

  it('never returns a negative width or height for slightly-inverted bounds', () => {
    const d = measureClickRectDimensions({ minX: 150, maxX: 16, minY: 80, maxY: 79 })
    expect(d.width).toBeGreaterThanOrEqual(0)
    expect(d.height).toBeGreaterThanOrEqual(0)
  })
})
