import { describe, it, expect } from 'vitest'
import { buildSpreads, findSpread } from './spreads'

describe('buildSpreads', () => {
  it('pairs pages in order', () => {
    expect(buildSpreads(4, new Set())).toEqual([
      [1, 2],
      [3, 4],
    ])
  })

  it('leaves an odd last page alone', () => {
    expect(buildSpreads(5, new Set())).toEqual([[1, 2], [3, 4], [5]])
  })

  it('shows a wide page alone and pairs again after it', () => {
    expect(buildSpreads(6, new Set([3]))).toEqual([[1, 2], [3], [4, 5], [6]])
  })

  it("doesn't pair a page with the wide page after it", () => {
    expect(buildSpreads(6, new Set([2]))).toEqual([[1], [2], [3, 4], [5, 6]])
  })

  it('handles wide pages back to back', () => {
    expect(buildSpreads(5, new Set([2, 3]))).toEqual([[1], [2], [3], [4, 5]])
  })

  it('has no spreads for an empty book', () => {
    expect(buildSpreads(0, new Set())).toEqual([])
  })
})

describe('findSpread', () => {
  const spreads = buildSpreads(7, new Set([3]))
  // [1, 2] [3] [4, 5] [6, 7]

  it('finds the spread of either page', () => {
    expect(findSpread(spreads, 1)).toBe(0)
    expect(findSpread(spreads, 2)).toBe(0)
    expect(findSpread(spreads, 3)).toBe(1)
    expect(findSpread(spreads, 5)).toBe(2)
    expect(findSpread(spreads, 7)).toBe(3)
  })

  it('finds nothing outside the book', () => {
    expect(findSpread(spreads, 0)).toBe(-1)
    expect(findSpread(spreads, 8)).toBe(-1)
  })
})
