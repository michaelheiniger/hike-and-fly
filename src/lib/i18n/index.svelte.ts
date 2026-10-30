/**
 * Interface text in English, French and German. `t` holds the messages of the language
 * chosen in the preferences; reading it in a template or effect follows a change of
 * language. Each dictionary has the shape of the English one, so a missing translation
 * is a type error.
 */
import { preferences, type Language } from '../settings.svelte'
import { de } from './de'
import { en, type Messages } from './en'
import { fr } from './fr'

export type { Messages }

const MESSAGES: Record<Language, Messages> = { en, fr, de }

/** Each language's own name, and the locale used for numbers and dates (Swiss conventions). */
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', fr: 'Français', de: 'Deutsch' }
const LOCALES: Record<Language, string> = { en: 'en-GB', fr: 'fr-CH', de: 'de-CH' }

export const t: Messages = new Proxy({} as Messages, {
  get: (_, key) => MESSAGES[preferences.language][key as keyof Messages],
})

const formats = new Map<string, Intl.NumberFormat>()

/** A number with `digits` decimals, in the language's notation and without grouping (2161 m). */
export function num(value: number, digits = 0): string {
  const key = `${preferences.language}:${digits}`
  let format = formats.get(key)
  if (!format) {
    format = new Intl.NumberFormat(LOCALES[preferences.language], {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      useGrouping: false,
    })
    formats.set(key, format)
  }
  return format.format(value)
}

/** A count, grouped by thousands (74’150 tiles). */
export const count = (value: number) => value.toLocaleString(LOCALES[preferences.language])

/** A date such as 30 Oct 2026. */
export const date = (iso: string) =>
  new Date(iso).toLocaleDateString(LOCALES[preferences.language], { day: 'numeric', month: 'short', year: 'numeric' })

/** A glide ratio rounded up to a tenth, the conservative side (5.3). */
export const ratio = (gr: number) => num(Math.ceil(gr * 10 - 1e-9) / 10, 1)

/** Meters as kilometers with one decimal (4.2). */
export const km = (meters: number) => num(meters / 1000, 1)

/** A number with as many decimals as it needs, up to three (0.5, 2, 1.25). */
export const decimal = (value: number) =>
  value.toLocaleString(LOCALES[preferences.language], { maximumFractionDigits: 3, useGrouping: false })
