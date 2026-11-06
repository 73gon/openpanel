import { describe, expect, it } from 'vitest'
import {
  formatLocator,
  overallFraction,
  pageAt,
  pageStart,
  parseLocator,
  positionAt,
} from './epub-position'

// A picture page, then chapters of 3,000 and 6,000 characters
const chars = [0, 3000, 6000]
const total = 300 + 3000 + 6000

describe('epub positions', () => {
  it('weighs chapters by their text, a picture page by a little', () => {
    expect(overallFraction(chars, { chapter: 0, fraction: 0 })).toBe(0)
    expect(overallFraction(chars, { chapter: 1, fraction: 0 })).toBeCloseTo(
      300 / total,
    )
    expect(overallFraction(chars, { chapter: 2, fraction: 0.5 })).toBeCloseTo(
      (3300 + 3000) / total,
    )
    expect(overallFraction(chars, { chapter: 2, fraction: 1 })).toBe(1)
  })

  it('finds the place again from how far through the book it is', () => {
    for (const pos of [
      { chapter: 0, fraction: 0.5 },
      { chapter: 1, fraction: 0.25 },
      { chapter: 2, fraction: 0.9 },
    ]) {
      const back = positionAt(chars, overallFraction(chars, pos))
      expect(back.chapter).toBe(pos.chapter)
      expect(back.fraction).toBeCloseTo(pos.fraction)
    }
    expect(positionAt(chars, 1)).toEqual({ chapter: 2, fraction: 1 })
  })

  it('counts pages from 1 to the book’s length', () => {
    expect(pageAt(0, 200)).toBe(1)
    expect(pageAt(0.5, 200)).toBe(101)
    expect(pageAt(1, 200)).toBe(200)
    expect(pageAt(pageStart(57, 200), 200)).toBe(57)
  })

  it('keeps a place as text, and refuses one that doesn’t fit the book', () => {
    const locator = formatLocator({ chapter: 2, fraction: 0.123456 })
    expect(locator).toBe('2:0.1235')
    expect(parseLocator(locator, 3)).toEqual({ chapter: 2, fraction: 0.1235 })
    expect(parseLocator(locator, 2)).toBeNull()
    expect(parseLocator('nonsense', 3)).toBeNull()
    expect(parseLocator(undefined, 3)).toBeNull()
  })
})
