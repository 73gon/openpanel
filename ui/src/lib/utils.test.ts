import { describe, it, expect } from 'vitest'
import {
  cn,
  countLabel,
  describeDevice,
  formatDuration,
  formatServerDate,
  pad2,
  parseServerDate,
  stripTitleZeros,
  timeAgo,
} from './utils'

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

describe('parseServerDate', () => {
  it('reads SQLite timestamps as UTC', () => {
    expect(parseServerDate('2026-04-07 19:06:55')?.toISOString()).toBe(
      '2026-04-07T19:06:55.000Z',
    )
  })

  it('keeps ISO and RFC 3339 timestamps as they are', () => {
    expect(parseServerDate('2026-10-26T16:42:05Z')?.toISOString()).toBe(
      '2026-10-26T16:42:05.000Z',
    )
    expect(parseServerDate('2026-10-26T18:42:05+02:00')?.toISOString()).toBe(
      '2026-10-26T16:42:05.000Z',
    )
  })

  it('gives null for missing or unreadable values', () => {
    expect(parseServerDate(undefined)).toBeNull()
    expect(parseServerDate(null)).toBeNull()
    expect(parseServerDate('')).toBeNull()
    expect(parseServerDate('not a date')).toBeNull()
  })
})

describe('formatServerDate', () => {
  const day = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  })

  it('formats readable timestamps', () => {
    expect(formatServerDate(day, '2026-04-07 19:06:55')).toBe('Apr 7, 2026')
  })

  it('gives null instead of throwing when there is no date', () => {
    expect(formatServerDate(day, undefined)).toBeNull()
  })
})

describe('timeAgo', () => {
  const now = Date.parse('2026-10-30T12:00:00Z')

  it('says how long ago a server time was', () => {
    expect(timeAgo('2026-10-30 11:59:40', now)).toBe('just now')
    expect(timeAgo('2026-10-30 11:48:00', now)).toBe('12 minutes ago')
    expect(timeAgo('2026-10-30T09:00:00Z', now)).toBe('3 hours ago')
    expect(timeAgo('2026-10-29 10:00:00', now)).toBe('yesterday')
    expect(timeAgo('2026-10-26 12:00:00', now)).toBe('4 days ago')
  })

  it('gives the date past a week, and nothing for no date', () => {
    expect(timeAgo('2026-03-24 19:37:49', now)).toBe('Mar 24, 2026')
    expect(timeAgo(null, now)).toBeNull()
    expect(timeAgo('soon', now)).toBeNull()
  })
})

describe('formatDuration', () => {
  it('uses the two largest units', () => {
    expect(formatDuration(0.4)).toBe('under a second')
    expect(formatDuration(42)).toBe('42 s')
    expect(formatDuration(12 * 60 + 5)).toBe('12 min')
    expect(formatDuration(3 * 3600 + 20 * 60)).toBe('3 h 20 min')
    expect(formatDuration(2 * 3600)).toBe('2 h')
    expect(formatDuration(4 * 86400 + 100)).toBe('4 days')
  })
})

describe('describeDevice', () => {
  it('names the browser and the system', () => {
    expect(
      describeDevice(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari on iPhone')
    expect(
      describeDevice(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
      ),
    ).toBe('Edge on Windows')
    expect(
      describeDevice(
        'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
      ),
    ).toBe('Chrome on Android')
    expect(describeDevice('curl/8.5.0')).toBe('curl')
    expect(describeDevice(null)).toBe('Unknown device')
  })
})
