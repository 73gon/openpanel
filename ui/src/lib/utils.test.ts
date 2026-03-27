import { describe, it, expect } from 'vitest'
import { cn } from './utils'

describe('cn (class name merger)', () => {
  it('combines class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    const isActive = true
    const isDisabled = false
    expect(cn('base', isActive && 'active', isDisabled && 'disabled')).toBe('base active')
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
