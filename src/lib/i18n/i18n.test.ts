import { afterEach, describe, expect, it, vi } from 'vitest'

/** Loads the modules fresh, with these browser languages and stored preferences. */
async function load(languages: string[], stored: Record<string, unknown> = {}) {
  vi.stubGlobal('location', { hash: '' })
  vi.stubGlobal('navigator', { languages, language: languages[0] })
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k === 'hike-and-fly:preferences' ? JSON.stringify(stored) : null),
    setItem: () => {},
    removeItem: () => {},
  })
  vi.resetModules()
  const { preferences } = await import('../settings.svelte')
  const i18n = await import('./index.svelte')
  return { preferences, ...i18n }
}

afterEach(() => vi.unstubAllGlobals())

describe('language', () => {
  it("follows the browser's first supported language", async () => {
    expect((await load(['it-CH', 'de-CH', 'fr'])).preferences.language).toBe('de')
    expect((await load(['it', 'es'])).preferences.language).toBe('en')
  })

  it('keeps a chosen language over the browser', async () => {
    expect((await load(['de-CH'], { language: 'fr' })).preferences.language).toBe('fr')
  })

  it('switches the messages and the number notation', async () => {
    const { preferences, t, num } = await load(['en'])
    expect(t.language).toBe('Language')
    expect(num(4.25, 1)).toBe('4.3')
    preferences.language = 'fr'
    expect(t.language).toBe('Langue')
    expect(num(4.25, 1)).toBe('4,3')
    preferences.language = 'de'
    expect(t.language).toBe('Sprache')
    expect(num(2161)).toBe('2161')
  })
})
