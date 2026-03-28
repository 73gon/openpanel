/**
 * i18n infrastructure for OpenPanel.
 *
 * Usage:
 *   const { t } = useTranslation()
 *   <span>{t('home')}</span>
 *
 * Adding a new language:
 *   1. Create a new file in ui/src/lib/i18n/locales/<lang>.ts exporting a
 *      `Translations` record (copy en.ts as baseline).
 *   2. Import it in this file and add it to the `locales` map.
 *   3. It will automatically appear in the language switcher.
 */

import { useAppStore } from '@/lib/store'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** All translatable keys. Add new keys here and in each locale file. */
export type TranslationKey = keyof typeof import('./i18n/locales/en').default

export type Translations = Record<TranslationKey, string>

export type Locale = 'en' | 'ja' | 'de' | 'fr' | 'es' | 'pt' | 'zh' | 'ko'

export interface LocaleInfo {
  code: Locale
  label: string
  nativeLabel: string
}

// ---------------------------------------------------------------------------
// Available locales
// ---------------------------------------------------------------------------

import en from './i18n/locales/en'

// Lazy-loaded locale bundles (only English is bundled; others loaded on demand)
const localeLoaders: Record<string, () => Promise<{ default: Translations }>> =
  {
    // Add new locales here as they're created:
    // ja: () => import('./i18n/locales/ja'),
  }

const loadedLocales: Record<string, Translations> = { en }

export const AVAILABLE_LOCALES: LocaleInfo[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  // Future: { code: 'ja', label: 'Japanese', nativeLabel: '日本語' },
]

// ---------------------------------------------------------------------------
// Translation getter
// ---------------------------------------------------------------------------

export async function loadLocale(locale: Locale): Promise<Translations> {
  if (loadedLocales[locale]) return loadedLocales[locale]

  const loader = localeLoaders[locale]
  if (!loader) return en // fallback

  const mod = await loader()
  loadedLocales[locale] = mod.default
  return mod.default
}

export function getTranslation(key: TranslationKey, locale?: Locale): string {
  const lang = locale ?? (useAppStore.getState().locale as Locale) ?? 'en'
  const bundle = loadedLocales[lang] ?? en
  return bundle[key] ?? en[key] ?? key
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export function useTranslation() {
  const locale = useAppStore((s) => s.locale) as Locale
  const bundle = loadedLocales[locale] ?? en

  function t(key: TranslationKey): string {
    return bundle[key] ?? en[key] ?? key
  }

  return { t, locale }
}
