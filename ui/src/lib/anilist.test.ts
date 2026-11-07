import { describe, expect, it } from 'vitest'
import { displaySeriesName, partName } from './anilist'

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

describe('displaySeriesName', () => {
  it('drops the year and the AniList ID, known or not', () => {
    expect(displaySeriesName('Jujutsu Kaisen (2018) - 101517')).toBe(
      'Jujutsu Kaisen',
    )
    expect(displaySeriesName('Jujutsu Kaisen (2018) - 101517', 101517)).toBe(
      'Jujutsu Kaisen',
    )
    expect(displaySeriesName('Blade of the Immortal (1993) - 30658')).toBe(
      'Blade of the Immortal',
    )
  })

  it('keeps a short number that is part of the name', () => {
    expect(displaySeriesName('Jujutsu Kaisen 0 (2017) - 105469')).toBe(
      'Jujutsu Kaisen 0',
    )
    expect(displaySeriesName('Mob Psycho 100')).toBe('Mob Psycho 100')
    expect(displaySeriesName('Kingdom - 2')).toBe('Kingdom - 2')
  })
})
