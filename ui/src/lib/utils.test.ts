import { describe, it, expect } from 'vitest'
import { cn, countLabel, pad2, stripTitleZeros } from './utils'

describe('cn (class name merger)', () => {
  it('combines class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    const isActive = true
    const isDisabled = false
    expect(cn('base', isActive && 'active', isDisabled && 'disabled')).toBe(
      'base active',
    )
  })

  it('merges tailwind conflicts', () => {
    // tailwind-merge should resolve conflicting utilities
    expect(cn('px-2', 'px-4')).toBe('px-4')
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('handles empty inputs', () => {
    expect(cn()).toBe('')
    expect(cn('')).toBe('')
  })

  it('handles arrays via clsx', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar')
  })

  it('handles objects via clsx', () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz')
  })
})

describe('countLabel', () => {
  it('uses the singular for one', () => {
    expect(countLabel(1, 'volume')).toBe('1 volume')
  })

  it('uses the plural otherwise', () => {
    expect(countLabel(0, 'chapter')).toBe('0 chapters')
    expect(countLabel(12, 'volume')).toBe('12 volumes')
  })

  it('groups thousands', () => {
    expect(countLabel(1284, 'page')).toBe('1,284 pages')
  })

  it('takes an irregular plural', () => {
    expect(countLabel(3, 'series', 'series')).toBe('3 series')
  })
})

describe('pad2', () => {
  it('pads single digits', () => {
    expect(pad2(7)).toBe('07')
  })

  it('leaves longer numbers alone', () => {
    expect(pad2(42)).toBe('42')
    expect(pad2(120)).toBe('120')
  })
})

describe('stripTitleZeros', () => {
  it('strips leading zeros from volume and chapter numbers', () => {
    expect(stripTitleZeros('Volume 0007')).toBe('Volume 7')
    expect(stripTitleZeros('Chapter 0001')).toBe('Chapter 1')
  })

  it('keeps decimals and other titles', () => {
    expect(stripTitleZeros('Volume 3.5')).toBe('Volume 3.5')
    expect(stripTitleZeros('Prologue')).toBe('Prologue')
  })
})
