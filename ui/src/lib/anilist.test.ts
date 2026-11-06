import { describe, expect, it } from 'vitest'
import { partName } from './anilist'

describe('partName', () => {
  it('names a part by its own words when it begins with the story', () => {
    expect(
      partName(
        "JoJo's Bizarre Adventure Part 2 - Battle Tendency (1987) - 31630",
        31630,
        "JoJo's Bizarre Adventure",
      ),
    ).toBe('Part 2 - Battle Tendency')
  })

  it('keeps a name that is the story itself or something else', () => {
    expect(partName('Naruto (1999) - 30011', 30011, 'Naruto')).toBe('Naruto')
    expect(
      partName(
        'Boruto - Naruto Next Generations (2016) - 87178',
        87178,
        'Naruto',
      ),
    ).toBe('Boruto - Naruto Next Generations')
  })
})
