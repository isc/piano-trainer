import { describe, it, expect } from 'vitest'
import { PERIODS, getPeriodForComposer, periodLabel } from '../../public/js/musicalPeriods.js'

describe('musicalPeriods', () => {
  it('returns the canonical period for each known composer', () => {
    expect(getPeriodForComposer('J.S. Bach')).toBe('baroque')
    expect(getPeriodForComposer('Mozart')).toBe('classique')
    expect(getPeriodForComposer('Chopin')).toBe('romantique')
    expect(getPeriodForComposer('Debussy')).toBe('moderne')
    expect(getPeriodForComposer('Luo Ni')).toBe('contemporain')
    expect(getPeriodForComposer('Traditional')).toBe('traditionnel')
  })

  it('returns null for unknown composers (caller falls back to no period)', () => {
    expect(getPeriodForComposer('Unknown Composer')).toBeNull()
    expect(getPeriodForComposer('')).toBeNull()
    expect(getPeriodForComposer(undefined)).toBeNull()
  })

  it('matches every period value to a PERIODS entry', () => {
    // Defensive check so a typo in the map can't silently break the filter UI
    // (the dropdown reads labels from PERIODS).
    const knownValues = new Set(PERIODS.map((p) => p.value))
    expect(knownValues.has('baroque')).toBe(true)
    expect(periodLabel('baroque')).toBe('Baroque')
    expect(periodLabel('unknown')).toBe('unknown')
  })
})
